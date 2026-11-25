import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-actions advanced features', async () => {
  await setup({
    server: true,
  })

  // ── Login / Middleware ──────────────────────────────────────

  it('login succeeds with valid credentials', async () => {
    const res = await $fetch('/api/_actions/login', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'password123' },
    })
    expect(res.success).toBe(true)
    expect(res.data.user.email).toBe('admin@example.com')
    expect(res.data.token).toBe('demo-jwt-token')
    expect(res.data.meta).toHaveProperty('requestTime')
  })

  it('login fails with invalid credentials', async () => {
    const res = await $fetch('/api/_actions/login', {
      method: 'POST',
      body: { email: 'wrong@example.com', password: 'wrongpassword' },
    })

    expect(res.success).toBe(false)
    expect(res.error.code).toBe('INVALID_CREDENTIALS')
    expect(res.error.statusCode).toBe(401)
  })

  it('login validates email format', async () => {
    const res = await $fetch('/api/_actions/login', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'password123' },
    })

    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  it('login validates password length', async () => {
    const res = await $fetch('/api/_actions/login', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'short' },
    })

    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  // ── Register / Form Actions ────────────────────────────────

  it('register succeeds with valid input', async () => {
    const res = await $fetch('/api/_actions/register', {
      method: 'POST',
      body: { name: 'John Doe', email: 'john@example.com', password: 'password123' },
    })
    expect(res.success).toBe(true)
    expect(res.data.name).toBe('John Doe')
    expect(res.data.email).toBe('john@example.com')
    expect(res.data).toHaveProperty('id')
  })

  it('register returns field error for duplicate email', async () => {
    const res = await $fetch('/api/_actions/register', {
      method: 'POST',
      body: { name: 'Test User', email: 'taken@example.com', password: 'password123' },
    })
    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
    expect(res.error.fieldErrors).toHaveProperty('email')
  })

  it('register validates short name', async () => {
    const res = await $fetch('/api/_actions/register', {
      method: 'POST',
      body: { name: 'J', email: 'j@example.com', password: 'password123' },
    })
    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  // ── Flaky API / Retry ──────────────────────────────────────

  it('flaky-api fails on non-3rd attempt', async () => {
    const res = await $fetch('/api/_actions/flaky-api', {
      method: 'POST',
      body: { message: 'test' },
    })
    // First call will fail (attempt 1 or 2)
    expect(res.success).toBe(false)
    expect(res.error.code).toBe('TEMPORARY_FAILURE')
    expect(res.error.statusCode).toBe(503)
  })

  // ── Slow Endpoint / Timeout ────────────────────────────────

  it('slow-endpoint responds after delay', async () => {
    const res = await $fetch('/api/_actions/slow-endpoint', {
      method: 'POST',
      body: { delayMs: 100, label: 'test' },
    })
    expect(res.success).toBe(true)
    expect(res.data.label).toBe('test')
    expect(res.data.delayMs).toBe(100)
    expect(res.data).toHaveProperty('completedAt')
  })

  // ── Throttle Counter ───────────────────────────────────────

  it('throttle-counter increments', async () => {
    const res = await $fetch('/api/_actions/throttle-counter', {
      method: 'POST',
      body: { increment: 5 },
    })
    expect(res.success).toBe(true)
    expect(res.data.counter).toBeGreaterThanOrEqual(5)
    expect(res.data).toHaveProperty('timestamp')
  })

  // ── Output Validation ──────────────────────────────────────

  it('validated-output returns correct structure for admin', async () => {
    const res = await $fetch('/api/_actions/validated-output', {
      method: 'POST',
      body: { name: 'Admin User', role: 'admin' },
    })
    expect(res.success).toBe(true)
    expect(res.data.name).toBe('Admin User')
    expect(res.data.role).toBe('admin')
    expect(res.data.permissions).toEqual(['read', 'write', 'delete', 'manage'])
    expect(res.data).toHaveProperty('id')
  })

  it('validated-output returns correct permissions for guest', async () => {
    const res = await $fetch('/api/_actions/validated-output', {
      method: 'POST',
      body: { name: 'Guest', role: 'guest' },
    })
    expect(res.success).toBe(true)
    expect(res.data.permissions).toEqual(['read'])
  })

  // ── Echo Headers ───────────────────────────────────────────

  it('echo-headers returns custom headers', async () => {
    const res = await $fetch('/api/_actions/echo-headers', {
      method: 'POST',
      body: { ping: 'test' },
      headers: {
        'X-Custom-Token': 'my-token',
        'X-Request-Id': 'req-123',
      },
    })
    expect(res.success).toBe(true)
    expect(res.data.ping).toBe('test')
    expect(res.data.receivedHeaders['x-custom-token']).toBe('my-token')
    expect(res.data.receivedHeaders['x-request-id']).toBe('req-123')
  })

  // ── Middleware Chain ────────────────────────────────────────

  it('complete middleware chain passes all context', async () => {
    const res = await $fetch('/api/_actions/middleware-chain', {
      method: 'POST',
      body: { label: 'test' },
    })
    expect(res.success).toBe(true)
    expect(res.data.middlewareRan).toEqual({ mw1: true, mw2: true, mw3: true })
    expect(res.data.handlerRan).toBe(true)
  })

  it('broken middleware chain skips remaining middleware', async () => {
    const res = await $fetch('/api/_actions/middleware-chain-skip', {
      method: 'POST',
      body: { label: 'test' },
    })
    expect(res.success).toBe(true)
    expect(res.data.middlewareRan.mw1).toBe(true)
    expect(res.data.middlewareRan.mw3).toBe(false)
    expect(res.data.handlerRan).toBe(true)
  })

  // ── Missing Body ───────────────────────────────────────────

  it('handles missing body gracefully', async () => {
    const res = await $fetch('/api/_actions/create-todo', {
      method: 'POST',
    })

    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
  })
})
