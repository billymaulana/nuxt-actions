import { createMemoryRateLimitStore, rateLimitMiddleware } from '../../src/runtime/server/utils/rateLimitMiddleware'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setHeader } from 'h3'
import { createActionError } from '../../src/runtime/server/utils/defineAction'

// Mock h3's getRequestIP
vi.mock('h3', () => ({
  getRequestIP: vi.fn(() => '127.0.0.1'),
  setHeader: vi.fn(),
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

describe('rateLimitMiddleware with a custom store', () => {
  it('asks the store for the current count', async () => {
    const hit = vi.fn(() => ({ count: 1, resetAt: Date.now() + 60_000 }))
    const middleware = rateLimitMiddleware({ limit: 2, store: { hit } })
    const ctx = createMockContext()

    await middleware(ctx as never)

    expect(hit).toHaveBeenCalledWith('127.0.0.1', 60_000)
    expect(ctx.next).toHaveBeenCalled()
  })

  it('rejects when the store reports a count over the limit', async () => {
    const middleware = rateLimitMiddleware({ limit: 2, store: { hit: () => ({ count: 3, resetAt: Date.now() + 1000 }) } })

    await expect(middleware(createMockContext() as never)).rejects.toMatchObject({ code: 'RATE_LIMIT', statusCode: 429 })
  })

  it('waits for an async store', async () => {
    const middleware = rateLimitMiddleware({ limit: 1, store: { hit: async () => ({ count: 2, resetAt: Date.now() + 1000 }) } })

    await expect(middleware(createMockContext() as never)).rejects.toMatchObject({ code: 'RATE_LIMIT' })
  })

  it('rejects with RATE_LIMIT_STORE_ERROR when the store fails', async () => {
    const middleware = rateLimitMiddleware({
      limit: 1,
      store: {
        hit: () => {
          throw new Error('Redis is down')
        },
      },
    })
    const ctx = createMockContext()

    await expect(middleware(ctx as never)).rejects.toMatchObject({
      code: 'RATE_LIMIT_STORE_ERROR',
      message: 'Rate limit store unavailable',
      statusCode: 503,
    })
    expect(ctx.next).not.toHaveBeenCalled()
  })

  it('treats a store result without a numeric count and reset time as a store failure', async () => {
    for (const result of [{}, { count: null, resetAt: Date.now() }, { count: Number.NaN, resetAt: Date.now() }, { count: 1, resetAt: 'soon' }, null]) {
      const ctx = createMockContext()
      const middleware = rateLimitMiddleware({ limit: 1, store: { hit: () => result as never } })

      await expect(middleware(ctx as never)).rejects.toMatchObject({ code: 'RATE_LIMIT_STORE_ERROR', statusCode: 503 })
      expect(ctx.next).not.toHaveBeenCalled()
    }

    const passing = createMockContext()
    await rateLimitMiddleware({ limit: 1, passOnStoreError: true, store: { hit: () => ({}) as never } })(passing as never)
    expect(passing.next).toHaveBeenCalled()
  })

  it('asks for a one-second wait when the store has no comparable reset time', async () => {
    const middleware = rateLimitMiddleware({ limit: 1, store: { hit: () => ({ count: 5, resetAt: Number.NaN }) } })

    await expect(middleware(createMockContext() as never)).rejects.toMatchObject({ code: 'RATE_LIMIT', retryAfter: 1 })
  })

  it('lets the request through when passOnStoreError is set and the store fails', async () => {
    const middleware = rateLimitMiddleware({
      limit: 1,
      passOnStoreError: true,
      store: { hit: () => Promise.reject(new Error('Redis is down')) },
    })
    const ctx = createMockContext()

    await middleware(ctx as never)

    expect(ctx.next).toHaveBeenCalled()
  })
})

describe('createMemoryRateLimitStore', () => {
  it('counts hits per key inside one window', async () => {
    const store = createMemoryRateLimitStore()

    const first = await store.hit('a', 1000)
    const second = await store.hit('a', 1000)
    const other = await store.hit('b', 1000)

    expect([first.count, second.count, other.count]).toEqual([1, 2, 1])
    expect(second.resetAt).toBe(first.resetAt)
  })

  it('starts a new window once the previous one has passed', async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryRateLimitStore()
      await store.hit('a', 1000)
      await store.hit('a', 1000)
      vi.advanceTimersByTime(1001)

      expect((await store.hit('a', 1000)).count).toBe(1)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('expires a key that runs out between two sweeps', async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryRateLimitStore()
      await store.hit('a', 1000)
      vi.advanceTimersByTime(900)
      await store.hit('b', 1000)
      vi.advanceTimersByTime(600)
      await store.hit('c', 1000)
      vi.advanceTimersByTime(500)

      expect((await store.hit('b', 1000)).count).toBe(1)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('evicts the oldest keys past maxEntries', async () => {
    const store = createMemoryRateLimitStore({ maxEntries: 2 })
    await store.hit('a', 1000)
    await store.hit('a', 1000)
    await store.hit('b', 1000)
    await store.hit('c', 1000)

    expect((await store.hit('a', 1000)).count).toBe(1)
  })
})

describe('rateLimitMiddleware response headers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets Retry-After and error.retryAfter when it rejects', async () => {
    vi.useFakeTimers()
    try {
      const middleware = rateLimitMiddleware({ limit: 1, window: 10_000 })
      await middleware(createMockContext() as never)
      vi.advanceTimersByTime(2500)
      const ctx = createMockContext()

      await expect(middleware(ctx as never)).rejects.toMatchObject({ code: 'RATE_LIMIT', statusCode: 429, retryAfter: 8 })
      expect(setHeader).toHaveBeenCalledWith(ctx.event, 'Retry-After', '8')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('never advertises less than one second', async () => {
    const middleware = rateLimitMiddleware({ limit: 1, store: { hit: () => ({ count: 2, resetAt: Date.now() - 50 }) } })

    await expect(middleware(createMockContext() as never)).rejects.toMatchObject({ retryAfter: 1 })
  })

  it('sets RateLimit headers on allowed requests when headers is on', async () => {
    vi.useFakeTimers()
    try {
      const middleware = rateLimitMiddleware({ limit: 3, window: 60_000, headers: true })
      const ctx = createMockContext()

      await middleware(ctx as never)

      expect(setHeader).toHaveBeenCalledWith(ctx.event, 'RateLimit-Limit', '3')
      expect(setHeader).toHaveBeenCalledWith(ctx.event, 'RateLimit-Remaining', '2')
      expect(setHeader).toHaveBeenCalledWith(ctx.event, 'RateLimit-Reset', '60')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('reports nothing remaining on a rejected request when headers is on', async () => {
    const middleware = rateLimitMiddleware({ limit: 1, window: 60_000, headers: true })
    await middleware(createMockContext() as never)
    vi.mocked(setHeader).mockClear()
    const ctx = createMockContext()

    await expect(middleware(ctx as never)).rejects.toMatchObject({ code: 'RATE_LIMIT' })
    expect(setHeader).toHaveBeenCalledWith(ctx.event, 'RateLimit-Remaining', '0')
  })

  it('does not set RateLimit headers by default', async () => {
    const middleware = rateLimitMiddleware({ limit: 3 })

    await middleware(createMockContext() as never)

    expect(setHeader).not.toHaveBeenCalled()
  })
})

describe('createActionError retryAfter', () => {
  it('keeps retryAfter on the error', () => {
    expect(createActionError({ code: 'RATE_LIMIT', message: 'Slow down', statusCode: 429, retryAfter: 5 })).toMatchObject({ retryAfter: 5 })
  })

  it('leaves retryAfter out when it is not given', () => {
    expect(Object.keys(createActionError({ code: 'X', message: 'Y' }))).not.toContain('retryAfter')
  })
})
