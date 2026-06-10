import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  executeWithIdempotency,
  createMemoryIdempotencyStore,
} from '../../src/runtime/server/utils/idempotency'
import { defineAction } from '../../src/runtime/server/utils/defineAction'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import type { ActionResult, IdempotencyStore, TypedActionHandler } from '../../src/runtime/types'

vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getHeader: vi.fn((event: { headers?: Record<string, string> }, name: string) =>
    event.headers?.[name.toLowerCase()],
  ),
  setHeader: vi.fn((event: { responseHeaders?: Record<string, string> }, name: string, value: string) => {
    if (event.responseHeaders) event.responseHeaders[name] = value
  }),
  readMultipartFormData: vi.fn(),
}))

interface FakeEvent {
  method: string
  path: string
  headers: Record<string, string>
  responseHeaders: Record<string, string>
}

let eventCounter = 0
function makeEvent(key?: string, path = '/api/_actions/pay'): FakeEvent {
  eventCounter++
  return {
    method: 'POST',
    path,
    headers: key ? { 'idempotency-key': key } : {},
    responseHeaders: {},
  }
}

function ok(data: unknown): ActionResult<unknown> {
  return { success: true, data }
}

/* Unique keys per test isolate the module-level default store. */
function uniqueKey(): string {
  return `key-${eventCounter}-${Math.random().toString(36).slice(2)}`
}

