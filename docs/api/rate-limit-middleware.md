# rateLimitMiddleware()

In-memory rate limiting middleware for actions. Tracks request counts per client key within a sliding time window.

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
  keyFn?: (event: H3Event) => string
  /** Custom error message. Default: 'Too many requests' */
  message?: string
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | `number` | Yes | - | Maximum requests per window |
| `window` | `number` | No | `60000` | Window duration in milliseconds |
| `keyFn` | `(event: H3Event) => string` | No | IP address | Client identification function |
| `message` | `string` | No | `'Too many requests'` | Error message when limit exceeded |

---

## Behavior

- Tracks request counts per client key (defaults to IP via `getRequestIP`)
- When the limit is exceeded, throws an `ActionError` with code `RATE_LIMIT` and HTTP status `429`
- Expired entries are pruned on every check to prevent memory leaks
- Uses an in-memory `Map` -- state is lost on server restart

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

### Per-Action Rate Limiting

```ts
// Different limits for different actions
export default defineAction({
  input: z.object({ email: z.string().email() }),
  middleware: [rateLimitMiddleware({ limit: 5, window: 300000 })], // 5 per 5 minutes
  handler: async ({ input }) => {
    return sendPasswordReset(input.email)
  },
})
```

---

## Auto-Import

`rateLimitMiddleware` is auto-imported in the `server/` directory when the module is installed.

## See Also

- [csrfMiddleware](/api/csrf-middleware) -- CSRF protection middleware
- [defineMiddleware](/api/define-middleware) -- Custom middleware creation
- [Security Guide](/guide/security) -- Security best practices
