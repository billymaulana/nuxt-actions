import { useFormAction } from '../../src/runtime/composables/useFormAction'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock #app (Nuxt auto-import)
const mockFetch = vi.fn()
vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
  }),
}))

interface RegisterInput {
  name: string
  email: string
  age: number
}

interface RegisterOutput {
  id: number
  name: string
  email: string
}

describe('useFormAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with initial values as fields', () => {
      const { fields, isDirty, status, error, data, fieldErrors } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      expect(fields).toEqual({ name: 'Alice', email: 'alice@test.com', age: 30 })
      expect(isDirty.value).toBe(false)
      expect(status.value).toBe('idle')
      expect(error.value).toBeNull()
      expect(data.value).toBeNull()
      expect(fieldErrors.value).toEqual({})
    })

    it('deep clones initial values (no shared references)', () => {
      const initial = { name: 'Bob', email: 'bob@test.com', age: 25 }
      const { fields } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: initial },
      )

      // Mutate original — should not affect form
      initial.name = 'Changed'
      expect((fields as RegisterInput).name).toBe('Bob')
    })
  })

  describe('dirty tracking', () => {
    it('isDirty is true when fields change', () => {
      const { fields, isDirty } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      expect(isDirty.value).toBe(false);
      (fields as RegisterInput).name = 'Bob'
      expect(isDirty.value).toBe(true)
    })

    it('isDirty is false when fields return to initial values', () => {
      const { fields, isDirty } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      ;(fields as RegisterInput).name = 'Bob'
      expect(isDirty.value).toBe(true)

      ;(fields as RegisterInput).name = 'Alice'
      expect(isDirty.value).toBe(false)
    })
  })

  describe('submit', () => {
    it('sends field values to the action', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { id: 1, name: 'Alice', email: 'alice@test.com' },
      })

      const { submit, data, status } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      const result = await submit()

      expect(result.success).toBe(true)
      expect(data.value).toEqual({ id: 1, name: 'Alice', email: 'alice@test.com' })
      expect(status.value).toBe('success')
      expect(mockFetch).toHaveBeenCalledWith('/api/register', expect.objectContaining({
        method: 'POST',
        body: { name: 'Alice', email: 'alice@test.com', age: 30 },
      }))
    })

    it('sends updated field values', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { fields, submit } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      ;(fields as RegisterInput).name = 'Bob'
      ;(fields as RegisterInput).email = 'bob@test.com'
      await submit()

      expect(mockFetch).toHaveBeenCalledWith('/api/register', expect.objectContaining({
        body: { name: 'Bob', email: 'bob@test.com', age: 30 },
      }))
    })
  })

  describe('field errors', () => {
    it('extracts fieldErrors from VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          statusCode: 422,
          fieldErrors: {
            email: ['Invalid email format'],
            name: ['Name is required', 'Name must be at least 2 characters'],
          },
        },
      })

      const { submit, fieldErrors } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: '', email: 'invalid', age: 30 } },
      )

      await submit()

      expect(fieldErrors.value).toEqual({
        email: ['Invalid email format'],
        name: ['Name is required', 'Name must be at least 2 characters'],
      })
    })

    it('returns empty object when error is not VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Internal error', statusCode: 500 },
      })

      const { submit, fieldErrors } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      await submit()

      expect(fieldErrors.value).toEqual({})
    })

    it('returns empty object when no fieldErrors in VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', statusCode: 422 },
      })

      const { submit, fieldErrors } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: '', email: '', age: 0 } },
      )

      await submit()

      expect(fieldErrors.value).toEqual({})
    })
  })

  describe('reset', () => {
    it('resets fields to initial values', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { fields, submit, reset, isDirty } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      ;(fields as RegisterInput).name = 'Bob'
      expect(isDirty.value).toBe(true)

      await submit()

      reset()

      expect(fields).toEqual({ name: 'Alice', email: 'alice@test.com', age: 30 })
      expect(isDirty.value).toBe(false)
    })

    it('clears errors and resets status', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fail',
          statusCode: 422,
          fieldErrors: { name: ['Required'] },
        },
      })

      const { submit, reset, error, status, fieldErrors } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: '', email: '', age: 0 } },
      )

      await submit()
      expect(error.value).not.toBeNull()
      expect(fieldErrors.value).toHaveProperty('name')

      reset()

      expect(error.value).toBeNull()
      expect(status.value).toBe('idle')
      expect(fieldErrors.value).toEqual({})
    })
  })

  describe('isSubmitting', () => {
    it('is true during submission', async () => {
      let resolvePromise: (value: unknown) => void
      mockFetch.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve
      }))

      const { submit, isSubmitting } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      expect(isSubmitting.value).toBe(false)

      const promise = submit()
      expect(isSubmitting.value).toBe(true)

      resolvePromise!({ success: true, data: {} })
      await promise

      expect(isSubmitting.value).toBe(false)
    })
  })

  describe('callbacks', () => {
    it('calls onSuccess callback', async () => {
      const onSuccess = vi.fn()
      mockFetch.mockResolvedValue({
        success: true,
        data: { id: 1, name: 'Alice', email: 'alice@test.com' },
      })

      const { submit } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        {
          initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 },
          onSuccess,
        },
      )

      await submit()

      expect(onSuccess).toHaveBeenCalledWith({ id: 1, name: 'Alice', email: 'alice@test.com' })
    })

    it('calls onError callback', async () => {
      const onError = vi.fn()
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 400 },
      })

      const { submit } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        {
          initialValues: { name: '', email: '', age: 0 },
          onError,
        },
      )

      await submit()

      expect(onError).toHaveBeenCalledWith({ code: 'ERR', message: 'fail', statusCode: 400 })
    })
  })

  describe('TypedActionReference overload', () => {
    it('constructs path from typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const actionRef = {
        __actionPath: 'register',
        __actionMethod: 'POST',
        _types: {} as { readonly input: RegisterInput, readonly output: RegisterOutput },
      }

      const { submit } = useFormAction(actionRef as never, {
        initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 },
      } as never)

      await submit()

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/register', expect.objectContaining({
        method: 'POST',
      }))
    })
  })

  describe('custom HTTP method', () => {
    it('uses specified method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { submit } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        {
          method: 'PUT',
          initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 },
        },
      )

      await submit()

      expect(mockFetch).toHaveBeenCalledWith('/api/register', expect.objectContaining({
        method: 'PUT',
      }))
    })
  })

  describe('debounce forwarding', () => {
    it('submit() respects debounce option', async () => {
      vi.useFakeTimers()
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      const { submit } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        {
          initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 },
          debounce: 100,
        },
      )

      submit()
      submit()
      const promise = submit()

      // No fetch should have been called yet (debounced)
      expect(mockFetch).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      await promise

      // Only one fetch call (last-call-wins)
      expect(mockFetch).toHaveBeenCalledOnce()

      vi.useRealTimers()
    })
  })

  describe('throttle forwarding', () => {
    it('submit() respects throttle option', async () => {
      vi.useFakeTimers()
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      const { submit } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        {
          initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 },
          throttle: 100,
        },
      )

      // First call goes through immediately
      await submit()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call within window is deferred
      const promise = submit()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      await promise

      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('edge cases', () => {
    it('isDirty updates synchronously after field mutation', () => {
      const { fields, isDirty } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      expect(isDirty.value).toBe(false)

      // Mutate and check immediately — no nextTick needed
      ;(fields as RegisterInput).name = 'Changed'
      expect(isDirty.value).toBe(true)

      ;(fields as RegisterInput).name = 'Alice'
      expect(isDirty.value).toBe(false)
    })

    it('handles nested object in initial values', () => {
      interface NestedInput { profile: { name: string, tags: string[] } }

      const { fields, isDirty } = useFormAction<NestedInput, unknown>(
        '/api/nested',
        { initialValues: { profile: { name: 'Alice', tags: ['a', 'b'] } } },
      )

      expect(isDirty.value).toBe(false)

      ;(fields as NestedInput).profile.name = 'Bob'
      expect(isDirty.value).toBe(true)
    })

    it('reset removes dynamically added keys', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { fields, reset } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      // Dynamically add a key
      ;(fields as Record<string, unknown>).extra = 'surprise'
      expect((fields as Record<string, unknown>).extra).toBe('surprise')

      reset()

      expect((fields as Record<string, unknown>).extra).toBeUndefined()
      expect(fields).toEqual({ name: 'Alice', email: 'alice@test.com', age: 30 })
    })

    it('submit sends deep clone (no reactive proxy)', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { fields, submit } = useFormAction<RegisterInput, RegisterOutput>(
        '/api/register',
        { initialValues: { name: 'Alice', email: 'alice@test.com', age: 30 } },
      )

      ;(fields as RegisterInput).name = 'Bob'
      await submit()

      const sentBody = mockFetch.mock.calls[0][1].body
      // Verify it's a plain object (not a reactive proxy)
      expect(sentBody).toEqual({ name: 'Bob', email: 'alice@test.com', age: 30 })
    })
  })
})
