import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAction } from '../../src/runtime/composables/useAction'
import { useOptimisticAction } from '../../src/runtime/composables/useOptimisticAction'
import { ref } from 'vue'
import { createDebouncedFn, createThrottledFn, raceAbort } from '../../src/runtime/composables/_utils'

const mockFetch = vi.fn()
vi.mock('#app', () => ({
  useNuxtApp: () => ({ $fetch: mockFetch, callHook: vi.fn().mockResolvedValue(undefined) }),
}))

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeGate() {
  let open!: () => void
  const promise = new Promise<void>((res) => {
    open = () => res()
  })
  return { promise, open }
}

function ofetchAbort() {
  return Object.assign(new Error('aborted'), {
    name: 'FetchError',
    cause: new DOMException('aborted', 'AbortError'),
  })
}

/* Rejects only when the request's own signal aborts. */
function fetchAbortable(d: { promise: Promise<unknown> }) {
  return (_p: string, opts: { signal: AbortSignal }) => {
    opts.signal.addEventListener('abort', () => {
      /* surface as ofetch would */
    })
    return Promise.race([
      d.promise,
      new Promise((_r, reject) => opts.signal.addEventListener('abort', () => reject(ofetchAbort()))),
    ])
  }
}

describe('A2: stale response never clobbers newer state (default concurrent)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a slow first response does not overwrite the newer succeeded state', async () => {
    const slow = deferred<unknown>()
    mockFetch
      .mockReturnValueOnce(slow.promise) // call 1 — slow
      .mockResolvedValueOnce({ success: true, data: { q: 'ab' } }) // call 2 — fast

    const action = useAction('/api/search') // no dedupe — concurrent allowed
    const p1 = action.execute({ q: 'a' })
    const p2 = action.execute({ q: 'ab' })

    await p2
    expect(action.data.value).toEqual({ q: 'ab' })
    expect(action.status.value).toBe('success')

    // Now the stale first call finally resolves with old data
    slow.resolve({ success: true, data: { q: 'a' } })
    const r1 = await p1
    expect(r1).toEqual({ success: true, data: { q: 'a' } }) // caller still sees its own result

    // ...but the shared reactive state is NOT clobbered by the stale call
    expect(action.data.value).toEqual({ q: 'ab' })
    expect(action.status.value).toBe('success')
  })

  it('a stale errored response does not flip status away from the newer success', async () => {
    const slow = deferred<unknown>()
    mockFetch
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ success: true, data: 'ok' })

    const action = useAction('/api/x')
    const p1 = action.execute({ n: 1 })
    await action.execute({ n: 2 })
    expect(action.status.value).toBe('success')

    slow.resolve({ success: false, error: { code: 'SERVER_ERROR', message: 'boom', statusCode: 500 } })
    await p1
    expect(action.status.value).toBe('success')
    expect(action.error.value).toBeNull()
  })
})

describe('A2: cancel()/reset() reach every in-flight request', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cancel() aborts a straggler that the latest-call tracking already cleared', async () => {
    const d1 = deferred<unknown>()
    const d2 = deferred<unknown>()
    const signals: AbortSignal[] = []
    mockFetch.mockImplementation((_p: string, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal)
      const d = signals.length === 1 ? d1 : d2
      return fetchAbortable(d)(_p, opts)
    })

    const action = useAction('/api/x') // concurrent
    const p1 = action.execute({ n: 1 })
    const p2 = action.execute({ n: 2 })

    // second finishes first and clears "latest" tracking
    d2.resolve({ success: true, data: 2 })
    await p2

    // first is still in flight; cancel() must still reach it
    action.cancel()
    expect(signals[0].aborted).toBe(true)

    d1.reject(ofetchAbort())
    const r1 = await p1
    expect(r1.success).toBe(false)
  })
})

describe('A2: timeout settles immediately during retry backoff', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves with TIMEOUT_ERROR at the deadline, not after the backoff sleep', async () => {
    vi.useFakeTimers()
    // Simulate ofetch sitting in a long backoff sleep that ignores the signal
    mockFetch.mockImplementation((_p: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        // ofetch only rejects long after; the composable must not wait for it
        opts.signal.addEventListener('abort', () => {
          setTimeout(() => reject(ofetchAbort()), 100_000)
        })
      }),
    )

    const action = useAction('/api/x', { timeout: 1000, retry: { count: 3, delay: 5000 } })
    const promise = action.execute({})

    vi.advanceTimersByTime(1000) // hit the timeout deadline
    await vi.advanceTimersByTimeAsync(0)

    const result = await promise
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('TIMEOUT_ERROR')
    expect(action.error.value?.statusCode).toBe(408)
    vi.useRealTimers()
  })
})

