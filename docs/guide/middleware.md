# Middleware

Middleware in `nuxt-actions` runs **before** your action handler. Each middleware function can inspect the request, add data to a shared context object, or reject the request entirely by throwing an error. This makes middleware the natural home for cross-cutting concerns such as authentication, authorization, rate limiting, and logging.

::: tip Working example
See middleware with auth validation in the [example /middleware page](https://github.com/billymaulana/nuxt-actions-example/blob/master/pages/middleware.vue) and the [login action](https://github.com/billymaulana/nuxt-actions-example/blob/master/server/actions/login.post.ts).
:::

## How It Works

When you attach middleware to an action, the module runs each middleware function in array order. Every middleware receives the H3 event, the accumulated context from all previous middleware, and a `next` function that you **must** call to continue the chain. When the entire chain completes, the accumulated context is passed to the action handler.

```
Request -> middleware[0] -> middleware[1] -> ... -> handler({ input, event, ctx })
```

If any middleware throws an error, the chain short-circuits and the error is returned to the client immediately. The handler never executes.

## Basic Usage with defineMiddleware

`defineMiddleware` is an auto-imported server utility. It accepts an async function and returns a typed middleware object.

```ts
// server/utils/log.ts
export const logMiddleware = defineMiddleware(async ({ event, next }) => {
  console.log(`[${event.method}] ${event.path}`)
  return next()
})
```

Attach it to any action via the `middleware` array:

```ts
// server/api/todos.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1),
  }),
  middleware: [logMiddleware],
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title }
  },
})
```

## Context Accumulation

The primary purpose of middleware is to enrich the **context** that flows into your handler. Call `next({ ctx: { ... } })` to merge new properties into the context. Each subsequent middleware and the final handler receive the combined result.

```ts
// server/utils/middleware.ts
export const addRequestId = defineMiddleware(async ({ next }) => {
  return next({ ctx: { requestId: crypto.randomUUID() } })
})

export const addTimestamp = defineMiddleware(async ({ next }) => {
  return next({ ctx: { timestamp: Date.now() } })
})
```

```ts
// server/api/debug.get.ts
export default defineAction({
  middleware: [addRequestId, addTimestamp],
  handler: async ({ ctx }) => {
    // Both ctx.requestId and ctx.timestamp are available here
    return {
      requestId: ctx.requestId,
      timestamp: ctx.timestamp,
    }
  },
})
```

Context merges are **additive**. Properties from earlier middleware remain available to all later middleware and the handler. If two middleware write the same key, the later one wins.

## Reading Previous Context

Because context accumulates, later middleware can read values set by earlier ones:

```ts
export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const session = await getUserSession(event)
  if (!session) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      statusCode: 401,
    })
  }
  return next({ ctx: { user: session.user } })
})

export const adminMiddleware = defineMiddleware(async ({ ctx, next }) => {
  // ctx.user was set by authMiddleware
  if (ctx.user.role !== 'admin') {
    throw createActionError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
      statusCode: 403,
    })
  }
  return next({ ctx: { isAdmin: true } })
})
```

```ts
// server/api/admin/stats.get.ts
export default defineAction({
  middleware: [authMiddleware, adminMiddleware],
  handler: async ({ ctx }) => {
    // ctx.user comes from authMiddleware
    // ctx.isAdmin comes from adminMiddleware
    return getAdminStats(ctx.user.id)
  },
})
```

## Chaining Multiple Middleware

Pass as many middleware as you need. They execute sequentially, left to right:

```ts
export default defineAction({
  middleware: [
    logMiddleware,       // 1. Logs the request
    rateLimitMiddleware, // 2. Checks rate limit
    authMiddleware,      // 3. Verifies authentication
    adminMiddleware,     // 4. Verifies admin role
  ],
  handler: async ({ input, ctx }) => {
    // All context from steps 1-4 is available
  },
})
```

If middleware 2 throws (rate limit exceeded), middleware 3 and 4 never run, and the handler never executes.

## createMiddleware for Publishable Middleware

`createMiddleware` is functionally identical to `defineMiddleware`. The difference is **semantic**: use `createMiddleware` when building middleware that will be published as a standalone npm package or shared across multiple projects.

```ts
// my-rate-limit-package/src/index.ts
import { createMiddleware, createActionError } from 'nuxt-actions/runtime'

const store = new Map<string, { count: number; resetAt: number }>()

export const rateLimitMiddleware = createMiddleware(async ({ event, next }) => {
  const ip = getRequestIP(event) || 'unknown'
  const now = Date.now()
  const entry = store.get(ip)

  if (entry && entry.resetAt > now && entry.count >= 100) {
    throw createActionError({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
    })
  }

  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + 60_000 })
  } else {
    entry.count++
  }

  return next()
})
```

::: tip
`createMiddleware` is an alias for `defineMiddleware`. Choose whichever name better communicates intent in your codebase.
:::

## Throwing Errors from Middleware

Use `createActionError` to halt the middleware chain and return a structured error to the client. The function accepts `code`, `message`, `statusCode`, and optionally `fieldErrors`.

```ts
export const subscriptionMiddleware = defineMiddleware(async ({ ctx, next }) => {
  const plan = await getUserPlan(ctx.user.id)

  if (plan.status === 'expired') {
    throw createActionError({
      code: 'SUBSCRIPTION_EXPIRED',
      message: 'Your subscription has expired. Please renew to continue.',
      statusCode: 403,
    })
  }

  return next({ ctx: { plan } })
})
```

On the client, the error is available via the `error` ref or the `onError` callback:

```ts
const { execute, error } = useAction('/api/premium/export', {
  onError(err) {
    if (err.code === 'SUBSCRIPTION_EXPIRED') {
      router.push('/billing')
    }
  },
})
```

## Real-World Examples

### Authentication Middleware

Verify that the request comes from an authenticated user. This is the most common middleware pattern.

```ts
// server/utils/auth.ts
interface User {
  id: number
  email: string
  role: 'user' | 'admin'
}

export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')

  if (!token) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'Missing authentication token',
      statusCode: 401,
    })
  }

  const user = await verifyToken<User>(token)

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

Usage in actions:

```ts
// server/api/profile.get.ts
export default defineAction({
  middleware: [authMiddleware],
  handler: async ({ ctx }) => {
    // ctx.user is fully typed: { id: number; email: string; role: string }
    return await db.user.findUnique({ where: { id: ctx.user.id } })
  },
})
```

### Rate Limiting Middleware

Protect actions from abuse by limiting the number of requests per time window.

```ts
// server/utils/rate-limit.ts
const limits = new Map<string, { count: number; windowStart: number }>()

const WINDOW_MS = 60_000 // 1 minute
const MAX_REQUESTS = 60

export const rateLimitMiddleware = defineMiddleware(async ({ event, next }) => {
  const ip = getRequestIP(event) || 'unknown'
  const now = Date.now()
  const entry = limits.get(ip)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // New window
    limits.set(ip, { count: 1, windowStart: now })
  } else if (entry.count >= MAX_REQUESTS) {
    throw createActionError({
      code: 'RATE_LIMITED',
      message: `Rate limit exceeded. Try again in ${Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)} seconds.`,
      statusCode: 429,
    })
  } else {
    entry.count++
  }

  return next()
})
```

### Logging Middleware

Record timing and metadata for every action execution.

```ts
// server/utils/logging.ts
export const loggingMiddleware = defineMiddleware(async ({ event, ctx, next }) => {
  const start = performance.now()
  const requestId = crypto.randomUUID()

  const result = await next({ ctx: { requestId } })

  const duration = Math.round(performance.now() - start)
  console.log(JSON.stringify({
    requestId,
    method: event.method,
    path: event.path,
    userId: ctx.user?.id ?? 'anonymous',
    duration: `${duration}ms`,
  }))

  return result
})
```

### Composing Middleware with the Builder Pattern

If you use the same middleware stack across many actions, the builder pattern (`createActionClient`) reduces repetition:

```ts
// server/utils/action-clients.ts
export const authClient = createActionClient()
  .use(loggingMiddleware)
  .use(rateLimitMiddleware)
  .use(authMiddleware)

