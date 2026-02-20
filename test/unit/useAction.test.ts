import { onScopeDispose } from 'vue'
import { useAction } from '../../src/runtime/composables/useAction'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock onScopeDispose to capture callbacks
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onScopeDispose: vi.fn(),
  }
})

// Mock #app (Nuxt auto-import)
const mockFetch = vi.fn()
vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
  }),
}))

describe('useAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with idle status', () => {
      const { status, data, error } = useAction('/api/test')
      expect(status.value).toBe('idle')
      expect(data.value).toBeNull()
      expect(error.value).toBeNull()
    })
  })

  describe('successful execution', () => {
    it('sets data and success status on success', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { id: 1, name: 'Test' },
      })

      const { execute, data, status, error } = useAction<{ name: string }, { id: number, name: string }>('/api/test', {
        method: 'POST',
      })

      const result = await execute({ name: 'Test' })

      expect(result).toEqual({ success: true, data: { id: 1, name: 'Test' } })
      expect(data.value).toEqual({ id: 1, name: 'Test' })
      expect(status.value).toBe('success')
      expect(error.value).toBeNull()
    })

    it('calls $fetch with correct POST options', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { method: 'POST' })
      await execute({ title: 'hello' })

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'POST',
        body: { title: 'hello' },
      }))
    })

    it('calls $fetch with correct GET options', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { method: 'GET' })
      await execute({ q: 'search' })

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'GET',
        query: { q: 'search' },
      }))
    })

    it('calls $fetch with GET and HEAD using query', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { method: 'HEAD' })
      await execute({ check: true })

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'HEAD',
        query: { check: true },
      }))
    })

    it('defaults to POST method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test')
      await execute({ data: 'x' })

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'POST',
        body: { data: 'x' },
      }))
    })

    it('handles undefined input for GET method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction<undefined, object>('/api/test', { method: 'GET' })
      await execute(undefined as never)

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'GET',
        query: {},
      }))
    })

    it('handles undefined input', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction<undefined, object>('/api/test')
      await execute(undefined as never)

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'POST',
        body: {},
      }))
    })
  })

  describe('error from server', () => {
    it('sets error and error status on server error', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid', statusCode: 422 },
      })

      const { execute, data, error, status } = useAction('/api/test')
      const result = await execute({})

      expect(result.success).toBe(false)
      expect(error.value).toEqual({ code: 'VALIDATION_ERROR', message: 'Invalid', statusCode: 422 })
      expect(status.value).toBe('error')
      expect(data.value).toBeNull()
    })
  })

  describe('fetch error', () => {
    it('handles network/fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { execute, error, status } = useAction('/api/test')
      const result = await execute({})

      expect(result.success).toBe(false)
      expect(error.value).toEqual({
        code: 'FETCH_ERROR',
        message: 'Network error',
        statusCode: 500,
      })
      expect(status.value).toBe('error')
    })

    it('handles non-Error fetch exceptions', async () => {
      mockFetch.mockRejectedValue('timeout')

      const { execute, error } = useAction('/api/test')
      await execute({})

      expect(error.value).toEqual({
        code: 'FETCH_ERROR',
        message: 'Failed to execute action',
        statusCode: 500,
      })
    })
  })

  describe('callbacks', () => {
    it('calls onSuccess with data', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })
      const onSuccess = vi.fn()

      const { execute } = useAction('/api/test', { onSuccess })
      await execute({})

      expect(onSuccess).toHaveBeenCalledWith({ id: 1 })
    })

    it('calls onError with error', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })
      const onError = vi.fn()

      const { execute } = useAction('/api/test', { onError })
      await execute({})

      expect(onError).toHaveBeenCalledWith({ code: 'ERR', message: 'fail', statusCode: 400 })
    })

    it('calls onSettled after success', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { ok: true } })
      const onSettled = vi.fn()

      const { execute } = useAction('/api/test', { onSettled })
      await execute({})

      expect(onSettled).toHaveBeenCalledWith({ success: true, data: { ok: true } })
    })

    it('calls onSettled after server error', async () => {
      const errorResult = { success: false, error: { code: 'ERR', message: 'fail', statusCode: 400 } }
      mockFetch.mockResolvedValue(errorResult)
      const onSettled = vi.fn()

      const { execute } = useAction('/api/test', { onSettled })
      await execute({})

      expect(onSettled).toHaveBeenCalledWith(errorResult)
    })

    it('calls onError and onSettled on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network'))
      const onError = vi.fn()
      const onSettled = vi.fn()

      const { execute } = useAction('/api/test', { onError, onSettled })
      await execute({})

      expect(onError).toHaveBeenCalled()
      expect(onSettled).toHaveBeenCalled()
      expect(onSettled.mock.calls[0][0].success).toBe(false)
    })

    it('calls onExecute before fetch', async () => {
      const callOrder: string[] = []
      mockFetch.mockImplementation(async () => {
        callOrder.push('fetch')
        return { success: true, data: {} }
      })
      const onExecute = vi.fn(() => callOrder.push('onExecute'))

      const { execute } = useAction('/api/test', { onExecute })
      await execute({ data: 'test' })

      expect(onExecute).toHaveBeenCalledWith({ data: 'test' })
      expect(callOrder).toEqual(['onExecute', 'fetch'])
    })
  })

  describe('executeAsync', () => {
    it('returns data directly on success', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      const { executeAsync } = useAction<unknown, { id: number }>('/api/test')
      const data = await executeAsync({})

      expect(data).toEqual({ id: 1 })
    })

    it('throws ActionError on failure', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })

      const { executeAsync } = useAction('/api/test')
      await expect(executeAsync({})).rejects.toEqual({
        code: 'ERR',
        message: 'fail',
        statusCode: 400,
      })
    })

    it('throws on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network'))

      const { executeAsync } = useAction('/api/test')
      await expect(executeAsync({})).rejects.toEqual({
        code: 'FETCH_ERROR',
        message: 'Network',
        statusCode: 500,
      })
    })
  })

  describe('computed status properties', () => {
    it('isIdle is true initially', () => {
      const { isIdle, isExecuting, hasSucceeded, hasErrored } = useAction('/api/test')
      expect(isIdle.value).toBe(true)
      expect(isExecuting.value).toBe(false)
      expect(hasSucceeded.value).toBe(false)
      expect(hasErrored.value).toBe(false)
    })

    it('isExecuting is true during execution', async () => {
      let resolvePromise: (value: unknown) => void
      mockFetch.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve
      }))

      const { execute, isExecuting, isIdle } = useAction('/api/test')
      const promise = execute({})

      expect(isExecuting.value).toBe(true)
      expect(isIdle.value).toBe(false)

      resolvePromise!({ success: true, data: {} })
      await promise
    })

    it('hasSucceeded is true after success', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })
      const { execute, hasSucceeded } = useAction('/api/test')
      await execute({})
      expect(hasSucceeded.value).toBe(true)
    })

    it('hasErrored is true after error', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })
      const { execute, hasErrored } = useAction('/api/test')
      await execute({})
      expect(hasErrored.value).toBe(true)
    })
  })

  describe('readonly refs', () => {
    it('data, error, status are readonly', () => {
      const { data, error, status } = useAction('/api/test')
      // Readonly refs still allow reading .value
      expect(data.value).toBeNull()
      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
    })
  })

  describe('TypedActionReference overload', () => {
    it('constructs path from __actionPath and uses __actionMethod', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      const actionRef = {
        __actionPath: 'create-todo',
        __actionMethod: 'POST',
        _types: {} as { readonly input: { title: string }, readonly output: { id: number } },
      }

      const { execute } = useAction(actionRef as never)
      await execute({ title: 'Buy milk' })

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/create-todo', expect.objectContaining({
        method: 'POST',
        body: { title: 'Buy milk' },
      }))
    })

    it('uses GET method from typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: [] })

      const actionRef = {
        __actionPath: 'list-todos',
        __actionMethod: 'GET',
        _types: {} as { readonly input: unknown, readonly output: unknown[] },
      }

      const { execute } = useAction(actionRef as never)
      await execute({ limit: 10 })

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/list-todos', expect.objectContaining({
        method: 'GET',
        query: { limit: 10 },
      }))
    })
  })

  describe('reset', () => {
    it('resets state to initial values', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { result: 'ok' } })

      const { execute, data, error, status, reset, isIdle } = useAction('/api/test')
      await execute({})

      expect(data.value).toEqual({ result: 'ok' })
      expect(status.value).toBe('success')

      reset()

      expect(data.value).toBeNull()
      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
      expect(isIdle.value).toBe(true)
    })

    it('resets error state', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })

      const { execute, error, status, reset } = useAction('/api/test')
      await execute({})

      expect(error.value).not.toBeNull()
      expect(status.value).toBe('error')

      reset()

      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
    })
  })

  describe('status transitions', () => {
    it('transitions idle -> executing -> success', async () => {
      const statuses: string[] = []
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute, status } = useAction('/api/test')
      statuses.push(status.value)

      const promise = execute({})
      statuses.push(status.value)

      await promise
      statuses.push(status.value)

      expect(statuses).toEqual(['idle', 'executing', 'success'])
    })

    it('transitions idle -> executing -> error', async () => {
      const statuses: string[] = []
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })

      const { execute, status } = useAction('/api/test')
      statuses.push(status.value)

      const promise = execute({})
      statuses.push(status.value)

      await promise
      statuses.push(status.value)

      expect(statuses).toEqual(['idle', 'executing', 'error'])
    })

    it('clears previous error on new execution', async () => {
      mockFetch
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'ERR', message: 'fail', statusCode: 400 },
        })
        .mockResolvedValueOnce({ success: true, data: { ok: true } })

      const { execute, error, status } = useAction('/api/test')

      await execute({})
      expect(error.value).not.toBeNull()

      await execute({})
      expect(error.value).toBeNull()
      expect(status.value).toBe('success')
    })
  })

  // ── New Phase 1 features ────────────────────────────────────────

  describe('retry', () => {
    it('passes retry=3 when retry is true', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { retry: true })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        retry: 3,
      }))
    })

    it('passes retry count when retry is a number', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { retry: 5 })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        retry: 5,
      }))
    })

    it('passes full retry config', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', {
        retry: { count: 2, delay: 1000, statusCodes: [500, 503] },
      })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        retry: 2,
        retryDelay: 1000,
        retryStatusCodes: [500, 503],
      }))
    })

    it('does not pass retry options when retry is false', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { retry: false })
      await execute({})

      const fetchOpts = mockFetch.mock.calls[0][1]
      expect(fetchOpts).not.toHaveProperty('retry')
    })

    it('does not pass retry options when retry is undefined', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test')
      await execute({})

      const fetchOpts = mockFetch.mock.calls[0][1]
      expect(fetchOpts).not.toHaveProperty('retry')
    })

    it('uses default count when RetryConfig has no count', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', {
        retry: { delay: 200 },
      })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        retry: 3,
        retryDelay: 200,
      }))
    })
  })

  describe('headers', () => {
    it('passes static headers to $fetch', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', {
        headers: { Authorization: 'Bearer token123' },
      })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        headers: { Authorization: 'Bearer token123' },
      }))
    })

    it('calls header function on each execute', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })
      let tokenCounter = 0
      const headerFn = vi.fn(() => {
        tokenCounter++
        return { Authorization: `Bearer token${tokenCounter}` }
      })

      const { execute } = useAction('/api/test', { headers: headerFn })
      await execute({})
      await execute({})

      expect(headerFn).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer token1' })
      expect(mockFetch.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer token2' })
    })

    it('does not include headers when not provided', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test')
      await execute({})

      const fetchOpts = mockFetch.mock.calls[0][1]
      expect(fetchOpts).not.toHaveProperty('headers')
    })
  })

  describe('dedupe', () => {
    it('cancel mode aborts previous in-flight request', async () => {
      let resolveFirst: (value: unknown) => void
      let resolveSecond: (value: unknown) => void

      mockFetch
        .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

      const { execute } = useAction('/api/test', { dedupe: 'cancel' })

      const promise1 = execute({ id: 1 })
      const promise2 = execute({ id: 2 })

      // First call should have been aborted - verify AbortController.signal was passed
      const firstSignal = mockFetch.mock.calls[0][1].signal as AbortSignal
      expect(firstSignal.aborted).toBe(true)

      resolveSecond!({ success: true, data: { id: 2 } })
      const result2 = await promise2
      expect(result2).toEqual({ success: true, data: { id: 2 } })

      // First promise resolves with abort error (since the fetch was aborted)
      resolveFirst!({ success: true, data: { id: 1 } })
      await promise1
    })

    it('defer mode returns same result and only fires one fetch', async () => {
      let resolvePromise: (value: unknown) => void
      mockFetch.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve
      }))

      const { execute } = useAction('/api/test', { dedupe: 'defer' })

      const promise1 = execute({ id: 1 })
      const promise2 = execute({ id: 2 })

      // Only one fetch call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1)

      resolvePromise!({ success: true, data: { id: 1 } })
      const [result1, result2] = await Promise.all([promise1, promise2])

      // Both should resolve to the same result
      expect(result1).toEqual({ success: true, data: { id: 1 } })
      expect(result2).toEqual({ success: true, data: { id: 1 } })
    })
  })

  describe('timeout', () => {
    it('passes timeout to fetch options', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })
      const { execute } = useAction('/api/test', { timeout: 5000 })
      await execute({})
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ timeout: 5000 }))
    })

    it('does not pass timeout when not specified', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })
      const { execute } = useAction('/api/test')
      await execute({})
      const opts = mockFetch.mock.calls[0][1]
      expect(opts).not.toHaveProperty('timeout')
    })
  })

  describe('debounce', () => {
    it('debounces execute calls', async () => {
      vi.useFakeTimers()
      mockFetch.mockResolvedValue({ success: true, data: { id: 3 } })

      const { execute } = useAction('/api/test', { debounce: 100 })

      execute({ id: 1 })
      execute({ id: 2 })
      const promise = execute({ id: 3 })

      // No fetch should have been called yet
      expect(mockFetch).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      await promise

      // Only the last call should fire
      expect(mockFetch).toHaveBeenCalledOnce()
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        body: { id: 3 },
      }))

      vi.useRealTimers()
    })

    it('executeAsync respects debounce', async () => {
      vi.useFakeTimers()
      mockFetch.mockResolvedValue({ success: true, data: { result: 'debounced' } })

      const { executeAsync } = useAction('/api/test', { debounce: 100 })

      const promise = executeAsync({ id: 1 })

      // Should not have fired yet (debounced)
      expect(mockFetch).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      const result = await promise

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(result).toEqual({ result: 'debounced' })

      vi.useRealTimers()
    })
  })

  describe('throttle', () => {
    it('throttles execute calls', async () => {
      vi.useFakeTimers()
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { throttle: 100 })

      // First call goes through immediately
      await execute({ id: 1 })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call within window is deferred
      const promise = execute({ id: 2 })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      await promise

      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('debounce takes priority over throttle', async () => {
      vi.useFakeTimers()
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test', { debounce: 100, throttle: 50 })

      execute({ id: 1 })
      const promise = execute({ id: 2 })

      // At 50ms, nothing should fire (debounce wins over throttle)
      vi.advanceTimersByTime(50)
      expect(mockFetch).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      await promise

      expect(mockFetch).toHaveBeenCalledOnce()

      vi.useRealTimers()
    })
  })

  describe('abort (AbortController)', () => {
    it('passes AbortController signal to $fetch', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useAction('/api/test')
      await execute({})

      const fetchOpts = mockFetch.mock.calls[0][1]
      expect(fetchOpts.signal).toBeInstanceOf(AbortSignal)
    })

    it('handles AbortError from $fetch gracefully', async () => {
      mockFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const { execute, status, error } = useAction('/api/test')
      const result = await execute({})

      expect(result.success).toBe(false)
      expect(result.error).toEqual({
        code: 'ABORT_ERROR',
        message: 'Request was aborted',
        statusCode: 0,
      })
      // AbortError resets status to idle
      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
    })

    it('reset aborts in-flight request', async () => {
      let resolvePromise: (value: unknown) => void
      mockFetch.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve
      }))

      const { execute, reset, status } = useAction('/api/test')
      const promise = execute({})

      expect(status.value).toBe('executing')

      // Get the signal that was passed to fetch
      const signal = mockFetch.mock.calls[0][1].signal as AbortSignal

      reset()

      expect(status.value).toBe('idle')
      expect(signal.aborted).toBe(true)

      // Resolve to avoid unhandled promise rejection
      resolvePromise!({ success: true, data: {} })
      await promise
    })

    it('status returns to idle after dedupe cancel abort', async () => {
      let resolveSecond: (value: unknown) => void

      mockFetch
        .mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

      const { execute, status } = useAction('/api/test', { dedupe: 'cancel' })

      const promise1 = execute({ id: 1 })
      const promise2 = execute({ id: 2 })

      // First call's AbortError catch runs when awaited, setting status to idle
      // (this runs after the second _doExecute already set status to executing)
      const result1 = await promise1
      expect(result1.error?.code).toBe('ABORT_ERROR')

      // Resolve second call — should land on success
      resolveSecond!({ success: true, data: { id: 2 } })
      await promise2

      expect(status.value).toBe('success')
    })
  })

  describe('onScopeDispose cleanup', () => {
    it('aborts in-flight request when scope is disposed', async () => {
      const mockedDispose = vi.mocked(onScopeDispose)
      mockedDispose.mockClear()

      let resolveFetch: ((v: unknown) => void) | undefined
      mockFetch.mockImplementation(() => new Promise((resolve) => {
        resolveFetch = resolve
      }))

      const { execute } = useAction('/api/test')

      // Start a request (don't await — keep it in-flight)
      const promise = execute({ id: 1 })

      // The composable should have registered onScopeDispose callbacks
      expect(mockedDispose).toHaveBeenCalled()

      // Find and call the controller cleanup callback (the one that aborts)
      const callbacks = mockedDispose.mock.calls.map(c => c[0])
      // Call all dispose callbacks to simulate scope teardown
      callbacks.forEach(cb => cb())

      // Resolve to avoid unhandled rejection
      resolveFetch!({ success: true, data: {} })
      await promise
    })

    it('registers and invokes timer cleanup when debounce is used', () => {
      const mockedDispose = vi.mocked(onScopeDispose)
      mockedDispose.mockClear()

      useAction('/api/test', { debounce: 200 })

      // Should register at least 2 callbacks: timer cancel + controller cleanup
      expect(mockedDispose.mock.calls.length).toBeGreaterThanOrEqual(2)

      // Invoke all dispose callbacks to cover the cancel() and abort() branches
      const callbacks = mockedDispose.mock.calls.map(c => c[0])
      callbacks.forEach(cb => cb())
    })
  })
})
