import { rateLimitMiddleware } from '../../src/runtime/server/utils/rateLimitMiddleware'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock h3's getRequestIP
vi.mock('h3', () => ({
  getRequestIP: vi.fn(() => '127.0.0.1'),
}))

function createMockContext(event = {} as never) {
  let nextCalled = false
  const nextResult = { result: 'ok' }
  return {
    event,
    ctx: {},
    metadata: {},
    next: vi.fn(async () => {
      nextCalled = true
      return nextResult
    }),
    get nextCalled() { return nextCalled },
  }
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows requests under the limit', async () => {
    const middleware = rateLimitMiddleware({ limit: 3, window: 60000 })

    // Should allow 3 requests
    for (let i = 0; i < 3; i++) {
      const ctx = createMockContext()
      await middleware(ctx as never)
      expect(ctx.next).toHaveBeenCalled()
    }
  })

  it('blocks requests over the limit', async () => {
    const middleware = rateLimitMiddleware({ limit: 2, window: 60000 })

    // Allow first 2
    for (let i = 0; i < 2; i++) {
      const ctx = createMockContext()
      await middleware(ctx as never)
    }

    // Third request should be blocked
    const ctx = createMockContext()
    await expect(middleware(ctx as never)).rejects.toEqual(
      expect.objectContaining({
        code: 'RATE_LIMIT',
        statusCode: 429,
        message: 'Too many requests',
        __isActionError: true,
      }),
    )
  })

  it('resets after the time window', async () => {
    vi.useFakeTimers()

    const middleware = rateLimitMiddleware({ limit: 1, window: 1000 })

    // First request OK
    const ctx1 = createMockContext()
    await middleware(ctx1 as never)
    expect(ctx1.next).toHaveBeenCalled()

    // Second request blocked (over limit)
    const ctx2 = createMockContext()
    await expect(middleware(ctx2 as never)).rejects.toEqual(
      expect.objectContaining({ code: 'RATE_LIMIT' }),
    )

    // Advance time past the window
    vi.advanceTimersByTime(1001)

    // Third request should succeed (window expired)
    const ctx3 = createMockContext()
    await middleware(ctx3 as never)
    expect(ctx3.next).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('uses custom keyFn when provided', async () => {
    const keyFn = vi.fn(() => 'user-42')

    const middleware = rateLimitMiddleware({
      limit: 1,
      window: 60000,
      keyFn,
    })

    const mockEvent = { context: { auth: { userId: 42 } } } as never

    // First request OK
    const ctx1 = createMockContext(mockEvent)
    await middleware(ctx1 as never)
    expect(keyFn).toHaveBeenCalledWith(mockEvent)

    // Second request blocked (same key)
    const ctx2 = createMockContext(mockEvent)
    await expect(middleware(ctx2 as never)).rejects.toEqual(
      expect.objectContaining({ code: 'RATE_LIMIT' }),
    )
  })

  it('uses custom error message', async () => {
    const middleware = rateLimitMiddleware({
      limit: 1,
      window: 60000,
      message: 'Slow down!',
    })

    // Exhaust the limit
    const ctx1 = createMockContext()
    await middleware(ctx1 as never)

    // Next request should fail with custom message
    const ctx2 = createMockContext()
    await expect(middleware(ctx2 as never)).rejects.toEqual(
      expect.objectContaining({
        code: 'RATE_LIMIT',
        message: 'Slow down!',
      }),
    )
  })

  it('tracks different keys independently', async () => {
    let currentKey = 'user-1'
    const middleware = rateLimitMiddleware({
      limit: 1,
      window: 60000,
      keyFn: () => currentKey,
    })

    // First request for user-1
    const ctx1 = createMockContext()
    await middleware(ctx1 as never)
    expect(ctx1.next).toHaveBeenCalled()

    // Second request for user-1 blocked
    const ctx2 = createMockContext()
    await expect(middleware(ctx2 as never)).rejects.toEqual(
      expect.objectContaining({ code: 'RATE_LIMIT' }),
    )

    // Request for user-2 should work (different key)
    currentKey = 'user-2'
    const ctx3 = createMockContext()
    await middleware(ctx3 as never)
    expect(ctx3.next).toHaveBeenCalled()
  })
})