describe('executeWithIdempotency', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs normally when no key is present and not required', async () => {
    const run = vi.fn().mockResolvedValue(ok(1))
    const r1 = await executeWithIdempotency(makeEvent() as never, {}, {}, run)
    const r2 = await executeWithIdempotency(makeEvent() as never, {}, {}, run)
    expect(run).toHaveBeenCalledTimes(2)
    expect(r1).toEqual(ok(1))
    expect(r2).toEqual(ok(1))
  })

  it('rejects with 400 when required and no key', async () => {
    const run = vi.fn()
    const result = await executeWithIdempotency(makeEvent() as never, {}, { required: true }, run)
    expect(run).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
      expect(result.error.statusCode).toBe(400)
    }
  })

  it('replays the stored result for a duplicate key + payload', async () => {
    const key = uniqueKey()
    const run = vi.fn().mockResolvedValue(ok({ txId: 42 }))
    const input = { amount: 100 }

    const first = await executeWithIdempotency(makeEvent(key) as never, input, {}, run)
    const replayEvent = makeEvent(key)
    const second = await executeWithIdempotency(replayEvent as never, input, {}, run)

    expect(run).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(replayEvent.responseHeaders['idempotency-replayed']).toBe('true')
  })

  it('rejects key reuse with a different payload (422)', async () => {
    const key = uniqueKey()
    const run = vi.fn().mockResolvedValue(ok(1))

    await executeWithIdempotency(makeEvent(key) as never, { amount: 100 }, {}, run)
    const conflict = await executeWithIdempotency(makeEvent(key) as never, { amount: 999 }, {}, run)

    expect(run).toHaveBeenCalledTimes(1)
    expect(conflict.success).toBe(false)
    if (!conflict.success) {
      expect(conflict.error.code).toBe('IDEMPOTENCY_KEY_REUSE')
      expect(conflict.error.statusCode).toBe(422)
    }
  })

  it('does not store failed results — retries re-run the handler', async () => {
    const key = uniqueKey()
    const failure: ActionResult<unknown> = {
      success: false,
      error: { code: 'SERVER_ERROR', message: 'boom', statusCode: 500 },
    }
    const run = vi.fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(ok('recovered'))

    const first = await executeWithIdempotency(makeEvent(key) as never, {}, {}, run)
    const second = await executeWithIdempotency(makeEvent(key) as never, {}, {}, run)

    expect(run).toHaveBeenCalledTimes(2)
    expect(first.success).toBe(false)
    expect(second).toEqual(ok('recovered'))
  })

  it('concurrent duplicates await the in-flight execution (handler runs once)', async () => {
    const key = uniqueKey()
    let resolveRun!: (value: ActionResult<unknown>) => void
    const run = vi.fn(() => new Promise<ActionResult<unknown>>((resolve) => {
      resolveRun = resolve
    }))

    const p1 = executeWithIdempotency(makeEvent(key) as never, { a: 1 }, {}, run)
    const p2 = executeWithIdempotency(makeEvent(key) as never, { a: 1 }, {}, run)

    /* run() starts after the async store lookup — flush microtasks first */
    await new Promise(resolve => setTimeout(resolve, 0))
    resolveRun(ok('once'))
    const [r1, r2] = await Promise.all([p1, p2])

    expect(run).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(ok('once'))
    expect(r2).toEqual(ok('once'))
  })

  it('concurrent duplicate with a different payload conflicts immediately', async () => {
    const key = uniqueKey()
    let resolveRun!: (value: ActionResult<unknown>) => void
    const run = vi.fn(() => new Promise<ActionResult<unknown>>((resolve) => {
      resolveRun = resolve
    }))

    const p1 = executeWithIdempotency(makeEvent(key) as never, { a: 1 }, {}, run)
    const conflict = await executeWithIdempotency(makeEvent(key) as never, { a: 2 }, {}, run)

    expect(conflict.success).toBe(false)
    if (!conflict.success) expect(conflict.error.code).toBe('IDEMPOTENCY_KEY_REUSE')

    resolveRun(ok(1))
    await p1
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('scopes keys per path — same key on different actions does not collide', async () => {
    const key = uniqueKey()
    const run = vi.fn()
      .mockResolvedValueOnce(ok('pay'))
      .mockResolvedValueOnce(ok('refund'))

    const r1 = await executeWithIdempotency(makeEvent(key, '/api/_actions/pay') as never, {}, {}, run)
    const r2 = await executeWithIdempotency(makeEvent(key, '/api/_actions/refund') as never, {}, {}, run)

    expect(run).toHaveBeenCalledTimes(2)
    expect(r1).toEqual(ok('pay'))
    expect(r2).toEqual(ok('refund'))
  })

  it('uses a custom key resolver over the header', async () => {
    const key = uniqueKey()
    const run = vi.fn().mockResolvedValue(ok(1))
    const config = { key: () => key }

    await executeWithIdempotency(makeEvent() as never, {}, config, run)
    await executeWithIdempotency(makeEvent() as never, {}, config, run)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('treats a null resolver result as "no key"', async () => {
    const run = vi.fn().mockResolvedValue(ok(1))
    const config = { key: () => null }

    await executeWithIdempotency(makeEvent() as never, {}, config, run)
    await executeWithIdempotency(makeEvent() as never, {}, config, run)

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('reads the key from a custom header name', async () => {
    const run = vi.fn().mockResolvedValue(ok(1))
    const key = uniqueKey()
    const event1 = makeEvent()
    event1.headers['x-request-id'] = key
    const event2 = makeEvent()
    event2.headers['x-request-id'] = key

    await executeWithIdempotency(event1 as never, {}, { header: 'x-request-id' }, run)
    await executeWithIdempotency(event2 as never, {}, { header: 'x-request-id' }, run)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('uses a custom store when provided', async () => {
    const records = new Map<string, never>()
    const store: IdempotencyStore = {
      get: vi.fn((k: string) => records.get(k) ?? null),
      set: vi.fn((k: string, record) => {
        records.set(k, record as never)
      }),
    }
    const key = uniqueKey()
    const run = vi.fn().mockResolvedValue(ok(1))

    await executeWithIdempotency(makeEvent(key) as never, {}, { store }, run)
    await executeWithIdempotency(makeEvent(key) as never, {}, { store }, run)

    expect(store.set).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('idempotency integration', () => {
  it('defineAction replays duplicates via the idempotency option', async () => {
    const handler = vi.fn().mockResolvedValue({ tx: 1 })
    const action = defineAction({ idempotency: {}, handler }) as unknown as TypedActionHandler

    const key = uniqueKey()
    const r1 = await action._execute({ amount: 5 }, makeEvent(key) as never)
    const r2 = await action._execute({ amount: 5 }, makeEvent(key) as never)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(r2).toEqual(r1)
    expect(r1).toEqual(ok({ tx: 1 }))
  })

  it('defineAction without the option never touches idempotency', async () => {
    const handler = vi.fn().mockResolvedValue({ tx: 1 })
    const action = defineAction({ handler }) as unknown as TypedActionHandler

    const key = uniqueKey()
    await action._execute({}, makeEvent(key) as never)
    await action._execute({}, makeEvent(key) as never)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('createActionClient().idempotency() flows into the built action', async () => {
    const handler = vi.fn().mockResolvedValue({ tx: 9 })
    const action = createActionClient()
      .idempotency()
      .action(handler) as unknown as TypedActionHandler

    const key = uniqueKey()
    const r1 = await action._execute({ amount: 1 }, makeEvent(key) as never)
    const r2 = await action._execute({ amount: 1 }, makeEvent(key) as never)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(r2).toEqual(r1)
  })
})

describe('createMemoryIdempotencyStore', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and returns records within the TTL', () => {
    const store = createMemoryIdempotencyStore()
    const record = { fingerprint: 'f', result: ok(1) }
    store.set('a', record, 1000)
    expect(store.get('a')).toEqual(record)
  })

  it('expires records after the TTL and prunes them on read', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const store = createMemoryIdempotencyStore()
    store.set('a', { fingerprint: 'f', result: ok(1) }, 1000)

    vi.setSystemTime(999)
    expect(store.get('a')).not.toBeNull()

    vi.setSystemTime(1000)
    expect(store.get('a')).toBeNull()
  })

  it('returns null for unknown keys', () => {
    const store = createMemoryIdempotencyStore()
    expect(store.get('missing')).toBeNull()
  })
})
