import { ref, onScopeDispose } from 'vue'
import { useOptimisticAction } from '../../src/runtime/composables/useOptimisticAction'
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

interface Todo {
  id: number
  title: string
  done: boolean
}

describe('useOptimisticAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with current data as optimistic data', () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])

      const { optimisticData, data, error, status } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      expect(optimisticData.value).toEqual([{ id: 1, title: 'Buy milk', done: false }])
      expect(data.value).toBeNull()
      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
    })
  })

  describe('optimistic update', () => {
    it('applies optimistic update immediately before server response', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])

      let resolvePromise: (value: unknown) => void
      mockFetch.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve
      }))

      const { execute, optimisticData, status } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      const promise = execute({ id: 1 })

      // Optimistic update applied immediately
      expect(optimisticData.value).toEqual([{ id: 1, title: 'Buy milk', done: true }])
      expect(status.value).toBe('executing')

      // Resolve with server data
      resolvePromise!({
        success: true,
        data: [{ id: 1, title: 'Buy milk', done: true }],
      })
      await promise

      expect(optimisticData.value).toEqual([{ id: 1, title: 'Buy milk', done: true }])
      expect(status.value).toBe('success')
    })

    it('rolls back to snapshot on server error', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])

      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })

      const { execute, optimisticData, error } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      await execute({ id: 1 })

      // Should rollback to original
      expect(optimisticData.value).toEqual([{ id: 1, title: 'Buy milk', done: false }])
      expect(error.value).toEqual({ code: 'ERR', message: 'fail', statusCode: 400 })
    })

    it('rolls back to snapshot on fetch error', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])

      mockFetch.mockRejectedValue(new Error('Network error'))

      const { execute, optimisticData, error } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      await execute({ id: 1 })

      expect(optimisticData.value).toEqual([{ id: 1, title: 'Buy milk', done: false }])
      expect(error.value).toMatchObject({
        code: 'FETCH_ERROR',
        message: 'Network error',
      })
    })

    it('updates optimisticData with server truth on success', async () => {
      const counter = ref({ count: 0 })

      mockFetch.mockResolvedValue({
        success: true,
        data: { count: 5 }, // Server sends different value
      })

      const { execute, optimisticData } = useOptimisticAction<{ increment: number }, { count: number }>(
        '/api/counter',
        {
          currentData: counter,
          updateFn: (input, current) => ({ count: current.count + input.increment }),
        },
      )

      await execute({ increment: 1 })

      // Should be server truth, not optimistic value
      expect(optimisticData.value).toEqual({ count: 5 })
    })
  })

  describe('callbacks', () => {
    it('calls onExecute before fetch with input', async () => {
      const callOrder: string[] = []
      const todos = ref<Todo[]>([])

      mockFetch.mockImplementation(async () => {
        callOrder.push('fetch')
        return { success: true, data: [] }
      })

      const onExecute = vi.fn(() => callOrder.push('onExecute'))

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
          onExecute,
        },
      )

      await execute({ id: 1 })

      expect(onExecute).toHaveBeenCalledWith({ id: 1 })
      expect(callOrder).toEqual(['onExecute', 'fetch'])
    })

    it('calls onSuccess with server data', async () => {
      const todos = ref<Todo[]>([])
      const onSuccess = vi.fn()

      mockFetch.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Test', done: true }],
      })

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
          onSuccess,
        },
      )

      await execute({ id: 1 })

      expect(onSuccess).toHaveBeenCalledWith([{ id: 1, title: 'Test', done: true }])
    })

    it('calls onError on failure', async () => {
      const todos = ref<Todo[]>([])
      const onError = vi.fn()

      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
          onError,
        },
      )

      await execute({ id: 1 })

      expect(onError).toHaveBeenCalledWith({ code: 'ERR', message: 'fail', statusCode: 400 })
    })

    it('calls onSettled after success or error', async () => {
      const todos = ref<Todo[]>([])
      const onSettled = vi.fn()

      mockFetch.mockResolvedValue({ success: true, data: [] })

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
          onSettled,
        },
      )

      await execute({ id: 1 })

      expect(onSettled).toHaveBeenCalledWith({ success: true, data: [] })
    })
  })

  describe('computed status properties', () => {
    it('isIdle is true initially', () => {
      const todos = ref<Todo[]>([])
      const { isIdle, isExecuting, hasSucceeded, hasErrored } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
        },
      )
      expect(isIdle.value).toBe(true)
      expect(isExecuting.value).toBe(false)
      expect(hasSucceeded.value).toBe(false)
      expect(hasErrored.value).toBe(false)
    })

    it('hasSucceeded is true after success', async () => {
      const todos = ref<Todo[]>([])
      mockFetch.mockResolvedValue({ success: true, data: [] })

      const { execute, hasSucceeded } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
        },
      )

      await execute({ id: 1 })
      expect(hasSucceeded.value).toBe(true)
    })

    it('hasErrored is true after error', async () => {
      const todos = ref<Todo[]>([])
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })

      const { execute, hasErrored } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
        },
      )

      await execute({ id: 1 })
      expect(hasErrored.value).toBe(true)
    })
  })

  describe('TypedActionReference overload', () => {
    it('constructs path from __actionPath and uses __actionMethod', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])
      mockFetch.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Buy milk', done: true }],
      })

      const actionRef = {
        __actionPath: 'toggle-todo',
        __actionMethod: 'PATCH',
        _types: {} as { readonly input: { id: number }, readonly output: Todo[] },
      }

      const { execute } = useOptimisticAction(actionRef as never, {
        currentData: todos,
        updateFn: (input: { id: number }, current: Todo[]) =>
          current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
      } as never)
      await execute({ id: 1 })

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/toggle-todo', expect.objectContaining({
        method: 'PATCH',
        body: { id: 1 },
      }))
    })
  })

  describe('concurrent call safety', () => {
    it('does not rollback when a newer call has superseded', async () => {
      const todos = ref<Todo[]>([
        { id: 1, title: 'A', done: false },
        { id: 2, title: 'B', done: false },
      ])

      // First call will fail, second will succeed
      let resolveFirst: (value: unknown) => void
      let resolveSecond: (value: unknown) => void

      mockFetch
        .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

      const { execute, optimisticData } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      // Fire both calls without awaiting
      const promise1 = execute({ id: 1 })
      const promise2 = execute({ id: 2 })

      // Both optimistic updates should be applied
      expect(optimisticData.value).toEqual([
        { id: 1, title: 'A', done: true },
        { id: 2, title: 'B', done: true },
      ])

      // First call fails — should NOT rollback because call 2 superseded it
      resolveFirst!({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 500 },
      })
      await promise1

      // optimisticData should still reflect both updates (no stale rollback)
      expect(optimisticData.value).toEqual([
        { id: 1, title: 'A', done: true },
        { id: 2, title: 'B', done: true },
      ])

      // Second call succeeds with server truth
      resolveSecond!({
        success: true,
        data: [
          { id: 1, title: 'A', done: false },
          { id: 2, title: 'B', done: true },
        ],
      })
      await promise2

      // Should reflect server truth
      expect(optimisticData.value).toEqual([
        { id: 1, title: 'A', done: false },
        { id: 2, title: 'B', done: true },
      ])
    })

    it('does not rollback on fetch error when a newer call has superseded', async () => {
      const todos = ref<Todo[]>([
        { id: 1, title: 'A', done: false },
        { id: 2, title: 'B', done: false },
      ])

      let resolveSecond: (value: unknown) => void

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

      const { execute, optimisticData } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      // Fire both calls without awaiting — first will reject, second will pend
      const promise1 = execute({ id: 1 })
      const promise2 = execute({ id: 2 })

      // First call rejects immediately — should NOT rollback because call 2 superseded it
      await promise1

      expect(optimisticData.value).toEqual([
        { id: 1, title: 'A', done: true },
        { id: 2, title: 'B', done: true },
      ])

      // Second call succeeds with server truth
      resolveSecond!({
        success: true,
        data: [
          { id: 1, title: 'A', done: false },
          { id: 2, title: 'B', done: true },
        ],
      })
      await promise2

      expect(optimisticData.value).toEqual([
        { id: 1, title: 'A', done: false },
        { id: 2, title: 'B', done: true },
      ])
    })
  })

  describe('HTTP methods', () => {
    it('defaults to POST', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        currentData: data,
        updateFn: (_input, current) => current,
      })

      await execute({})
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'POST',
        body: {},
      }))
    })

    it('uses custom method', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        method: 'PATCH',
        currentData: data,
        updateFn: (_input, current) => current,
      })

      await execute({ id: 1 })
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'PATCH',
        body: { id: 1 },
      }))
    })

    it('uses query for HEAD', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        method: 'HEAD',
        currentData: data,
        updateFn: (_input, current) => current,
      })

      await execute({ check: true })
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'HEAD',
        query: { check: true },
      }))
    })

    it('uses query for GET', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        method: 'GET',
        currentData: data,
        updateFn: (_input, current) => current,
      })

      await execute({ q: 'search' })
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'GET',
        query: { q: 'search' },
      }))
    })
  })

  describe('null input handling', () => {
    it('sends empty query for GET with null input', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        method: 'GET',
        currentData: data,
        updateFn: (_input, current) => current,
      })

      await execute(null)
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        query: {},
      }))
    })

    it('sends empty body for POST with null input', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        currentData: data,
        updateFn: (_input, current) => current,
      })

      await execute(null)
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        body: {},
      }))
    })

    it('handles non-Error throw in catch without rollback when superseded', async () => {
      const todos = ref<Todo[]>([
        { id: 1, title: 'A', done: false },
      ])

      let resolveSecond: (value: unknown) => void

      mockFetch
        .mockRejectedValueOnce('string error')
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

      const { execute, optimisticData, error } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      const promise1 = execute({ id: 1 })
      const promise2 = execute({ id: 1 })

      await promise1

      // Non-Error: message should be 'Failed to execute action'
      expect(error.value).toMatchObject({
        code: 'FETCH_ERROR',
        message: 'Failed to execute action',
      })

      resolveSecond!({
        success: true,
        data: [{ id: 1, title: 'A', done: true }],
      })
      await promise2

      expect(optimisticData.value).toEqual([{ id: 1, title: 'A', done: true }])
    })
  })

  describe('reset', () => {
    it('is safe to call before any execution', () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Test', done: false }])
      const { reset, status } = useOptimisticAction('/api/test', {
        currentData: todos,
        updateFn: (_input: unknown, current: typeof todos.value) => current,
      })

      // No request in-flight — currentController is null
      reset()
      expect(status.value).toBe('idle')
    })

    it('resets all state', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])

      mockFetch.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Buy milk', done: true }],
      })

      const { execute, optimisticData, data, error, status, reset } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      await execute({ id: 1 })
      expect(data.value).not.toBeNull()
      expect(status.value).toBe('success')

      reset()

      expect(optimisticData.value).toEqual([{ id: 1, title: 'Buy milk', done: false }])
      expect(data.value).toBeNull()
      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
    })

    it('aborts in-flight request when reset is called during execution', async () => {
      let resolveFetch: ((v: unknown) => void) | undefined
      mockFetch.mockImplementation(() => new Promise((resolve) => {
        resolveFetch = resolve
      }))

      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])
      const { execute, reset, status } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      // Start execution but don't await (keep in-flight)
      const promise = execute({ id: 1 })

      // Reset while in-flight — should abort the controller
      reset()
      expect(status.value).toBe('idle')

      // Resolve to avoid unhandled rejection
      resolveFetch!({ success: true, data: todos.value })
      await promise
    })
  })

  // ── New Phase 1 features ────────────────────────────────────────

  describe('retry', () => {
    it('passes retry=3 when retry is true', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        retry: true,
        currentData: data,
        updateFn: (_input, current) => current,
      })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        retry: 3,
      }))
    })

    it('passes full retry config', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        retry: { count: 2, delay: 1000, statusCodes: [500] },
        currentData: data,
        updateFn: (_input, current) => current,
      })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        retry: 2,
        retryDelay: 1000,
        retryStatusCodes: [500],
      }))
    })

    it('does not pass retry when undefined', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        currentData: data,
        updateFn: (_input, current) => current,
      })
      await execute({})

      const fetchOpts = mockFetch.mock.calls[0][1]
      expect(fetchOpts).not.toHaveProperty('retry')
    })
  })

  describe('headers', () => {
    it('passes static headers', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useOptimisticAction('/api/test', {
        headers: { 'X-Custom': 'value' },
        currentData: data,
        updateFn: (_input, current) => current,
      })
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        headers: { 'X-Custom': 'value' },
      }))
    })

    it('calls header function on each execute', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })
      let counter = 0
      const headerFn = vi.fn(() => {
        counter++
        return { 'X-Token': `token${counter}` }
      })

      const { execute } = useOptimisticAction('/api/test', {
        headers: headerFn,
        currentData: data,
        updateFn: (_input, current) => current,
      })
      await execute({})
      await execute({})

      expect(headerFn).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][1].headers).toEqual({ 'X-Token': 'token1' })
      expect(mockFetch.mock.calls[1][1].headers).toEqual({ 'X-Token': 'token2' })
    })
  })

  describe('timeout', () => {
    it('passes timeout to fetch options', async () => {
      const data = ref({})
      mockFetch.mockResolvedValue({ success: true, data: {} })
      const { execute } = useOptimisticAction('/api/test', {
        timeout: 3000,
        currentData: data,
        updateFn: (_input, current) => current,
      })
      await execute({})
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ timeout: 3000 }))
    })
  })

  describe('AbortError handling', () => {
    it('does not rollback optimistic data on AbortError', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'Buy milk', done: false }])

      mockFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const { execute, optimisticData, error, status } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      const result = await execute({ id: 1 })

      // AbortError should NOT rollback
      expect(optimisticData.value).toEqual([{ id: 1, title: 'Buy milk', done: true }])
      // AbortError resets status to idle
      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
      // Result should indicate abort
      expect(result.success).toBe(false)
      expect(result.error).toEqual({
        code: 'ABORT_ERROR',
        message: 'Request was aborted',
        statusCode: 0,
      })
    })

    it('passes AbortController signal to $fetch', async () => {
      const todos = ref<Todo[]>([])
      mockFetch.mockResolvedValue({ success: true, data: [] })

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
        },
      )

      await execute({ id: 1 })

      const fetchOpts = mockFetch.mock.calls[0][1]
      expect(fetchOpts.signal).toBeInstanceOf(AbortSignal)
    })

    it('aborts previous request when new one is made', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'A', done: false }])

      let resolveSecond: (value: unknown) => void
      mockFetch
        .mockReturnValueOnce(new Promise(() => {})) // first never resolves
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      execute({ id: 1 })

      // First signal should be aborted when second call is made
      const firstSignal = mockFetch.mock.calls[0][1].signal as AbortSignal
      execute({ id: 1 })
      expect(firstSignal.aborted).toBe(true)

      resolveSecond!({
        success: true,
        data: [{ id: 1, title: 'A', done: true }],
      })
    })

    it('reset aborts in-flight request', async () => {
      const todos = ref<Todo[]>([{ id: 1, title: 'A', done: false }])

      mockFetch.mockReturnValue(new Promise(() => {})) // never resolves

      const { execute, reset, status } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (input, current) =>
            current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
        },
      )

      execute({ id: 1 })
      expect(status.value).toBe('executing')

      const signal = mockFetch.mock.calls[0][1].signal as AbortSignal
      reset()

      expect(status.value).toBe('idle')
      expect(signal.aborted).toBe(true)
    })

    it('calls onSettled with ABORT_ERROR result on abort', async () => {
      const todos = ref<Todo[]>([])
      const onSettled = vi.fn()
      const onError = vi.fn()

      mockFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          currentData: todos,
          updateFn: (_input, current) => current,
          onSettled,
          onError,
        },
      )

      await execute({ id: 1 })

      expect(onSettled).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ABORT_ERROR', message: 'Request was aborted', statusCode: 0 },
      })
      // onError should NOT be called for aborts
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe('debounce and throttle', () => {
    it('debounces execute calls', async () => {
      vi.useFakeTimers()
      const todos = ref<Todo[]>([])
      mockFetch.mockResolvedValue({ success: true, data: [] })

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          debounce: 100,
          currentData: todos,
          updateFn: (_input, current) => current,
        },
      )

      execute({ id: 1 })
      execute({ id: 2 })
      const promise = execute({ id: 3 })

      expect(mockFetch).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      await promise

      expect(mockFetch).toHaveBeenCalledOnce()
      vi.useRealTimers()
    })

    it('throttles execute calls', async () => {
      vi.useFakeTimers()
      const todos = ref<Todo[]>([])
      mockFetch.mockResolvedValue({ success: true, data: [] })

      const { execute } = useOptimisticAction<{ id: number }, Todo[]>(
        '/api/todos/toggle',
        {
          throttle: 100,
          currentData: todos,
          updateFn: (_input, current) => current,
        },
      )

      // First call goes through immediately
      await execute({ id: 1 })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call is throttled
      const promise = execute({ id: 2 })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      await promise

      expect(mockFetch).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
    })
  })

  describe('deep clone snapshot', () => {
    it('deep clones snapshot so nested mutations do not corrupt rollback', async () => {
      // Start with nested data
      const data = ref({ items: [{ id: 1, done: false }] })

      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 500 },
      })

      const { execute, optimisticData } = useOptimisticAction('/api/test', {
        currentData: data,
        updateFn: (_input, current) => {
          // Mutate nested array in-place (the bug scenario)
          const result = { ...current }
          result.items = [...current.items]
          result.items[0] = { ...result.items[0], done: true }
          return result
        },
      })

      await execute({})

      // Should rollback to ORIGINAL data, not the mutated version
      expect(optimisticData.value).toEqual({ items: [{ id: 1, done: false }] })
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

      const todos = ref([{ id: 1, title: 'Test', done: false }])
      const { execute } = useOptimisticAction('/api/test', {
        currentData: todos,
        updateFn: (_input: unknown, current: typeof todos.value) => current,
      })

      // Start a request (don't await — keep it in-flight)
      const promise = execute({ id: 1 })

      // The composable should have registered onScopeDispose callbacks
      expect(mockedDispose).toHaveBeenCalled()

      // Call all dispose callbacks to simulate scope teardown
      const callbacks = mockedDispose.mock.calls.map(c => c[0])
      callbacks.forEach(cb => cb())

      // Resolve to avoid unhandled rejection
      resolveFetch!({ success: true, data: todos.value })
      await promise
    })

    it('registers and invokes timer cleanup when debounce is used', () => {
      const mockedDispose = vi.mocked(onScopeDispose)
      mockedDispose.mockClear()

      const todos = ref([{ id: 1, title: 'Test', done: false }])
      useOptimisticAction('/api/test', {
        currentData: todos,
        updateFn: (_input: unknown, current: typeof todos.value) => current,
        debounce: 200,
      })

      // Should register at least 2 callbacks: timer cancel + controller cleanup
      expect(mockedDispose.mock.calls.length).toBeGreaterThanOrEqual(2)

      // Invoke all dispose callbacks to cover the cancel() and abort() branches
      const callbacks = mockedDispose.mock.calls.map(c => c[0])
      callbacks.forEach(cb => cb())
    })
  })
})
