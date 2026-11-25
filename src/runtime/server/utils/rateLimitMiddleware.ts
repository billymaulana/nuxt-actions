import { getRequestIP, setHeader } from '../internal/server-runtime'
import type { RateLimitConfig, RateLimitHit, RateLimitStore, ActionMiddleware } from '../../types'
import { createActionError } from './defineAction'

/**
 * Fixed-window counter kept in this process's memory.
 *
 * Expired entries are swept at most once per window, and the oldest keys are
 * evicted past `maxEntries`, so a spoofed-key flood cannot grow it without bound.
 * Counts are not shared between server instances; pass a shared store for that.
 */
export function createMemoryRateLimitStore(
  options: { maxEntries?: number } = {},
): RateLimitStore & { hit: (key: string, windowMs: number) => RateLimitHit } {
  const maxEntries = options.maxEntries ?? 100_000
  const entries = new Map<string, RateLimitHit>()
  let lastSweep = 0

  return {
    hit(key, windowMs) {
      const now = Date.now()

      /*
       * Correctness rests on per-key lazy expiry below, so the global sweep is
       * pure housekeeping. Running it on every request makes each request O(n)
       * in tracked keys — a CPU-exhaustion vector under a spoofed-key flood.
       * Amortize it to at most once per window instead.
       */
      if (now - lastSweep >= windowMs) {
        lastSweep = now
        for (const [entryKey, entry] of entries) {
          if (now >= entry.resetAt) {
            entries.delete(entryKey)
          }
        }
      }

      const entry = entries.get(key)
      if (entry && now < entry.resetAt) {
        entry.count++
        return { count: entry.count, resetAt: entry.resetAt }
      }

      const fresh = { count: 1, resetAt: now + windowMs }
      entries.set(key, fresh)
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value as string
        entries.delete(oldest)
      }
      return { ...fresh }
    },
  }
}

/**
 * Rate limiting middleware for actions.
 *
 * Counts requests per client key (defaults to the IP address) in a fixed
 * window. When the limit is exceeded, throws an `ActionError` with code
 * `RATE_LIMIT` and HTTP status 429. Counts live in memory unless a shared
 * `store` is passed.
 *
 * @param config - Rate limit configuration.
 * @returns An `ActionMiddleware` that enforces rate limiting.
 *
 * @example
 * ```ts
 * // Basic usage — 10 requests per minute per IP
 * const authAction = createActionClient()
 *   .use(rateLimitMiddleware({ limit: 10, window: 60000 }))
 *   .schema(z.object({ email: z.string() }))
 *   .action(async ({ input }) => {
 *     return db.findUser(input.email)
 *   })
 * ```
 *
 * @example
 * ```ts
 * // Custom key function based on authenticated user ID
 * const userAction = createActionClient()
 *   .use(rateLimitMiddleware({
 *     limit: 100,
 *     window: 60000,
 *     keyFn: (event) => event.context.auth?.userId ?? getRequestIP(event, { xForwardedFor: true }) ?? 'unknown',
 *     message: 'Rate limit exceeded. Please try again later.',
 *   }))
 *   .schema(z.object({ query: z.string() }))
 *   .action(async ({ input }) => {
 *     return db.search(input.query)
 *   })
 * ```
 */
/** A store that throws, or returns no finite count or no numeric reset time, counts as unavailable. */
async function readHit(store: RateLimitStore, key: string, windowMs: number): Promise<RateLimitHit | undefined> {
  try {
    const hit = await store.hit(key, windowMs)
    return Number.isFinite(hit?.count) && typeof hit?.resetAt === 'number' ? hit : undefined
  }
  catch {
    return undefined
  }
}

export function rateLimitMiddleware(config: RateLimitConfig): ActionMiddleware {
  const { limit, window: windowMs = 60_000, message = 'Too many requests', maxEntries = 100_000 } = config
  const store = config.store ?? createMemoryRateLimitStore({ maxEntries })

  return async ({ event, next }) => {
    const key = config.keyFn
      ? config.keyFn(event)
      : getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'

    const hit = await readHit(store, key, windowMs)
    if (!hit) {
      if (config.passOnStoreError) return next()
      throw createActionError({
        code: 'RATE_LIMIT_STORE_ERROR',
        message: 'Rate limit store unavailable',
        statusCode: 503,
      })
    }

    const msUntilReset = hit.resetAt - Date.now()
    const secondsUntilReset = Number.isFinite(msUntilReset) ? Math.max(1, Math.ceil(msUntilReset / 1000)) : 1
    if (config.headers) {
      setHeader(event, 'RateLimit-Limit', String(limit))
      setHeader(event, 'RateLimit-Remaining', String(Math.max(0, limit - hit.count)))
      setHeader(event, 'RateLimit-Reset', String(secondsUntilReset))
    }

    if (hit.count > limit) {
      setHeader(event, 'Retry-After', String(secondsUntilReset))
      throw createActionError({
        code: 'RATE_LIMIT',
        message,
        statusCode: 429,
        retryAfter: secondsUntilReset,
      })
    }

    return next()
  }
}
