# Security

Best practices for securing your server actions in production.

## CSRF Protection

nuxt-actions provides a built-in `csrfMiddleware()` for CSRF token protection on mutation actions:

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

On safe requests (GET, HEAD), a token is set as an httpOnly cookie. On mutation requests (POST, PUT, PATCH, DELETE), the middleware validates that the token in the request header matches the cookie value.

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
