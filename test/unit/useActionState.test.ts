import { useActionState } from '../../src/runtime/composables/useActionState'
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

describe('useActionState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with null state by default', () => {
      const { state, error, pending } = useActionState('/api/test')
      expect(state.value).toBeNull()
      expect(error.value).toBeNull()
      expect(pending.value).toBe(false)
    })

    it('uses initialState when provided', () => {
      const { state } = useActionState('/api/test', {
        initialState: { id: 0, title: '' },
      })
      expect(state.value).toEqual({ id: 0, title: '' })
    })
  })

  describe('formAction', () => {
    it('converts FormData to object and calls execute', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1, title: 'Hello' } })

      const { formAction } = useActionState('/api/test')

      const formData = new FormData()
      formData.append('title', 'Hello')
      formData.append('description', 'World')

      await formAction(formData)

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'POST',
        body: { title: 'Hello', description: 'World' },
      }))
    })

    it('handles multi-value fields as arrays', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { formAction } = useActionState('/api/test')

      const formData = new FormData()
      formData.append('tags', 'vue')
      formData.append('tags', 'nuxt')
      formData.append('tags', 'typescript')

      await formAction(formData)

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        body: { tags: ['vue', 'nuxt', 'typescript'] },
      }))
    })
  })

  describe('formProps', () => {
    it('returns correct action URL and method for string path', () => {
      const { formProps } = useActionState('/api/todos')
      expect(formProps.value).toEqual({
        action: '/api/todos',
        method: 'post',
      })
    })

    it('returns correct action URL for typed reference', () => {
      const actionRef = {
        __actionPath: 'create-todo',
        __actionMethod: 'POST',
        _types: {} as { readonly input: { title: string }, readonly output: { id: number } },
      }

      const { formProps } = useActionState(actionRef as never)
      expect(formProps.value).toEqual({
        action: '/api/_actions/create-todo',
        method: 'post',
      })
    })
  })

  describe('state updates on success', () => {
    it('updates state after successful execution', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1, title: 'Created' } })

      const { formAction, state } = useActionState('/api/test')

      const formData = new FormData()
      formData.append('title', 'Created')
      await formAction(formData)

      expect(state.value).toEqual({ id: 1, title: 'Created' })
    })
  })

  describe('error on failure', () => {
    it('sets error on server error', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid', statusCode: 422 },
      })

      const { formAction, error, state } = useActionState('/api/test')

      const formData = new FormData()
      formData.append('title', '')
      await formAction(formData)

      expect(error.value).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid',
        statusCode: 422,
      })
      // State should remain null on error
      expect(state.value).toBeNull()
    })
  })

  describe('pending state', () => {
    it('pending is true during execution', async () => {
      let resolvePromise: (value: unknown) => void
      mockFetch.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve
      }))

      const { formAction, pending } = useActionState('/api/test')

      const formData = new FormData()
      formData.append('title', 'test')
      const promise = formAction(formData)

      expect(pending.value).toBe(true)

      resolvePromise!({ success: true, data: {} })
      await promise

      expect(pending.value).toBe(false)
    })
  })
})