export const adminClient = authClient
  .use(adminMiddleware)
```

```ts
// server/api/admin/users.get.ts
import { z } from 'zod'

export default adminClient
  .schema(z.object({ page: z.coerce.number().default(1) }))
  .action(async ({ input, ctx }) => {
    // ctx has: requestId, user, isAdmin
    return await db.user.findMany({
      skip: (input.page - 1) * 20,
      take: 20,
    })
  })
```

## Best Practices

### Always call next()

Every middleware **must** call `next()` exactly once to continue the chain. If you forget to call `next()`, the action will hang. The only exception is when you throw an error, which halts the chain intentionally.

```ts
// Correct: calls next()
const good = defineMiddleware(async ({ next }) => {
  return next()
})

// Correct: throws instead of calling next()
const alsoGood = defineMiddleware(async ({ next }) => {
  throw createActionError({
    code: 'BLOCKED',
    message: 'Not allowed',
    statusCode: 403,
  })
})

// Wrong: never calls next() and never throws
const bad = defineMiddleware(async ({ next }) => {
  console.log('hello')
  // forgot to return next() -- the action will never complete
})
```

### Never call next() twice

The runtime enforces that `next()` is called at most once per middleware. Calling it a second time throws an error with the message `"Middleware called next() more than once"`. This prevents accidental double-execution of the handler.

```ts
// This will throw at runtime
const broken = defineMiddleware(async ({ next }) => {
  await next()
  return next() // Error: called next() more than once
})
```

### Keep middleware focused on one concern

Each middleware should do one thing well. Combine multiple focused middleware rather than building a single middleware that handles authentication, rate limiting, and logging all at once.

```ts
// Preferred: compose small, focused middleware
middleware: [loggingMiddleware, rateLimitMiddleware, authMiddleware]

// Avoid: one middleware doing everything
middleware: [doEverythingMiddleware]
```

### Place middleware files in server/utils

Nuxt auto-imports files from `server/utils/`. Place your middleware there so they are available everywhere without explicit imports:

```
server/
  utils/
    auth.ts          # authMiddleware, adminMiddleware
    rate-limit.ts    # rateLimitMiddleware
    logging.ts       # loggingMiddleware
    action-clients.ts # pre-configured builder clients
  api/
    todos.post.ts
    admin/
      stats.get.ts
```

## Next Steps

- [Error Handling](/guide/error-handling) -- How errors from middleware are surfaced to clients
- [Builder Pattern](/guide/builder-pattern) -- Share middleware stacks across actions with `createActionClient`
- [defineMiddleware API](/api/define-middleware) -- Full API reference
