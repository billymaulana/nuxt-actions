import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useAction } from '../../src/runtime/composables/useAction'
import { useOptimisticAction } from '../../src/runtime/composables/useOptimisticAction'
import { useFormAction } from '../../src/runtime/composables/useFormAction'
import { stableStringify, isAbortRejection } from '../../src/runtime/composables/_utils'
import {
  executeWithIdempotency,
  createMemoryIdempotencyStore,
} from '../../src/runtime/server/utils/idempotency'
import type { ActionResult } from '../../src/runtime/types'

const mockFetch = vi.fn()

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
    callHook: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getHeader: vi.fn((event: { headers?: Record<string, string> }, name: string) =>
    event.headers?.[name.toLowerCase()],
  ),
  setHeader: vi.fn(),
  readMultipartFormData: vi.fn(),
}))

/*
 * Real ofetch never rethrows the raw DOMException: it wraps rejections in a
 * FetchError with the original AbortError on `cause`. These tests use that
 * realistic shape to guard the abort-detection path end-to-end.
 */
function ofetchAbortRejection(): Error {
  return Object.assign(new Error('[POST] "/api/test": <no response> The operation was aborted.'), {
    name: 'FetchError',
    cause: new DOMException('The operation was aborted.', 'AbortError'),
  })
}

function fetchOnSignalAbort() {
  return (_path: string, opts: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(ofetchAbortRejection()))
    })
}

describe('abort detection with realistic ofetch rejections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isAbortRejection detects FetchError-wrapped aborts and aborted signals', () => {
    expect(isAbortRejection(ofetchAbortRejection())).toBe(true)
    expect(isAbortRejection(new DOMException('x', 'AbortError'))).toBe(true)
    const controller = new AbortController()
    controller.abort()
    expect(isAbortRejection(new Error('anything'), controller.signal)).toBe(true)
    expect(isAbortRejection(new Error('plain'))).toBe(false)
    expect(isAbortRejection(null)).toBe(false)
  })

  it('useAction cancel() settles as ABORT_ERROR (not FETCH_ERROR) and keeps data', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, data: { id: 1 } })
    const action = useAction('/api/test')
    await action.execute({})

    mockFetch.mockImplementationOnce(fetchOnSignalAbort())
    const promise = action.execute({})
    action.cancel()
    const result = await promise

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('ABORT_ERROR')
    expect(action.error.value).toBeNull()
    expect(action.status.value).toBe('idle')
    expect(action.data.value).toEqual({ id: 1 })
  })

  it('useOptimisticAction cancel() keeps the optimistic state (no rollback)', async () => {
    const todos = ref([{ id: 1, done: false }])
    mockFetch.mockImplementationOnce(fetchOnSignalAbort())

    const action = useOptimisticAction('/api/toggle', {
      currentData: todos,
      updateFn: (input: { id: number }, current: Array<{ id: number, done: boolean }>) =>
        current.map(t => (t.id === input.id ? { ...t, done: !t.done } : t)),
    })

    const promise = action.execute({ id: 1 })
    action.cancel()
    const result = await promise

    if (!result.success) expect(result.error.code).toBe('ABORT_ERROR')
    expect(action.optimisticData.value).toEqual([{ id: 1, done: true }])
    expect(action.error.value).toBeNull()
  })

  it('a stale aborted request never clobbers the newer request state', async () => {
    let resolveSecond!: (value: unknown) => void
    mockFetch
      .mockImplementationOnce(fetchOnSignalAbort())
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecond = resolve
      }))

    const action = useAction('/api/search', { cancelPrevious: true })
    const p1 = action.execute({ q: 'a' })
    const p2 = action.execute({ q: 'ab' })

    await p1
    expect(action.status.value).toBe('executing')

    resolveSecond({ success: true, data: { items: [1] } })
    await p2
    expect(action.status.value).toBe('success')
  })

  it('cancel() also flushes a pending debounced execution', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ success: true, data: 1 })
    const action = useAction('/api/test', { debounce: 200 })

    const pending = action.execute({}).catch(() => 'cancelled')
    action.cancel()
    vi.advanceTimersByTime(250)

    expect(await pending).toBe('cancelled')
    expect(mockFetch).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('optimistic cancel() also flushes a pending debounced execution', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ success: true, data: 1 })
    const todos = ref([{ id: 1, done: false }])
    const action = useOptimisticAction('/api/toggle', {
      debounce: 200,
      currentData: todos,
      updateFn: (_input: unknown, current: Array<{ id: number, done: boolean }>) => current,
    })

    const pending = action.execute({ id: 1 }).catch(() => 'cancelled')
    action.cancel()
    vi.advanceTimersByTime(250)

    expect(await pending).toBe('cancelled')
    expect(mockFetch).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('non-Error rejections on the latest call', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('optimistic generic path uses the fallback message and rolls back', async () => {
    const todos = ref([{ id: 1, done: false }])
    mockFetch.mockRejectedValueOnce('string error')

    const action = useOptimisticAction('/api/toggle', {
      currentData: todos,
      updateFn: (_input: unknown, current: Array<{ id: number, done: boolean }>) =>
        current.map(t => ({ ...t, done: true })),
    })

    const result = await action.execute({ id: 1 })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('FETCH_ERROR')
      expect(result.error.message).toBe('Failed to execute action')
    }
    expect(action.optimisticData.value).toEqual([{ id: 1, done: false }])
  })
})

