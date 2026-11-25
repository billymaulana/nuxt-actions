---
description: "Secure server actions in production: CSRF tokens, authentication, input validation, rate limiting, error sanitization, and safe action file scanning."
---

# Security

Best practices for securing your server actions in production.

## CSRF Protection

nuxt-actions has two middleware against cross-site request forgery. `originMiddleware()` rejects mutations that come from another site, from the `Sec-Fetch-Site` and `Origin` headers browsers send, so client code needs no changes:

```ts
const protectedAction = createActionClient()
  .use(originMiddleware())
  .schema(z.object({ title: z.string() }))
  .action(async ({ input }) => {
    return db.createPost(input)
  })
```

See the [originMiddleware API reference](/api/origin-middleware) for the exact rules and for `allowedOrigins`.

Both middleware check the request's own method. A mutation run with [callAction](/api/call-action) from a GET route is not checked, so expose mutations only through POST, PUT, PATCH, or DELETE routes.

`csrfMiddleware()` uses a token instead, with the double-submit cookie pattern:

```ts
const protectedAction = createActionClient()
  .use(csrfMiddleware())
  .schema(z.object({ title: z.string() }))
  .action(async ({ input }) => {
    return db.createPost(input)
  })
```

Custom configuration:

```ts
csrfMiddleware({
  cookieName: '__csrf',        // Default: '_csrf'
  headerName: 'x-xsrf-token', // Default: 'x-csrf-token'
  tokenLength: 64,             // Default: 32
})
```

On safe requests (GET, HEAD, OPTIONS), the middleware keeps the token already in the cookie or creates one, and sets it as a cookie that client code can read. On mutation requests (POST, PUT, PATCH, DELETE), it validates that the token in the request header matches the cookie value. Handlers receive the token as `ctx.csrfToken`.

See the [csrfMiddleware API reference](/api/csrf-middleware) for full details.

## Authentication Middleware

Protect actions with authentication middleware:

```ts
// server/utils/auth.ts
export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')

  if (!token) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      statusCode: 401,
    })
  }

  // Verify token (your logic here)
  const user = await verifyToken(token)

  if (!user) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
      statusCode: 401,
    })
  }

  return next({ ctx: { user } })
})
```

Apply it to protected actions:

```ts
// server/actions/create-todo.ts
export default defineAction({
  input: z.object({ title: z.string().min(1) }),
  middleware: [authMiddleware],
  handler: async ({ input, ctx }) => {
    // ctx.user is typed and available
    return db.todos.create({ ...input, userId: ctx.user.id })
  },
})
```

Or use the builder pattern for shared middleware:

```ts
// server/utils/action-client.ts
export const protectedAction = createActionClient()
  .use(authMiddleware)
  .use(rateLimitMiddleware)
```

```ts
// server/actions/create-todo.ts
export default protectedAction
  .schema(z.object({ title: z.string().min(1) }))
  .action(async ({ input, ctx }) => {
    return db.todos.create({ ...input, userId: ctx.user.id })
  })
```

## Input Validation

**Always validate input.** Server actions accept arbitrary user input — never trust it:

```ts
// Good: Input is validated before reaching the handler
export default defineAction({
  input: z.object({
    title: z.string().min(1).max(200),
    email: z.string().email(),
  }),
  handler: async ({ input }) => {
    // input.title and input.email are validated
  },
})

// Bad: No validation — input could be anything
export default defineAction({
  handler: async ({ input }) => {
    // input is unknown — SQL injection, XSS, etc. are all possible
  },
})
```

## Rate Limiting

Use the built-in `rateLimitMiddleware()` to prevent abuse:

```ts
const limitedAction = createActionClient()
  .use(rateLimitMiddleware({ limit: 10, window: 60000 }))
  .schema(z.object({ email: z.string() }))
  .action(async ({ input }) => {
    return db.findUser(input.email)
  })
```

Custom key function:

```ts
rateLimitMiddleware({
  limit: 100,
  window: 60000,
  keyFn: (event) => event.context.auth?.userId ?? getRequestIP(event) ?? 'unknown',
  message: 'Rate limit exceeded. Please try again later.',
})
```

Over the limit, the action fails with `RATE_LIMIT` and `retryAfter`, the seconds until the window ends, and the response carries a `Retry-After` header. `headers: true` adds `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` to every response. On the client, `retry: { respectRetryAfter: true }` waits that long before it retries.

The default key is the first `X-Forwarded-For` entry, which the client controls unless your proxy overwrites it. When the app can be reached without such a proxy, pass a `keyFn` built on an address you trust, or a client can get around the limit by sending a different header each time.

Counts live in the memory of one server process. With several instances, pass a shared `store`, as in [the Redis example](/api/rate-limit-middleware#shared-store-with-redis), and give each limiter its own name in it, or limiters that share the store also share their counts.

See the [rateLimitMiddleware API reference](/api/rate-limit-middleware) for full configuration options.

## Error Handling

Use `handleServerError` to prevent leaking internal details:

```ts
export default defineAction({
  input: z.object({ id: z.number() }),
  handleServerError(error) {
    // Log the real error server-side
    console.error('Action error:', error)

    // Return a safe error to the client
    return {
      code: 'SERVER_ERROR',
      message: 'Something went wrong',
      statusCode: 500,
    }
  },
  handler: async ({ input }) => {
    // If this throws, handleServerError catches it
    return db.todos.findOrFail(input.id)
  },
})
```

In production, `nuxt-actions` automatically hides internal error details — unknown errors return a generic `INTERNAL_ERROR` message. In development (`import.meta.dev`), the full error is logged to the console.

## File-based Security

- **Underscore-prefixed files** (`_middleware.ts`, `_utils.ts`) are **not registered as actions** — use them for shared middleware and utilities
- **Symlinks are skipped** during directory scanning to prevent traversal attacks
- **Dot-files and test files** are excluded from scanning
- **File names are validated** against a safe pattern (`/^\w[\w.-]*\.ts$/`)

## Streaming Actions

Streaming actions (`defineStreamAction`) use Server-Sent Events. Consider:

- **Timeouts**: Implement server-side timeouts to prevent long-running streams from consuming resources
- **Authentication**: Apply the same auth middleware as regular actions
- **Error masking**: Use `handleServerError` to prevent leaking internal errors via SSE events
