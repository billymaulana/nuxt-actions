# Security

Best practices for securing your server actions in production.

## CSRF Protection

Server actions are executed via standard HTTP requests (`POST`, `GET`, etc.) to `/api/_actions/*` endpoints. Nuxt does **not** include built-in CSRF protection — you must implement it yourself or use a module like [`nuxt-security`](https://nuxt-security.vercel.app/).

To add CSRF protection, use an action middleware that validates the request origin:

```ts
// server/actions/_middleware.ts — not auto-scanned (underscore prefix)
import { getHeader } from 'h3'

export const csrfMiddleware = defineMiddleware(async ({ event, next }) => {
  // Verify the request came from your application
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')

  if (origin && host && !origin.includes(host)) {
    throw createActionError({
      code: 'CSRF_ERROR',
      message: 'Invalid request origin',
      statusCode: 403,
    })
  }

  return next()
})
```

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

Implement rate limiting to prevent abuse:

```ts
const rateLimitMap = new Map<string, { count: number, resetAt: number }>()

export const rateLimitMiddleware = defineMiddleware(async ({ event, next }) => {
  const ip = getRequestIP(event) ?? 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (entry && entry.resetAt > now && entry.count >= 100) {
    throw createActionError({
      code: 'RATE_LIMIT',
      message: 'Too many requests',
      statusCode: 429,
    })
  }

  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
  } else {
    entry.count++
  }

  return next()
})
```

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
