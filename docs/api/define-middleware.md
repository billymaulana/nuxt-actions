# defineMiddleware() / createMiddleware()

Define a reusable, typed middleware function for use with `defineAction` or `createActionClient`. Middleware runs before the action handler and can augment the context, perform authorization checks, add logging, or throw errors to halt execution.

`createMiddleware` is an alias for `defineMiddleware`. It signals intent that the middleware is designed for distribution as an npm package.

## Type Signatures

```ts
function defineMiddleware<
  TCtxIn extends Record<string, unknown> = Record<string, unknown>,
  TCtxOut extends Record<string, unknown> = TCtxIn,
>(fn: ActionMiddleware<TCtxIn, TCtxOut>): ActionMiddleware<TCtxIn, TCtxOut>
```

```ts
const createMiddleware: typeof defineMiddleware
```

### Type Parameters

| Parameter | Constraint | Default | Description |
|-----------|-----------|---------|-------------|
| `TCtxIn` | `extends Record<string, unknown>` | `Record<string, unknown>` | The context type this middleware expects to receive from previous middleware in the chain. |
| `TCtxOut` | `extends Record<string, unknown>` | `TCtxIn` | The context type this middleware adds via `next({ ctx })`. |

### Return Type

```ts
ActionMiddleware<TCtxIn, TCtxOut>
```

The function is an identity wrapper -- it returns the same function reference. Its purpose is to provide type inference and signal intent.

---

## Middleware Function Parameter

The middleware function receives a single object with three properties.

```ts
type ActionMiddleware<TCtxIn, TCtxOut> = (context: {
  event: H3Event
  ctx: TCtxIn
  next: <TNewCtx extends Record<string, unknown>>(
    opts?: { ctx: TNewCtx }
  ) => Promise<TNewCtx & TCtxIn>
}) => Promise<TCtxOut & TCtxIn>
```

### `event`

- **Type:** `H3Event`
- **Description:** The H3 request event. Provides access to headers, cookies, request metadata, and all H3 utilities.

### `ctx`

- **Type:** `TCtxIn`
- **Description:** The accumulated context from all middleware that ran before this one. For the first middleware in the chain, this is an empty object (`{}`).

### `next`

- **Type:** `<TNewCtx extends Record<string, unknown>>(opts?: { ctx: TNewCtx }) => Promise<TNewCtx & TCtxIn>`
- **Description:** A function that continues the middleware chain. Must be called exactly once per middleware invocation.

---

## `next()` Usage

### Passing Context Forward

Call `next({ ctx: { ... } })` to add properties to the context. The new properties are merged with the existing context using spread (`{ ...existingCtx, ...newCtx }`).

```ts
export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const session = await getUserSession(event)
  return next({ ctx: { user: session.user } })
  // Downstream middleware and handler receive ctx.user
})
```

### Without Adding Context

Call `next()` with no arguments (or with an empty object) when the middleware does not need to extend the context.

```ts
export const rateLimitMiddleware = defineMiddleware(async ({ event, next }) => {
  await checkRateLimit(getRequestIP(event))
  return next()
})
```

### Return Value

`next()` returns `Promise<TNewCtx & TCtxIn>` -- the merged context after continuation. The middleware must return the result of `next()` (or a superset of the expected return type).

```ts
export const timingMiddleware = defineMiddleware(async ({ event, next }) => {
  const start = Date.now()
  const result = await next({ ctx: { requestId: crypto.randomUUID() } })
  console.log(`[${Date.now() - start}ms] ${event.method} ${event.path}`)
  return result
})
```

### Constraint: Single Invocation

Calling `next()` more than once in the same middleware throws a runtime error:

```
[nuxt-actions] Middleware called next() more than once
```

---

## Error Handling in Middleware

Throw a `createActionError` to abort the middleware chain and return a structured error to the client. The handler will not execute.

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
```

You can also throw H3 errors via `createError()` or any other exception. All thrown errors are caught by `defineAction` and converted to a structured `ActionResult`.

---

## Context Type Accumulation

When multiple middleware are chained, their context types are intersected. TypeScript enforces that each middleware receives the correct upstream context.

```ts
// Middleware 1: adds { user: User }
const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const user = await getUser(event)
  return next({ ctx: { user } })
})

