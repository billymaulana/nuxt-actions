import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAction } from '../../src/runtime/composables/useAction'
import { emitActionHook } from '../../src/runtime/composables/_utils'

const mockFetch = vi.fn()
const mockCallHook = vi.fn().mockResolvedValue(undefined)

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
    callHook: mockCallHook,
  }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAction cancelPrevious + cancel()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cancelPrevious aborts the previous in-flight request like dedupe: cancel', async () => {
    const first = deferred<unknown>()
    const signals: AbortSignal[] = []

    mockFetch.mockImplementation((_path: string, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal)
      if (signals.length === 1) {
        return first.promise.catch(() => {
          throw new DOMException('Aborted', 'AbortError')
        })
      }
      return Promise.resolve({ success: true, data: { id: 2 } })
    })

    const { execute } = useAction('/api/test', { cancelPrevious: true })

    const p1 = execute({ q: 'a' })
    const p2 = execute({ q: 'ab' })

    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)

    first.reject(new DOMException('Aborted', 'AbortError'))
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1.success).toBe(false)
    if (!r1.success) expect(r1.error.code).toBe('ABORT_ERROR')
    expect(r2.success).toBe(true)
  })

  it('an explicit dedupe option wins over cancelPrevious', async () => {
    const first = deferred<unknown>()
    mockFetch.mockReturnValueOnce(first.promise)

    const { execute } = useAction('/api/test', {
      cancelPrevious: true,
      dedupe: 'defer',
    })

    const p1 = execute({})
    const p2 = execute({})

    first.resolve({ success: true, data: 'one' })
    const [r1, r2] = await Promise.all([p1, p2])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(r1).toBe(r2)
  })

  it('cancel() aborts the in-flight request without clearing data', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, data: { id: 1 } })
    const action = useAction('/api/test')
    await action.execute({})
    expect(action.data.value).toEqual({ id: 1 })

    const pending = deferred<unknown>()
    let capturedSignal: AbortSignal | undefined
    mockFetch.mockImplementationOnce((_path: string, opts: { signal: AbortSignal }) => {
      capturedSignal = opts.signal
      return pending.promise
    })

    const p = action.execute({})
    action.cancel()
    expect(capturedSignal?.aborted).toBe(true)

    pending.reject(new DOMException('Aborted', 'AbortError'))
    const result = await p

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('ABORT_ERROR')
    expect(action.data.value).toEqual({ id: 1 })
    expect(action.status.value).toBe('idle')
  })

  it('cancel() is a no-op when nothing is in flight', () => {
    const action = useAction('/api/test')
    expect(() => action.cancel()).not.toThrow()
  })
})

describe('useAction global hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits start, success, and settled on a successful call', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, data: { id: 7 } })
    const { execute } = useAction('/api/todos', { method: 'POST' })

    await execute({ title: 'x' })

    expect(mockCallHook).toHaveBeenCalledWith('action:start', {
      path: '/api/todos',
      method: 'POST',
      input: { title: 'x' },
    })
    expect(mockCallHook).toHaveBeenCalledWith('action:success', expect.objectContaining({
      path: '/api/todos',
      data: { id: 7 },
      durationMs: expect.any(Number),
    }))
    expect(mockCallHook).toHaveBeenCalledWith('action:settled', expect.objectContaining({
      result: { success: true, data: { id: 7 } },
    }))
    expect(mockCallHook).not.toHaveBeenCalledWith('action:error', expect.anything())
  })

  it('emits error and settled on a failed envelope', async () => {
    const error = { code: 'VALIDATION_ERROR', message: 'bad', statusCode: 422 }
    mockFetch.mockResolvedValueOnce({ success: false, error })
    const { execute } = useAction('/api/todos')

    await execute({})

    expect(mockCallHook).toHaveBeenCalledWith('action:error', expect.objectContaining({ error }))
    expect(mockCallHook).toHaveBeenCalledWith('action:settled', expect.objectContaining({
      result: { success: false, error },
    }))
    expect(mockCallHook).not.toHaveBeenCalledWith('action:success', expect.anything())
  })

  it('emits error and settled on a network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    const { execute } = useAction('/api/todos')

    await execute({})

    expect(mockCallHook).toHaveBeenCalledWith('action:error', expect.objectContaining({
      error: expect.objectContaining({ code: 'FETCH_ERROR' }),
    }))
    expect(mockCallHook).toHaveBeenCalledWith('action:settled', expect.anything())
  })

  it('emits only settled (not error) on abort', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
    const { execute } = useAction('/api/todos')

    await execute({})

    expect(mockCallHook).toHaveBeenCalledWith('action:start', expect.anything())
    expect(mockCallHook).toHaveBeenCalledWith('action:settled', expect.objectContaining({
      result: expect.objectContaining({
        error: expect.objectContaining({ code: 'ABORT_ERROR' }),
      }),
    }))
    expect(mockCallHook).not.toHaveBeenCalledWith('action:error', expect.anything())
  })

  it('a rejecting hook handler does not break execute()', async () => {
    mockCallHook.mockRejectedValue(new Error('hook exploded'))
    mockFetch.mockResolvedValueOnce({ success: true, data: 1 })
    const { execute } = useAction('/api/todos')

    const result = await execute({})
    expect(result.success).toBe(true)
  })
})

describe('emitActionHook', () => {
  it('no-ops when callHook is missing', () => {
    expect(() => emitActionHook({}, 'action:start', {})).not.toThrow()
    expect(() => emitActionHook(undefined as never, 'action:start', {})).not.toThrow()
  })

  it('swallows synchronously-throwing hook callers', () => {
    const target = {
      callHook: () => {
        throw new Error('sync boom')
      },
    }
    expect(() => emitActionHook(target, 'action:start', {})).not.toThrow()
  })

  it('swallows rejecting hook callers', async () => {
    const target = { callHook: () => Promise.reject(new Error('async boom')) }
    expect(() => emitActionHook(target, 'action:start', {})).not.toThrow()
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('passes name and payload through to callHook', () => {
    const callHook = vi.fn().mockResolvedValue(undefined)
    emitActionHook({ callHook }, 'action:success', { path: '/x' })
    expect(callHook).toHaveBeenCalledWith('action:success', { path: '/x' })
  })
})