describe('retry delay default', () => {
  it('applies the documented 500ms default for object configs without delay', async () => {
    const { buildFetchOptions } = await import('../../src/runtime/composables/_utils')
    const opts = buildFetchOptions({ method: 'POST', input: {}, retry: { count: 2 } })
    expect(opts.retryDelay).toBe(500)
  })
})

describe('stableStringify binary handling', () => {
  it('summarizes typed arrays instead of serializing every byte', () => {
    const big = new Uint8Array(1024 * 64).fill(7)
    const out = stableStringify({ file: big })
    expect(out.length).toBeLessThan(200)
    expect(out).toContain('__binary__')
    expect(out).toContain(String(big.byteLength))
  })

  it('produces identical fingerprints for identical bytes and different ones otherwise', () => {
    const a1 = new Uint8Array([1, 2, 3])
    const a2 = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([9, 9, 9])
    expect(stableStringify(a1)).toBe(stableStringify(a2))
    expect(stableStringify(a1)).not.toBe(stableStringify(b))
  })

  it('handles raw ArrayBuffers', () => {
    const buf = new Uint8Array([5, 6]).buffer
    expect(stableStringify(buf)).toContain('__binary__')
  })
})

describe('idempotency hardening', () => {
  let pathCounter = 0
  function makeEvent(key: string): { method: string, path: string, headers: Record<string, string> } {
    return {
      method: 'POST',
      path: `/api/_actions/h-${++pathCounter}`,
      headers: { 'idempotency-key': key },
    }
  }
  function ok(data: unknown): ActionResult<unknown> {
    return { success: true, data }
  }

  it('a rejecting store.set never fails the successful response', async () => {
    const store = {
      get: () => null,
      set: () => Promise.reject(new Error('redis down')),
    }
    const run = vi.fn().mockResolvedValue(ok('charged'))
    const event = makeEvent('k1')

    const result = await executeWithIdempotency(event as never, {}, { store }, run)
    expect(result).toEqual(ok('charged'))
  })

  it('scope isolates identical keys between identities', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(ok('alice'))
      .mockResolvedValueOnce(ok('bob'))
    const event = makeEvent('shared-key')
    const path = event.path

    const configFor = (user: string) => ({ scope: () => user })
    const r1 = await executeWithIdempotency({ ...event, path } as never, {}, configFor('alice'), run)
    const r2 = await executeWithIdempotency({ ...event, path } as never, {}, configFor('bob'), run)

    expect(run).toHaveBeenCalledTimes(2)
    expect(r1).toEqual(ok('alice'))
    expect(r2).toEqual(ok('bob'))
  })

  it('memory store evicts the oldest entries beyond maxEntries', () => {
    const store = createMemoryIdempotencyStore({ maxEntries: 2 })
    const record = (n: number) => ({ fingerprint: 'f', result: ok(n) })
    store.set('a', record(1), 60_000)
    store.set('b', record(2), 60_000)
    store.set('c', record(3), 60_000)

    expect(store.get('a')).toBeNull()
    expect(store.get('b')).not.toBeNull()
    expect(store.get('c')).not.toBeNull()
  })

  it('memory store expires entries lazily on read', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const store = createMemoryIdempotencyStore()
    store.set('a', { fingerprint: 'f', result: ok(1) }, 1000)
    vi.setSystemTime(1000)
    expect(store.get('a')).toBeNull()
    vi.useRealTimers()
  })
})

describe('useFormAction option passthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards cancelPrevious and exposes cancel()', async () => {
    let firstSignal: AbortSignal | undefined
    mockFetch
      .mockImplementationOnce((_path: string, opts: { signal: AbortSignal }) => {
        firstSignal = opts.signal
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(ofetchAbortRejection()))
        })
      })
      .mockResolvedValueOnce({ success: true, data: { id: 2 } })

    const form = useFormAction<{ name: string }, { id: number }>('/api/register', {
      initialValues: { name: 'a' },
      cancelPrevious: true,
    })

    const p1 = form.submit()
    const p2 = form.submit()
    expect(firstSignal?.aborted).toBe(true)
    await Promise.all([p1, p2])

    expect(typeof form.cancel).toBe('function')
    expect(() => form.cancel()).not.toThrow()
  })

  it('forwards transform to the underlying action', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, data: { id: 1 } })
    const form = useFormAction<{ name: string }, { id: number }>('/api/register', {
      initialValues: { name: 'a' },
      transform: data => ({ id: data.id * 10 }),
    })
    await form.submit()
    expect(form.data.value).toEqual({ id: 10 })
  })
})