// Middleware 2: expects ctx.user from auth, adds { permissions: string[] }
const permissionsMiddleware = defineMiddleware<
  { user: User },              // TCtxIn: expects user
  { permissions: string[] }    // TCtxOut: adds permissions
>(async ({ ctx, next }) => {
  const permissions = await getPermissions(ctx.user.id)
  return next({ ctx: { permissions } })
})

// Handler receives ctx: { user: User; permissions: string[] }
export default defineAction({
  middleware: [authMiddleware, permissionsMiddleware],
  handler: async ({ ctx }) => {
    return { user: ctx.user.name, permissions: ctx.permissions }
  },
})
```

---

## Examples

### Authentication Middleware

```ts
// server/utils/middleware/auth.ts
import type { User } from '~/types'

export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const session = await getUserSession(event)
  if (!session) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      statusCode: 401,
    })
  }
  return next({ ctx: { user: session.user as User } })
})
```

### Admin Authorization Middleware

```ts
// server/utils/middleware/admin.ts
export const adminMiddleware = defineMiddleware<
  { user: { role: string } },
  { isAdmin: true }
>(async ({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw createActionError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
      statusCode: 403,
    })
  }
  return next({ ctx: { isAdmin: true as const } })
})
```

### Logging Middleware

```ts
// server/utils/middleware/logging.ts
export const loggingMiddleware = defineMiddleware(async ({ event, next }) => {
  const requestId = crypto.randomUUID()
  const start = Date.now()

  const result = await next({ ctx: { requestId } })

  console.log(JSON.stringify({
    requestId,
    method: event.method,
    path: event.path,
    duration: Date.now() - start,
  }))

  return result
})
```

### Rate Limiting Middleware

```ts
// server/utils/middleware/rate-limit.ts
export const rateLimitMiddleware = defineMiddleware(async ({ event, next }) => {
  const ip = getRequestIP(event, { xForwardedFor: true })
  const allowed = await checkRateLimit(ip)
  if (!allowed) {
    throw createActionError({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      statusCode: 429,
    })
  }
  return next()
})
```

### Publishable Middleware (npm Package)

Use `createMiddleware` to signal that the middleware is intended for distribution.

```ts
// Published as nuxt-actions-ratelimit
import { createMiddleware, createActionError } from 'nuxt-actions/runtime'

export const rateLimitMiddleware = createMiddleware(async ({ event, next }) => {
  const ip = getRequestIP(event, { xForwardedFor: true })
  await enforceRateLimit(ip)
  return next()
})
```

### Using Middleware with defineAction

```ts
// server/api/todos.post.ts
import { z } from 'zod'

export default defineAction({
  middleware: [authMiddleware, loggingMiddleware],
  input: z.object({ title: z.string().min(1) }),
  handler: async ({ input, ctx }) => {
    // ctx.user from authMiddleware
    // ctx.requestId from loggingMiddleware
    return await db.todo.create({
      data: { title: input.title, userId: ctx.user.id },
    })
  },
})
```

### Using Middleware with createActionClient

```ts
// server/utils/action-clients.ts
export const authClient = createActionClient()
  .use(authMiddleware)
  .use(loggingMiddleware)
  .use(rateLimitMiddleware)

// server/api/todos.post.ts
export default authClient
  .schema(z.object({ title: z.string() }))
  .action(async ({ input, ctx }) => {
    return await db.todo.create({
      data: { title: input.title, userId: ctx.user.id },
    })
  })
```

---

## Auto-Import

Both `defineMiddleware` and `createMiddleware` are auto-imported in all server routes (`server/`) when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [defineAction](/api/define-action) -- Use middleware in standalone actions
- [createActionClient](/api/create-action-client) -- Use middleware via the builder `.use()` method
- [createActionError](/api/create-action-error) -- Throw structured errors from middleware
- [Types Reference](/api/types) -- `ActionMiddleware`, `MiddlewareContext`
