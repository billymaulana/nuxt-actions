import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick, effectScope } from 'vue'
import { useOptimisticAction } from '../../src/runtime/composables/useOptimisticAction'
import { useInfiniteActionQuery } from '../../src/runtime/composables/useInfiniteActionQuery'
import { executeWithIdempotency } from '../../src/runtime/server/utils/idempotency'
import { stableStringify } from '../../src/runtime/composables/_utils'
import type { ActionResult } from '../../src/runtime/types'

const mockFetch = vi.fn()
vi.mock('#app', () => ({
  useNuxtApp: () => ({ $fetch: mockFetch, callHook: vi.fn().mockResolvedValue(undefined) }),
  useAsyncData: (...a: unknown[]) => mockUseAsyncData(...a as [string, () => Promise<unknown>, unknown]),
}))

vi.mock('h3', () => ({
  defineEventHandler: (h: (e: unknown) => unknown) => h,
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getHeader: vi.fn((event: { headers?: Record<string, string> }, name: string) => event.headers?.[name.toLowerCase()]),
  setHeader: vi.fn(),
  readMultipartFormData: vi.fn(),
}))

const mockRefresh = vi.fn()
const mockClear = vi.fn()
const mockUseAsyncData = vi.fn((_k: string, handler: () => Promise<unknown>) => {
  const data = ref<unknown>(null)
  const status = ref('idle')
  const clear = vi.fn(() => {
    data.value = null
    mockClear()
  })
  const result = { data, status, pending: ref(false), refresh: mockRefresh, clear }
  Promise.resolve(handler()).then((r) => {
    data.value = r
    status.value = 'success'
  })
  return result
})

function actionRef(path: string, method = 'GET') {
  return { __actionPath: path, __actionMethod: method, _types: {} as { readonly input: unknown, readonly output: unknown } } as never
}
async function flush() {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}
function ok(d: unknown): ActionResult<unknown> {
  return { success: true, data: d }
}
function ev(key: string, path = '/api/_actions/pay') {
  return { method: 'POST', path, headers: { 'idempotency-key': key } }
}

describe('iter2: useOptimisticAction superseded stale result does not clobber the latest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('an already-settled call A that loses the race to B never overwrites B (error variant)', async () => {
    /* A resolves immediately to a failure; one microtask later B fires and stays pending. */
    mockFetch
      .mockResolvedValueOnce({ success: false, error: { code: 'ERR', message: 'x', statusCode: 500 } })
      .mockReturnValueOnce(new Promise(() => {}))

    const todos = ref([{ id: 1, done: false }, { id: 2, done: false }])
    const action = useOptimisticAction('/api/toggle', {
      currentData: todos,
      updateFn: (input: { id: number }, current: Array<{ id: number, done: boolean }>) =>
        current.map(t => (t.id === input.id ? { ...t, done: !t.done } : t)),
    })

    const pA = action.execute({ id: 1 })
    await Promise.resolve() // one microtask gap so A's resolve is queued
    void action.execute({ id: 2 }) // B becomes latest, applies optimistic, status=executing

    await pA // A's stale error continuation runs

    // B's optimistic update on id:2 must survive (A's error must NOT roll back
    // to a pre-B snapshot), and B's executing state must not flip to error.
    const todo2 = (action.optimisticData.value as Array<{ id: number, done: boolean }>).find(t => t.id === 2)
    expect(todo2?.done).toBe(true)
    expect(action.status.value).toBe('executing')
    expect(action.error.value).toBeNull()
  })

  it('an already-settled successful call A never overwrites B', async () => {
    mockFetch
      .mockResolvedValueOnce({ success: true, data: [{ id: 1, done: true }] })
      .mockReturnValueOnce(new Promise(() => {}))

    const todos = ref([{ id: 1, done: false }])
    const action = useOptimisticAction('/api/toggle', {
      currentData: todos,
      updateFn: (_i: unknown, current: Array<{ id: number, done: boolean }>) => current.map(t => ({ ...t, done: true })),
    })

    const pA = action.execute({ id: 1 })
    await Promise.resolve()
    void action.execute({ id: 1 })
    await pA

    expect(action.status.value).toBe('executing')
  })
})

