import { describe, it, expect, vi } from 'vitest'
import {
  executeWithIdempotency,
  createMemoryIdempotencyStore,
} from '../../src/runtime/server/utils/idempotency'
import type { ActionResult, IdempotencyRecord, IdempotencyStore } from '../../src/runtime/types'

vi.mock('h3', () => ({
  defineEventHandler: (h: (e: unknown) => unknown) => h,
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getHeader: vi.fn((event: { headers?: Record<string, string> }, name: string) =>
    event.headers?.[name.toLowerCase()],
  ),
  setHeader: vi.fn(),
  readMultipartFormData: vi.fn(),
}))

function ok(data: unknown): ActionResult<unknown> {
  return { success: true, data }
}

function makeGate() {
  let open!: () => void
  const promise = new Promise<void>((res) => {
    open = () => res()
  })
  return { promise, open }
}

/* A store whose get() yields on the microtask queue, like a real Redis client. */
function asyncStore(): IdempotencyStore {
  const map = new Map<string, IdempotencyRecord>()
  return {
    async get(key) {
      await Promise.resolve()
      return map.get(key) ?? null
    },
    async set(key, record) {
      await Promise.resolve()
      map.set(key, record)
    },
  }
}

let n = 0
function event(key: string, path = '/api/_actions/pay') {
  return { method: 'POST', path, headers: { 'idempotency-key': key } }
}

describe('A4: idempotency TOCTOU with async stores', () => {
  it('two concurrent duplicates run the handler exactly once (async store)', async () => {
    const store = asyncStore()
    const gate = makeGate()
    const run = vi.fn(async () => {
      await gate.promise
      return ok('charged')
    })
    const key = `k-${++n}`

    const p1 = executeWithIdempotency(event(key) as never, { amount: 1 }, { store }, run)
    const p2 = executeWithIdempotency(event(key) as never, { amount: 1 }, { store }, run)

    gate.open()
    const [r1, r2] = await Promise.all([p1, p2])

    expect(run).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(ok('charged'))
    expect(r2).toEqual(ok('charged'))
  })

  it('concurrent duplicate with a different payload conflicts without a second run', async () => {
    const store = asyncStore()
    const gate = makeGate()
    const run = vi.fn(async () => {
      await gate.promise
      return ok(1)
    })
    const key = `k-${++n}`

    const p1 = executeWithIdempotency(event(key) as never, { a: 1 }, { store }, run)
    const conflict = await executeWithIdempotency(event(key) as never, { a: 2 }, { store }, run)

    expect(conflict.success).toBe(false)
    if (!conflict.success) expect(conflict.error.code).toBe('IDEMPOTENCY_KEY_REUSE')

    gate.open()
    await p1
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('A4: injective store key (no delimiter collision)', () => {
  it('scope+key cannot collide across principals via the ":" delimiter', async () => {
    const store = createMemoryIdempotencyStore()
    const run = vi.fn()
      .mockResolvedValueOnce(ok('victim'))
      .mockResolvedValueOnce(ok('attacker'))

    // victim: scope "acme:42", key "abc"
    const r1 = await executeWithIdempotency(
      event('abc') as never, { x: 1 }, { store, scope: () => 'acme:42' }, run,
    )
    // attacker: scope "acme", key "42:abc" — naive "path:scope:key" would collide
    const r2 = await executeWithIdempotency(
      event('42:abc') as never, { x: 1 }, { store, scope: () => 'acme' }, run,
    )

    expect(run).toHaveBeenCalledTimes(2)
    expect(r1).toEqual(ok('victim'))
    expect(r2).toEqual(ok('attacker'))
  })

  it('ignores the query string so one logical action maps to one key', async () => {
    const store = createMemoryIdempotencyStore()
    const run = vi.fn().mockResolvedValue(ok(1))
    const key = `k-${++n}`

    await executeWithIdempotency(event(key, '/api/_actions/pay?t=1') as never, {}, { store }, run)
    await executeWithIdempotency(event(key, '/api/_actions/pay?t=2') as never, {}, { store }, run)

    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('A4: fingerprint is a constant-size digest', () => {
  it('stores a fixed-length hash regardless of payload size', async () => {
    const captured: IdempotencyRecord[] = []
    const store: IdempotencyStore = {
      get: () => null,
      set: (_k, record) => {
        captured.push(record)
      },
    }
    const huge = { blob: 'x'.repeat(100_000) }
    await executeWithIdempotency(event(`k-${++n}`) as never, huge, { store }, () => Promise.resolve(ok(1)))

    expect(captured).toHaveLength(1)
    expect(captured[0].fingerprint).toHaveLength(64) // sha256 hex
  })
})
