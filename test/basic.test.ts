import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-actions', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
    setupTimeout: 600000,
  })

  // ── Page rendering ────────────────────────────────────────────

  it('renders the page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('nuxt-actions test')
  })

  // ── Input validation ──────────────────────────────────────────

  describe('input validation', () => {
    it('validates input and returns data on success', async () => {
      const result = await $fetch('/api/echo', {
        method: 'POST',
        body: { message: 'hello' },
      })
      expect(result).toEqual({
        success: true,
        data: { echo: 'hello' },
      })
    })

    it('returns validation error on invalid input', async () => {
      const result = await $fetch('/api/echo', {
        method: 'POST',
        body: { message: '' },
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(result.error.message).toBe('Input validation failed')
      expect(result.error.statusCode).toBe(422)
      expect(result.error.fieldErrors).toBeDefined()
      expect(result.error.fieldErrors.message).toContain('Too small: expected string to have >=1 characters')
    })

    it('returns validation error on missing input', async () => {
      const result = await $fetch('/api/echo', {
        method: 'POST',
        body: {},
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(result.error.fieldErrors.message).toBeDefined()
    })

    it('returns validation error with multiple field errors', async () => {
      const result = await $fetch('/api/echo', {
        method: 'POST',
        body: { notAField: true },
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ── No input schema ───────────────────────────────────────────

  describe('action without input schema', () => {
    it('succeeds without input validation', async () => {
      const result = await $fetch('/api/no-input', {
        method: 'POST',
        body: {},
      })
      expect(result).toEqual({
        success: true,
        data: { message: 'no input required' },
      })
    })

    it('succeeds with any body when no schema defined', async () => {
      const result = await $fetch('/api/no-input', {
        method: 'POST',
        body: { random: 'data', extra: 123 },
      })
      expect(result.success).toBe(true)
      expect(result.data.message).toBe('no input required')
    })
  })

  // ── GET method ────────────────────────────────────────────────

  describe('GET method actions', () => {
    it('parses query parameters for GET requests', async () => {
      const result = await $fetch('/api/items?limit=3')
      expect(result.success).toBe(true)
      expect(result.data.items).toHaveLength(3)
      expect(result.data.total).toBe(3)
    })

    it('uses default values when query params are missing', async () => {
      const result = await $fetch('/api/items')
      expect(result.success).toBe(true)
      expect(result.data.items).toHaveLength(5) // default limit = 5
      expect(result.data.total).toBe(5)
    })

    it('coerces query param types correctly', async () => {
      const result = await $fetch('/api/items?limit=2')
      expect(result.success).toBe(true)
      expect(result.data.items).toHaveLength(2)
      expect(result.data.items[0]).toEqual({ id: 1, name: 'Item 1' })
      expect(result.data.items[1]).toEqual({ id: 2, name: 'Item 2' })
    })
  })

  // ── PUT method ────────────────────────────────────────────────

  describe('PUT method actions', () => {
    it('handles PUT requests with body', async () => {
      const result = await $fetch('/api/update', {
        method: 'PUT',
        body: { id: 42, name: 'Updated' },
      })
      expect(result).toEqual({
        success: true,
        data: { id: 42, name: 'Updated', updated: true },
      })
    })

    it('validates PUT request body', async () => {
      const result = await $fetch('/api/update', {
        method: 'PUT',
        body: { id: 42, name: '' },
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ── Middleware ─────────────────────────────────────────────────

  describe('middleware', () => {
    it('runs middleware chain and passes context to handler', async () => {
      const result = await $fetch('/api/with-middleware', {
        method: 'POST',
        body: { data: 'test' },
      })
      expect(result.success).toBe(true)
      expect(result.data.data).toBe('test')
      expect(result.data.requestId).toBe('req-123')
      expect(result.data.timestamp).toBe(1000)
    })

    it('returns error when middleware throws ActionError', async () => {
      const result = await $fetch('/api/middleware-error', {
        method: 'POST',
        body: {},
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('UNAUTHORIZED')
      expect(result.error.message).toBe('Authentication required')
      expect(result.error.statusCode).toBe(401)
    })
  })

  // ── createActionError ─────────────────────────────────────────

  describe('createActionError', () => {
    it('returns ActionError with custom code and message', async () => {
      const result = await $fetch('/api/action-error', {
        method: 'POST',
        body: {},
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('NOT_FOUND')
      expect(result.error.message).toBe('Resource not found')
      expect(result.error.statusCode).toBe(404)
    })

    it('uses default statusCode 400 when not specified', async () => {
      const result = await $fetch('/api/action-error-default', {
        method: 'POST',
        body: {},
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('BAD_REQUEST')
      expect(result.error.statusCode).toBe(400)
    })

    it('includes fieldErrors when provided', async () => {
      const result = await $fetch('/api/action-error-fields', {
        method: 'POST',
        body: {},
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('CUSTOM_VALIDATION')
      expect(result.error.statusCode).toBe(422)
      expect(result.error.fieldErrors).toEqual({
        email: ['Email is already taken'],
        username: ['Username too short', 'Username contains invalid characters'],
      })
    })
  })

  // ── Handler errors ────────────────────────────────────────────

  describe('handler errors', () => {
    it('catches regular Error thrown in handler', async () => {
      const result = await $fetch('/api/handler-error', {
        method: 'POST',
        body: {},
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('INTERNAL_ERROR')
      expect(result.error.message).toBe('An unexpected error occurred')
      expect(result.error.statusCode).toBe(500)
    })
  })

  // ── E2E Type Inference (server/actions/) ─────────────────────

  describe('actions (server/actions/)', () => {
    it('routes POST action via /api/_actions/', async () => {
      const result = await $fetch('/api/_actions/create-item', {
        method: 'POST',
        body: { name: 'Test Item' },
      })
      expect(result.success).toBe(true)
      expect(result.data.name).toBe('Test Item')
      expect(result.data.created).toBe(true)
      expect(result.data.id).toBeDefined()
    })

    it('validates input for actions', async () => {
      const result = await $fetch('/api/_actions/create-item', {
        method: 'POST',
        body: { name: '' },
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
    })

    it('routes GET action via /api/_actions/', async () => {
      const result = await $fetch('/api/_actions/list-items')
      expect(result.success).toBe(true)
      expect(result.data.items).toHaveLength(2)
      expect(result.data.items[0]).toEqual({ id: 1, name: 'Item 1' })
    })
  })

  // ── Valibot integration ──────────────────────────────────────

  describe('Valibot schema', () => {
    it('validates and returns data on success', async () => {
      const result = await $fetch('/api/valibot-echo', {
        method: 'POST',
        body: { message: 'hello valibot' },
      })
      expect(result).toEqual({
        success: true,
        data: { echo: 'hello valibot', schema: 'valibot' },
      })
    })

    it('returns validation error on invalid input', async () => {
      const result = await $fetch('/api/valibot-echo', {
        method: 'POST',
        body: { message: '' },
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(result.error.statusCode).toBe(422)
    })
  })

  // ── ArkType integration ─────────────────────────────────────

  describe('ArkType schema', () => {
    it('validates and returns data on success', async () => {
      const result = await $fetch('/api/arktype-echo', {
        method: 'POST',
        body: { message: 'hello arktype' },
      })
      expect(result).toEqual({
        success: true,
        data: { echo: 'hello arktype', schema: 'arktype' },
      })
    })

    it('returns validation error on invalid input', async () => {
      const result = await $fetch('/api/arktype-echo', {
        method: 'POST',
        body: { message: '' },
      })
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(result.error.statusCode).toBe(422)
    })
  })

  // ── Response format ───────────────────────────────────────────

  describe('response format', () => {
    it('success response has correct shape', async () => {
      const result = await $fetch('/api/echo', {
        method: 'POST',
        body: { message: 'test' },
      })
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('data')
      expect(result).not.toHaveProperty('error')
    })

    it('error response has correct shape', async () => {
      const result = await $fetch('/api/action-error', {
        method: 'POST',
        body: {},
      })
      expect(result).toHaveProperty('success', false)
      expect(result).toHaveProperty('error')
      expect(result.error).toHaveProperty('code')
      expect(result.error).toHaveProperty('message')
      expect(result.error).toHaveProperty('statusCode')
      expect(result).not.toHaveProperty('data')
    })
  })
})
