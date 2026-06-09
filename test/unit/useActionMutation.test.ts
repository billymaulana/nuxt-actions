import { useActionMutation } from '../../src/runtime/composables/useActionMutation'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn()
vi.mock('../../src/runtime/composables/useAction', () => ({
  useAction: () => ({
    execute: mockExecute,
    executeAsync: vi.fn(),
    data: { value: null },
    error: { value: null },
    status: { value: 'idle' },
    isIdle: { value: true },
    isExecuting: { value: false },
    hasSucceeded: { value: false },
    hasErrored: { value: false },
    reset: vi.fn(),
  }),
}))

const mockInvalidateActions = vi.fn().mockResolvedValue(undefined)
const mockInvalidateTags = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/runtime/composables/invalidateActions', () => ({
  invalidateActions: (...a: unknown[]) => mockInvalidateActions(...a),
  invalidateTags: (...a: unknown[]) => mockInvalidateTags(...a),
}))

const ref = { __actionPath: 'list-todos', __actionMethod: 'GET', _types: {} as never }

describe('useActionMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates refs and tags after a successful mutation', async () => {
    mockExecute.mockResolvedValue({ success: true, data: { id: 1 } })
    const { execute } = useActionMutation('/api/todos' as never, { invalidates: [ref as never, 'todos'] })
    await execute({ title: 'x' })
    expect(mockInvalidateActions).toHaveBeenCalledWith([ref])
    expect(mockInvalidateTags).toHaveBeenCalledWith(['todos'])
  })

  it('does not invalidate when the mutation fails', async () => {
    mockExecute.mockResolvedValue({ success: false, error: { code: 'X', message: 'no', statusCode: 400 } })
    const { execute } = useActionMutation('/api/todos' as never, { invalidates: ['todos'] })
    await execute({ title: 'x' })
    expect(mockInvalidateTags).not.toHaveBeenCalled()
    expect(mockInvalidateActions).not.toHaveBeenCalled()
  })

  it('returns success data via executeAsync', async () => {
    mockExecute.mockResolvedValue({ success: true, data: { id: 7 } })
    const { executeAsync } = useActionMutation('/api/todos' as never, {})
    await expect(executeAsync({ title: 'x' })).resolves.toEqual({ id: 7 })
  })

  it('throws the error via executeAsync on failure', async () => {
    const err = { code: 'X', message: 'boom', statusCode: 400 }
    mockExecute.mockResolvedValue({ success: false, error: err })
    const { executeAsync } = useActionMutation('/api/todos' as never, {})
    await expect(executeAsync({ title: 'x' })).rejects.toEqual(err)
  })

  it('does not block execute() when awaitInvalidation is false', async () => {
    let resolveInvalidate: () => void = () => {}
    mockInvalidateTags.mockReturnValue(new Promise<void>((r) => {
      resolveInvalidate = r
    }))
    mockExecute.mockResolvedValue({ success: true, data: {} })
    const { execute } = useActionMutation('/api/todos' as never, { invalidates: ['todos'], awaitInvalidation: false })
    await execute({ title: 'x' })
    expect(mockInvalidateTags).toHaveBeenCalled()
    resolveInvalidate()
  })
})