describe('iter2: idempotency store/resolver outage returns a typed result, not a raw throw', () => {
  it('a rejecting store.get fails closed with IDEMPOTENCY_STORE_ERROR (handler not run)', async () => {
    const store = { get: () => Promise.reject(new Error('redis down')), set: () => {} }
    const run = vi.fn().mockResolvedValue(ok('charged'))

    const result = await executeWithIdempotency(ev('k1') as never, {}, { store }, run)

    expect(run).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('IDEMPOTENCY_STORE_ERROR')
      expect(result.error.statusCode).toBe(503)
    }
  })

  it('a throwing scope resolver fails closed with IDEMPOTENCY_STORE_ERROR', async () => {
    const run = vi.fn().mockResolvedValue(ok(1))
    const result = await executeWithIdempotency(ev('k2') as never, {}, {
      scope: () => { throw new Error('auth lookup failed') },
    }, run)

    expect(run).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('IDEMPOTENCY_STORE_ERROR')
  })
})

describe('iter2: binary fingerprint is a 64-bit digest', () => {
  it('summarizes binary with a 16-hex digest', () => {
    const out = stableStringify(new Uint8Array([1, 2, 3, 4]))
    const m = out.match(/"([0-9a-f]+)"\]$/)
    expect(m?.[1]).toHaveLength(16)
  })
})

describe('iter2: useInfiniteActionQuery fetchNextPage races refresh()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a next page resolving after refresh() is discarded', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { id: 1, cursor: 'c2' } })
    const { pages, fetchNextPage, refresh } = useInfiniteActionQuery(actionRef('list'), undefined, {
      getNextPageParam: (p: { cursor?: string }) => p.cursor,
    })
    await flush()
    expect(pages.value).toHaveLength(1)

    // hold the next-page fetch pending, start it, then refresh mid-flight
    let resolveNext!: (v: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((r) => {
      resolveNext = r
    }))
    const nextPromise = fetchNextPage()
    await refresh()

    resolveNext({ success: true, data: { id: 99, cursor: 'stale' } })
    await nextPromise

    // the stale page must NOT be appended onto the refreshed list
    expect(pages.value).toHaveLength(1)
  })

  it('a next-page fetch that REJECTS after refresh() is also discarded', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { id: 1, cursor: 'c2' } })
    const { pages, error, fetchNextPage, refresh } = useInfiniteActionQuery(actionRef('list'), undefined, {
      getNextPageParam: (p: { cursor?: string }) => p.cursor,
    })
    await flush()

    let rejectNext!: (e: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((_r, reject) => {
      rejectNext = reject
    }))
    const nextPromise = fetchNextPage()
    await refresh()

    rejectNext(new Error('network'))
    await nextPromise

    // the stale rejection must not set error after the refresh reset
    expect(error.value).toBeNull()
    expect(pages.value).toHaveLength(1)
  })

  it('applies a transform to the first page', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { n: 2 } })
    const { data } = useInfiniteActionQuery(actionRef('list'), undefined, {
      getNextPageParam: () => undefined,
      transform: (d: { n: number }) => ({ n: d.n * 10 }),
    })
    await flush()
    expect(data.value).toEqual({ n: 20 })
  })
})

describe('iter3: useInfiniteActionQuery surfaces a first-page envelope error', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a {success:false} first page exposes error (not silently swallowed)', async () => {
    mockFetch.mockResolvedValue({ success: false, error: { code: 'FORBIDDEN', message: 'no', statusCode: 403 } })
    const { pages, data, error } = useInfiniteActionQuery(actionRef('list'), undefined, {
      getNextPageParam: () => undefined,
    })
    await flush()

    expect(pages.value).toHaveLength(0)
    expect(data.value).toBeNull()
    expect(error.value).toEqual({ code: 'FORBIDDEN', message: 'no', statusCode: 403 })
  })
})