describe('raceAbort', () => {
  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(raceAbort(Promise.resolve('x'), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('resolves with the promise value when not aborted', async () => {
    const controller = new AbortController()
    await expect(raceAbort(Promise.resolve('ok'), controller.signal)).resolves.toBe('ok')
  })

  it('rejects with the promise error when the promise rejects first', async () => {
    const controller = new AbortController()
    await expect(raceAbort(Promise.reject(new Error('boom')), controller.signal)).rejects.toThrow('boom')
  })
})

describe('A2: timeout on a superseded call does not clobber the newer executing call', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a stale call timing out leaves the latest call executing and error-free', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation((_p: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => setTimeout(() => reject(ofetchAbort()), 100_000))
      }),
    )
    const action = useAction('/api/x', { timeout: 500 }) // concurrent (no dedupe)

    const p1 = action.execute({ n: 1 }) // timeout fires at t=500
    vi.advanceTimersByTime(200)
    void action.execute({ n: 2 }) // latest; timeout fires at t=700

    vi.advanceTimersByTime(300) // t=500 — call 1 times out while call 2 is latest
    await vi.advanceTimersByTimeAsync(0)

    const r1 = await p1
    expect(r1.success).toBe(false)
    if (!r1.success) expect(r1.error.code).toBe('TIMEOUT_ERROR')
    // The stale timeout must not write error/status — call 2 is still in flight
    expect(action.status.value).toBe('executing')
    expect(action.error.value).toBeNull()
    vi.useRealTimers()
  })
})

describe('A2: timeout on a superseded call does not clobber the latest (useOptimistic)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('optimistic timeout rolls back and reports TIMEOUT_ERROR', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation((_p: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => setTimeout(() => reject(ofetchAbort()), 100_000))
      }),
    )
    const todos = ref([{ id: 1, done: false }])
    const action = useOptimisticAction('/api/toggle', {
      timeout: 500,
      currentData: todos,
      updateFn: (input: { id: number }, current: Array<{ id: number, done: boolean }>) =>
        current.map(t => (t.id === input.id ? { ...t, done: true } : t)),
    })

    const promise = action.execute({ id: 1 })
    expect(action.optimisticData.value).toEqual([{ id: 1, done: true }])

    vi.advanceTimersByTime(500)
    await vi.advanceTimersByTimeAsync(0)
    const result = await promise

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('TIMEOUT_ERROR')
    expect(action.optimisticData.value).toEqual([{ id: 1, done: false }]) // rolled back
    vi.useRealTimers()
  })
})

describe('A3: debounce/throttle resolver windows do not leak across overlaps', () => {
  it('debounce: a caller arriving while fn is in flight is not resolved by the previous window', async () => {
    const calls: string[] = []
    const gate = makeGate()
    const fn = vi.fn(async (arg: string) => {
      calls.push(arg)
      if (arg === 'A') await gate.promise // first invocation hangs
      return arg
    })
    const debounced = createDebouncedFn(fn, 100)

    const pA = debounced('A')
    await new Promise(r => setTimeout(r, 120)) // timer A fires, fn('A') in flight
    const pB = debounced('B') // arrives during fn('A')
    await new Promise(r => setTimeout(r, 120)) // timer B fires, fn('B') runs and returns 'B'

    gate.open() // now fn('A') settles
    expect(await pA).toBe('A')
    expect(await pB).toBe('B') // B must get B's result, not A's
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throttle: a trailing call after an in-flight leading call does not throw on null args', async () => {
    const gate = makeGate()
    const fn = vi.fn(async (arg: string) => {
      if (arg === 'A') await gate.promise
      return arg
    })
    const throttled = createThrottledFn(fn, 100)

    const pA = throttled('A') // leading edge, fn('A') in flight
    await new Promise(r => setTimeout(r, 110))
    const pC = throttled('C') // schedules a trailing call
    await new Promise(r => setTimeout(r, 120)) // trailing timer fires fn('C')

    gate.open()
    expect(await pA).toBe('A')
    expect(await pC).toBe('C')
  })
})
