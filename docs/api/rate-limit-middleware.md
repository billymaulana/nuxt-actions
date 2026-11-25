---
description: "API reference for rateLimitMiddleware: limit requests per client within a time window, with custom keys, rate limit headers, Retry-After, and pluggable stores."
---

# rateLimitMiddleware()

Limits how many requests each client can make within a time window. Over the limit, the action fails with `RATE_LIMIT` and tells the client when to try again.

## Type Signature

```ts
function rateLimitMiddleware(config: RateLimitConfig): ActionMiddleware
```

### Parameters

```ts
interface RateLimitConfig {
  /** Maximum number of requests per window */
  limit: number
  /** Time window in milliseconds. Default: 60000 (1 minute) */
  window?: number
  /** Custom key function to identify the client. Default: IP address */
  keyFn?: (event: ServerEvent) => string
  /** Custom error message. Default: 'Too many requests' */
  message?: string
  /** Most client keys the default in-memory store tracks. Default: 100000 */
  maxEntries?: number
  /** Where request counts are kept. Default: an in-memory store per middleware instance */
  store?: RateLimitStore
  /** Let requests through instead of failing with RATE_LIMIT_STORE_ERROR (503) when the store throws. Default: false */
  passOnStoreError?: boolean
  /** Send RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset on every response. Default: false */
  headers?: boolean
}

interface RateLimitStore {
  /** Count one request for `key` and return the count in the current window. */
  hit: (key: string, windowMs: number) => RateLimitHit | Promise<RateLimitHit>
}

interface RateLimitHit {
  /** Requests counted in the current window, including this one */
  count: number
  /** When the current window ends, in epoch milliseconds */
  resetAt: number
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | `number` | Yes | - | Maximum requests per window |
| `window` | `number` | No | `60000` | Window duration in milliseconds |
| `keyFn` | `(event: ServerEvent) => string` | No | IP address | Client identification function |
| `message` | `string` | No | `'Too many requests'` | Error message when the limit is exceeded |
| `maxEntries` | `number` | No | `100000` | Size bound of the default in-memory store |
| `store` | `RateLimitStore` | No | in-memory | Shared storage, such as Redis |
| `passOnStoreError` | `boolean` | No | `false` | Let requests through when the store fails |
| `headers` | `boolean` | No | `false` | Send `RateLimit-*` headers on every response |

---

## Behavior

- Counts requests per client key in fixed windows: the first request opens a window of `window` milliseconds, and the count starts over when it ends.
- Over the limit, the action fails with code `RATE_LIMIT`, status `429`, and `retryAfter`: the whole seconds until the window ends. The response also carries a `Retry-After` header with the same value. Clients can wait for it with [`retry: { respectRetryAfter: true }`](/api/use-action#retry).
- With `headers: true`, every response carries `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (seconds until the window ends), the names of the IETF draft.
- The default key is the client IP: the first `X-Forwarded-For` entry, then the socket address. `X-Forwarded-For` is set by the client unless your proxy overwrites it, so behind no proxy, or one that appends to it, pass a `keyFn` that uses the address you trust.
- When the store throws, or returns a result without a finite `count` and a numeric `resetAt`, the action fails with `RATE_LIMIT_STORE_ERROR` and status `503`. With `passOnStoreError: true` the request goes through unlimited instead.

### The default store

Each `rateLimitMiddleware()` call gets its own in-memory store, created with `createMemoryRateLimitStore({ maxEntries })`. A hit is O(1). Expired windows are swept at most once per window, so the sweep costs O(n) in tracked keys at most once a window, not on every request. Past `maxEntries` the oldest key is dropped, which bounds memory to O(maxEntries) even under a flood of spoofed keys.

The counts live in one server process. When the app runs on more than one instance, or on serverless functions, pass a shared `store`.

---

## Examples

### Basic Rate Limiting

```ts
// 10 requests per minute per IP
const limitedAction = createActionClient()
  .use(rateLimitMiddleware({ limit: 10, window: 60000 }))
  .schema(z.object({ email: z.string() }))
  .action(async ({ input }) => {
    return db.findUser(input.email)
  })
```

### Custom Key Function

```ts
// Rate limit by authenticated user ID
const userAction = createActionClient()
  .use(rateLimitMiddleware({
    limit: 100,
    window: 60000,
    keyFn: (event) => {
      return event.context.auth?.userId
        ?? getRequestIP(event, { xForwardedFor: true })
        ?? 'unknown'
    },
    message: 'Rate limit exceeded. Please try again later.',
  }))
```

### Per-Action Rate Limiting with Headers

```ts
export default defineAction({
  input: z.object({ email: z.string().email() }),
  middleware: [rateLimitMiddleware({ limit: 5, window: 300000, headers: true })], // 5 per 5 minutes
  handler: async ({ input }) => {
    return sendPasswordReset(input.email)
  },
})
```

### Shared Store with Redis

Limiters that share a store share their counts for the same client key, and the first hit of a window sets its length for all of them. Give each limiter its own name:

```ts
// server/utils/rate-limit-store.ts
import Redis from 'ioredis'
import type { RateLimitStore } from 'nuxt-actions/types'

const redis = new Redis(process.env.REDIS_URL!)

const HIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`

export function redisRateLimitStore(name: string): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const [count, ttl] = await redis.eval(HIT, 1, `rate-limit:${name}:${key}`, windowMs) as [number, number]
      return { count, resetAt: Date.now() + Math.max(ttl, 0) }
    },
  }
}
```

```ts
export default defineAction({
  middleware: [rateLimitMiddleware({ limit: 5, window: 900_000, store: redisRateLimitStore('login') })],
  handler: async () => ({ ok: true }),
})
```

The script counts the request and sets the window's expiry in one atomic step, so every instance sees the same count and a window always ends on time.

---

## Auto-Import

`rateLimitMiddleware` and `createMemoryRateLimitStore` are auto-imported in the `server/` directory when the module is installed.

## See Also

- [originMiddleware](/api/origin-middleware) -- CSRF protection without tokens
- [csrfMiddleware](/api/csrf-middleware) -- Token-based CSRF protection
- [defineMiddleware](/api/define-middleware) -- Custom middleware creation
- [Security Guide](/guide/security) -- Security best practices
