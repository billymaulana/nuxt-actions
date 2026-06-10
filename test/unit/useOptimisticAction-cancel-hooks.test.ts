import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useOptimisticAction } from '../../src/runtime/composables/useOptimisticAction'

const mockFetch = vi.fn()
const mockCallHook = vi.fn().mockResolvedValue(undefined)

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
    callHook: mockCallHook,
  }),
}))

interface Todo {
  id: number
  done: boolean
}

function makeOptions() {
  const currentData = ref<Todo[]>([{ id: 1, done: false }])
  return {
    currentData,
    updateFn: (input: { id: number }, todos: Todo[]) =>
      todos.map(t => (t.id === input.id ? { ...t, done: !t.done } : t)),
  }
}

describe('useOptimisticAction hooks + cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits start, success, and settled on success', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, data: [{ id: 1, done: true }] })
    const { execute } = useOptimisticAction('/api/toggle', makeOptions())

    await execute({ id: 1 })

    expect(mockCallHook).toHaveBeenCalledWith('action:start', expect.objectContaining({ path: '/api/toggle' }))
    expect(mockCallHook).toHaveBeenCalledWith('action:success', expect.objectContaining({
      durationMs: expect.any(Number),
    }))
    expect(mockCallHook).toHaveBeenCalledWith('action:settled', expect.anything())
  })

  it('emits error + settled and rolls back on failed envelope', async () => {
    const error = { code: 'SERVER_ERROR', message: 'boom', statusCode: 500 }
    mockFetch.mockResolvedValueOnce({ success: false, error })
    const action = useOptimisticAction('/api/toggle', makeOptions())

    await action.execute({ id: 1 })

    expect(action.optimisticData.value).toEqual([{ id: 1, done: false }])
    expect(mockCallHook).toHaveBeenCalledWith('action:error', expect.objectContaining({ error }))
    expect(mockCallHook).toHaveBeenCalledWith('action:settled', expect.anything())
  })

  it('emits error + settled on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    const action = useOptimisticAction('/api/toggle', makeOptions())

    await action.execute({ id: 1 })

    expect(mockCallHook).toHaveBeenCalledWith('action:error', expect.objectContaining({
      error: expect.objectContaining({ code: 'FETCH_ERROR' }),
    }))
  })

  it('emits only settled on abort and keeps optimistic state', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
    const action = useOptimisticAction('/api/toggle', makeOptions())

    await action.execute({ id: 1 })

    expect(action.optimisticData.value).toEqual([{ id: 1, done: true }])
    expect(mockCallHook).not.toHaveBeenCalledWith('action:error', expect.anything())
    expect(mockCallHook).toHaveBeenCalledWith('action:settled', expect.objectContaining({
      result: expect.objectContaining({
        error: expect.objectContaining({ code: 'ABORT_ERROR' }),
      }),
    }))
  })

  it('cancel() aborts the in-flight request', async () => {
    let capturedSignal: AbortSignal | undefined
    mockFetch.mockImplementationOnce((_path: string, opts: { signal: AbortSignal }) => {
      capturedSignal = opts.signal
      return new Promise(() => {})
    })

    const action = useOptimisticAction('/api/toggle', makeOptions())
    void action.execute({ id: 1 })
    action.cancel()

    expect(capturedSignal?.aborted).toBe(true)
  })

  it('cancel() is a no-op when idle', () => {
    const action = useOptimisticAction('/api/toggle', makeOptions())
    expect(() => action.cancel()).not.toThrow()
  })
})