describe('iter3: a throwing first-page transform degrades gracefully', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not crash render; pages falls back to raw data', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { raw: true } })
    const { pages, data } = useInfiniteActionQuery(actionRef('list'), undefined, {
      getNextPageParam: () => undefined,
      transform: () => { throw new Error('bad transform') },
    })
    await flush()

    expect(() => pages.value).not.toThrow()
    expect(() => data.value).not.toThrow()
    expect(data.value).toEqual({ raw: true }) // degraded to untransformed
  })
})

describe('iter3: useOptimisticAction superseded timeout does not clobber the latest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a timed-out call superseded before its catch runs leaves the latest call clean', async () => {
    vi.useFakeTimers()
    // A: hangs until its timeout aborts it. B: resolves success.
    mockFetch
      .mockImplementationOnce((_p: string, opts: { signal: AbortSignal }) =>
        new Promise((_r, reject) => {
          opts.signal.addEventListener('abort', () => setTimeout(() => reject(Object.assign(new Error('a'), { name: 'FetchError', cause: new DOMException('a', 'AbortError') })), 1))
        }),
      )
      .mockResolvedValueOnce({ success: true, data: { v: 'B' } })

    const src = ref({ v: 'init' })
    const action = useOptimisticAction('/api/x', {
      timeout: 20,
      currentData: src,
      updateFn: (input: { v: string }) => ({ v: input.v }),
    })

    const pA = action.execute({ v: 'A' })
    vi.advanceTimersByTime(20) // A's timeout fires (timedOut, abort) — catch not yet run
    const pB = action.execute({ v: 'B' }) // B supersedes A before A's catch drains
    await vi.advanceTimersByTimeAsync(5)
    await Promise.all([pA, pB])

    // Final state must be fully B's — no stale TIMEOUT_ERROR, no reverted optimistic
    expect(action.status.value).toBe('success')
    expect(action.error.value).toBeNull()
    expect(action.optimisticData.value).toEqual({ v: 'B' })
    vi.useRealTimers()
  })
})

describe('iter2: getNextPageParam that throws degrades to no-next-page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not crash; hasNextPage becomes false', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { items: undefined } })
    const { hasNextPage } = useInfiniteActionQuery(actionRef('list'), undefined, {
      getNextPageParam: (p: { items: { length: number } }) => (p.items.length > 0 ? 1 : undefined),
    })
    await flush()
    expect(() => hasNextPage.value).not.toThrow()
    expect(hasNextPage.value).toBe(false)
  })
})

describe('iter2: a successful first page with undefined data still counts as a page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pages has length 1 and getNextPageParam runs on it', async () => {
    mockFetch.mockResolvedValue({ success: true, data: undefined })
    const getNext = vi.fn(() => undefined)
    const { pages, data } = useInfiniteActionQuery(actionRef('list'), undefined, { getNextPageParam: getNext })
    await flush()

    expect(pages.value).toHaveLength(1)
    expect(data.value).toBeUndefined()
  })
})

describe('iter2: effectScope dispose ignores a late next page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a next page resolving after dispose is not appended', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { id: 1, cursor: 'c2' } })
    const scope = effectScope()
    let api: ReturnType<typeof useInfiniteActionQuery> | undefined
    scope.run(() => {
      api = useInfiniteActionQuery(actionRef('list'), undefined, { getNextPageParam: (p: { cursor?: string }) => p.cursor })
    })
    await flush()

    let resolveNext!: (v: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((r) => {
      resolveNext = r
    }))
    const p = api!.fetchNextPage()
    scope.stop()

    resolveNext({ success: true, data: { id: 99 } })
    await p
    expect(api!.pages.value).toHaveLength(1)
  })
})
