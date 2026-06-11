import { getRequestIP } from 'h3'
import type { RateLimitConfig, ActionMiddleware } from '../../types'
import { createActionError } from './defineAction'

interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * In-memory rate limiting middleware for actions.
 *
 * Tracks request counts per client key (defaults to IP address) within a
 * sliding time window. When the limit is exceeded, throws an `ActionError`
 * with code `RATE_LIMIT` and HTTP status 429.
 *
 * Expired entries are pruned on every check to prevent memory leaks.
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
export function rateLimitMiddleware(config: RateLimitConfig): ActionMiddleware {
  const { limit, window: windowMs = 60_000, message = 'Too many requests', maxEntries = 100_000 } = config
  const store = new Map<string, RateLimitEntry>()
  let lastSweep = 0

  return async ({ event, next }) => {
    const now = Date.now()

    /*
     * Correctness rests on per-key lazy expiry below, so the global sweep is
     * pure housekeeping. Running it on every request makes each request O(n)
     * in tracked keys — a CPU-exhaustion vector under a spoofed-key flood.
     * Amortize it to at most once per window instead.
     */
    if (now - lastSweep >= windowMs) {
      lastSweep = now
      for (const [key, entry] of store) {
        if (now >= entry.resetAt) {
          store.delete(key)
        }
      }
    }

    // Resolve the client key
    const key = config.keyFn
      ? config.keyFn(event)
      : getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'

    const entry = store.get(key)

    if (entry && now < entry.resetAt) {
      // Window still active — count toward the limit (lazy expiry)
      entry.count++
      if (entry.count > limit) {
        throw createActionError({
          code: 'RATE_LIMIT',
          message,
          statusCode: 429,
        })
      }
    }
    else {
      // First request, or the previous window expired — start a fresh window
      store.set(key, { count: 1, resetAt: now + windowMs })
      /*
       * Bound memory between sweeps: evict oldest (insertion-order) keys when
       * a flood grows the store past the cap.
       */
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value as string
        store.delete(oldest)
      }
    }

    return next()
  }
}
