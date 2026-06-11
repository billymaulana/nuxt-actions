import { getRequestIP } from 'h3'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rateLimitMiddleware } from '../../src/runtime/server/utils/rateLimitMiddleware'

vi.mock('h3', () => ({
  getRequestIP: vi.fn(),
}))

function middlewareArgs(event: unknown = {}) {
  return { event, ctx: {}, metadata: {}, next: vi.fn(async () => ({})) }
}

describe('rateLimitMiddleware memory bounding (A5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('evicts the oldest keys once the store exceeds maxEntries', async () => {
    let counter = 0
    const middleware = rateLimitMiddleware({
      limit: 1,
      window: 60_000,
      maxEntries: 3,
      keyFn: () => `client-${counter}`,
    })

    for (let i = 0; i < 5; i++) {
      counter = i
      await middleware(middlewareArgs() as never)
    }

    // client-0 was evicted (cap 3), so re-hitting it is a fresh window, not 429
    counter = 0
    const replay = middlewareArgs()
    await middleware(replay as never)
    expect(replay.next).toHaveBeenCalled()
  })

  it('the amortized sweep deletes expired entries but keeps fresh ones', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let counter = 1
    const middleware = rateLimitMiddleware({ limit: 5, window: 1000, keyFn: () => `c-${counter}` })

    counter = 1
    await middleware(middlewareArgs() as never) // c-1, expires at 1000

    vi.setSystemTime(900)
    counter = 2
    await middleware(middlewareArgs() as never) // c-2, expires at 1900 (fresh)

    // Next request past a full window triggers the sweep: c-1 is expired
    // (delete branch), c-2 is still fresh (skip branch).
    vi.setSystemTime(1200)
    counter = 3
    const third = middlewareArgs()
    await middleware(third as never)
    expect(third.next).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('still expires a key lazily even when the global sweep is amortized away', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const counter = 1
    const middleware = rateLimitMiddleware({ limit: 1, window: 1000, keyFn: () => `c-${counter}` })

    await middleware(middlewareArgs() as never) // c-1, expires at 1000

    vi.setSystemTime(1500) // past expiry; amortized sweep won't have run for c-1
    const reuse = middlewareArgs()
    await middleware(reuse as never) // c-1 again → lazy fresh window, not 429
    expect(reuse.next).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('rateLimitMiddleware key and window fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shares a single bucket across clients when the request IP is unavailable', async () => {
    vi.mocked(getRequestIP).mockReturnValue(undefined)
    const middleware = rateLimitMiddleware({ limit: 1, window: 60_000 })

    const first = middlewareArgs()
    await middleware(first as never)
    expect(first.next).toHaveBeenCalled()

    const second = middlewareArgs()
    await expect(middleware(second as never)).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      statusCode: 429,
    })
  })

  it('restarts the window instead of blocking when the reset time is not comparable', async () => {
    vi.mocked(getRequestIP).mockReturnValue(undefined)
    const middleware = rateLimitMiddleware({ limit: 1, window: Number.NaN })

    for (let i = 0; i < 3; i++) {
      const args = middlewareArgs()
      await middleware(args as never)
      expect(args.next).toHaveBeenCalled()
    }
  })
})
