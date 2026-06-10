import { getRequestIP } from 'h3'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rateLimitMiddleware } from '../../src/runtime/server/utils/rateLimitMiddleware'

vi.mock('h3', () => ({
  getRequestIP: vi.fn(),
}))

function middlewareArgs(event: unknown = {}) {
  return { event, ctx: {}, metadata: {}, next: vi.fn(async () => ({})) }
}

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
