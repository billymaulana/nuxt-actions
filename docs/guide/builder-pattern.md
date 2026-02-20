# Builder Pattern

`createActionClient` provides a fluent builder API for composing actions with shared middleware, schemas, and metadata. Instead of repeating the same middleware array in every `defineAction` call, you define reusable clients that encode your application's common patterns once.

::: tip Working example
See the builder pattern in a real application: [example /builder page](https://github.com/billymaulana/nuxt-actions-example/blob/master/pages/builder.vue) with shared middleware chains.
:::

## Why Use `createActionClient`?

Consider a typical application with authentication, rate limiting, and audit logging. Without the builder pattern, every protected action repeats the same boilerplate:

```ts
// server/api/posts.post.ts
export default defineAction({
  middleware: [authMiddleware, rateLimitMiddleware, auditLogMiddleware],
  input: createPostSchema,
  handler: async ({ input, ctx }) => { /* ... */ },
})

// server/api/posts/[id].patch.ts
export default defineAction({
  middleware: [authMiddleware, rateLimitMiddleware, auditLogMiddleware],
  input: updatePostSchema,
  handler: async ({ input, ctx }) => { /* ... */ },
})

// server/api/posts/[id].delete.ts
export default defineAction({
  middleware: [authMiddleware, rateLimitMiddleware, auditLogMiddleware],
  input: deletePostSchema,
  handler: async ({ input, ctx }) => { /* ... */ },
})
```

Three files, three identical middleware arrays. If you add a new middleware or change the order, you have to update every file. The builder pattern eliminates this duplication:

```ts
// server/api/posts.post.ts
export default authClient
  .schema(createPostSchema)
  .action(async ({ input, ctx }) => { /* ... */ })

// server/api/posts/[id].patch.ts
export default authClient
  .schema(updatePostSchema)
  .action(async ({ input, ctx }) => { /* ... */ })

// server/api/posts/[id].delete.ts
export default authClient
  .schema(deletePostSchema)
  .action(async ({ input, ctx }) => { /* ... */ })
```

The middleware configuration lives in one place. Every action that uses `authClient` automatically gets authentication, rate limiting, and audit logging.

## Basic Usage

Create clients in a shared utility file so they can be imported across your server routes:

```ts
// server/utils/action-clients.ts
export const publicClient = createActionClient()

export const authClient = createActionClient()
  .use(authMiddleware)

export const adminClient = createActionClient()
  .use(authMiddleware)
  .use(adminMiddleware)
```

Because `server/utils/` files are auto-imported by Nuxt, you can use `publicClient`, `authClient`, and `adminClient` directly in any server route without an explicit import.

Then use a client in an action file:

```ts
// server/api/teams.post.ts
import { z } from 'zod'

export default authClient
  .schema(z.object({
    name: z.string().min(1, 'Team name is required').max(100),
    description: z.string().max(500).optional(),
  }))
  .action(async ({ input, ctx }) => {
    const team = await db.team.create({
      data: {
        name: input.name,
        description: input.description,
        ownerId: ctx.user.id,
      },
    })

    return team
  })
```

The `ctx` parameter is fully typed. Because `authClient` uses `authMiddleware`, TypeScript knows that `ctx.user` exists and what shape it has.

## Chaining Middleware

Call `.use()` multiple times to build up a middleware chain. Each `.use()` adds context that subsequent middleware and the final handler can access:

```ts
// server/utils/middleware/auth.ts
export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const session = await getUserSession(event)
  if (!session) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to perform this action',
      statusCode: 401,
    })
  }
  return next({ ctx: { user: session.user } })
})

// server/utils/middleware/organization.ts
export const organizationMiddleware = defineMiddleware(async ({ event, ctx, next }) => {
  const orgSlug = getRouterParam(event, 'org')
  if (!orgSlug) {
    throw createActionError({
      code: 'BAD_REQUEST',
      message: 'Organization slug is required',
      statusCode: 400,
    })
  }

  const membership = await db.membership.findFirst({
    where: { userId: ctx.user.id, organization: { slug: orgSlug } },
    include: { organization: true },
  })

  if (!membership) {
    throw createActionError({
      code: 'FORBIDDEN',
      message: 'You are not a member of this organization',
      statusCode: 403,
    })
  }

  return next({
    ctx: {
      organization: membership.organization,
      memberRole: membership.role,
    },
  })
})

// server/utils/action-clients.ts
export const orgClient = createActionClient()
  .use(authMiddleware)         // adds ctx.user
  .use(organizationMiddleware) // adds ctx.organization, ctx.memberRole
```

Now every action built with `orgClient` has access to the authenticated user and their organization membership:

```ts
// server/api/orgs/[org]/projects.post.ts
import { z } from 'zod'

export default orgClient
  .schema(z.object({
    name: z.string().min(1).max(100),
    visibility: z.enum(['public', 'private']).default('private'),
  }))
  .action(async ({ input, ctx }) => {
    // ctx.user, ctx.organization, and ctx.memberRole are all typed
    if (ctx.memberRole === 'viewer') {
      throw createActionError({
        code: 'FORBIDDEN',
        message: 'Viewers cannot create projects',
        statusCode: 403,
      })
    }

    return await db.project.create({
      data: {
        name: input.name,
        visibility: input.visibility,
        organizationId: ctx.organization.id,
        createdBy: ctx.user.id,
      },
    })
  })
```

## Schema and Action

The `.schema()` method sets the input validation schema. After calling `.schema()`, the builder transitions to a new state that exposes `.action()`, `.outputSchema()`, and `.metadata()`:

```ts
export default authClient
  .schema(z.object({
    title: z.string().min(1),
    body: z.string().min(1),
  }))
  .action(async ({ input, ctx }) => {
    // input is typed as { title: string; body: string }
    return await db.post.create({
      data: { ...input, authorId: ctx.user.id },
    })
  })
```

### Adding output validation

Chain `.outputSchema()` after `.schema()` to validate the handler's return value:

```ts
// server/api/users/profile.get.ts
import { z } from 'zod'

const profileOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  // passwordHash and other sensitive fields are excluded
})

export default authClient
  .schema(z.object({}))
  .outputSchema(profileOutput)
  .action(async ({ ctx }) => {
    return await db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
    })
  })
```

### Adding metadata

Attach arbitrary metadata for logging, analytics, or authorization decisions. Metadata is accessible in middleware:

```ts
export default adminClient
  .schema(z.object({
    userId: z.string().uuid(),
    reason: z.string().min(1),
  }))
  .metadata({ action: 'ban-user', severity: 'high', auditRequired: true })
  .action(async ({ input }) => {
    await db.user.update({
      where: { id: input.userId },
      data: { banned: true, banReason: input.reason },
    })
    return { banned: true }
  })
```

## Schema-less Actions

Not every action needs input validation. For GET endpoints that return data without parameters, or for actions where the input is read from the route or headers, skip `.schema()` entirely and call `.action()` directly:

```ts
// server/api/health.get.ts
export default publicClient
  .action(async () => {
    const dbLatency = await measureDbLatency()
    return {
      status: 'ok',
      timestamp: Date.now(),
      dbLatencyMs: dbLatency,
    }
  })
```

```ts
// server/api/me.get.ts
export default authClient
  .action(async ({ ctx }) => {
    return await db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { id: true, name: true, email: true, avatarUrl: true },
    })
  })
```

When `.action()` is called without `.schema()`, the handler receives `input` as `unknown`. If you need the input, use `.schema()` instead.

## Sharing Clients Across Files

Place your clients in `server/utils/` to take advantage of Nuxt's auto-import. This is the recommended pattern for any non-trivial application:

```ts
// server/utils/action-clients.ts

// Public actions -- no authentication required
export const publicClient = createActionClient()
  .use(rateLimitMiddleware)

// Authenticated actions -- user must be signed in
export const authClient = createActionClient()
  .use(rateLimitMiddleware)
  .use(authMiddleware)

// Admin actions -- user must be an admin
export const adminClient = createActionClient()
  .use(rateLimitMiddleware)
  .use(authMiddleware)
  .use(adminMiddleware)

// Organization-scoped actions -- user must be an org member
export const orgClient = createActionClient()
  .use(rateLimitMiddleware)
  .use(authMiddleware)
  .use(organizationMiddleware)

// Internal/service-to-service actions -- API key authentication
export const serviceClient = createActionClient()
  .use(apiKeyMiddleware)
```

Every action file in your project is now a one-liner plus the schema and handler:

```ts
// server/api/admin/users.get.ts
import { z } from 'zod'

export default adminClient
  .schema(z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: z.enum(['user', 'admin']).optional(),
  }))
  .action(async ({ input }) => {
    return await db.user.findMany({
      where: input.role ? { role: input.role } : undefined,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    })
  })
```

## Immutability Guarantees

Every builder method (`.use()`, `.schema()`, `.metadata()`, `.outputSchema()`) returns a **new instance**. The original client is never modified. This means you can safely branch from a shared base:

```ts
const base = createActionClient()
  .use(rateLimitMiddleware)
  .use(loggingMiddleware)

// These create independent branches -- they do not affect each other
const publicBranch = base
  .use(corsMiddleware)

const authBranch = base
  .use(authMiddleware)

const adminBranch = authBranch
  .use(adminMiddleware)
```

The resulting middleware chains are:

| Client | Middleware chain |
|---|---|
| `base` | rateLimit, logging |
| `publicBranch` | rateLimit, logging, cors |
| `authBranch` | rateLimit, logging, auth |
| `adminBranch` | rateLimit, logging, auth, admin |

You can verify this yourself: modifying `publicBranch` after creation has no effect on `authBranch` or `base`. The builder never mutates shared state.

## Builder API Reference

### `createActionClient()`

Creates a new action client with an empty middleware chain.

Returns an `ActionClient` with the following methods:

| Method | Returns | Description |
|---|---|---|
| `.use(middleware)` | `ActionClient` | Add a middleware to the chain. Returns a new client with the accumulated context type. |
| `.schema(inputSchema)` | `ActionClientWithSchema` | Set the input validation schema. Transitions the builder to the schema-aware state. |
| `.metadata(meta)` | `ActionClient` | Attach metadata (key-value record). Returns a new client. |
| `.action(handler)` | Event handler | Finalize the builder and create the H3 event handler. Call this as the default export of your route file. |

### `ActionClientWithSchema` (after calling `.schema()`)

| Method | Returns | Description |
|---|---|---|
| `.outputSchema(schema)` | `ActionClientWithSchema` | Set the output validation schema. Returns a new client. |
| `.metadata(meta)` | `ActionClientWithSchema` | Attach metadata. Returns a new client. |
| `.action(handler)` | Event handler | Finalize and create the handler. The `input` parameter is typed based on the schema. |

## Best Practices

### Create base clients for common patterns

Define a small set of clients that cover your application's access levels. Most projects need three to five clients at most:

```ts
// server/utils/action-clients.ts
export const publicClient = createActionClient()
export const authClient = createActionClient().use(authMiddleware)
export const adminClient = createActionClient().use(authMiddleware).use(adminMiddleware)
```

If you find yourself creating highly specific clients (e.g., `adminWithAuditAndRateLimitAndCorsClient`), consider whether a base client plus per-action middleware would be clearer.

### Keep chains readable

The builder pattern is meant to reduce boilerplate, not create an unreadable pipeline. If a chain becomes hard to follow, break it into named intermediate variables:

```ts
// Harder to read
export default createActionClient()
  .use(rateLimitMiddleware)
  .use(authMiddleware)
  .use(organizationMiddleware)
  .use(auditLogMiddleware)
  .schema(z.object({ name: z.string() }))
  .outputSchema(z.object({ id: z.string(), name: z.string() }))
  .metadata({ action: 'create-team', severity: 'medium' })
  .action(async ({ input, ctx }) => { /* ... */ })

// Easier to read -- use a pre-defined client
export default orgClient
  .schema(z.object({ name: z.string() }))
  .metadata({ action: 'create-team' })
  .action(async ({ input, ctx }) => { /* ... */ })
```

The per-action portion of the chain should ideally be `.schema()` + `.action()` and occasionally `.metadata()` or `.outputSchema()`. All shared middleware belongs on the client definition in `server/utils/`.

### Prefer `defineAction` for one-off actions

If an action has a unique middleware combination that is not shared with any other action, using `defineAction` directly is perfectly fine and arguably more explicit:

```ts
// This is a special one-off action with a unique middleware setup
export default defineAction({
  middleware: [authMiddleware, customWebhookVerification],
  input: webhookSchema,
  handler: async ({ input, ctx }) => { /* ... */ },
})
```

There is no need to create a `webhookClient` if only one action uses it.

### Use TypeScript to enforce context requirements

The builder's generic types ensure that if a middleware adds `ctx.user`, subsequent middleware and the handler can access it. If you try to access `ctx.user` on a `publicClient` that does not include `authMiddleware`, TypeScript will flag it as an error at compile time. Lean on this type safety -- do not cast `ctx` to `any`.

## Next Steps

- **[Middleware](/guide/middleware)** -- Learn how to define the middleware functions used with `.use()`.
- **[Error Handling](/guide/error-handling)** -- Understand how errors thrown in middleware and handlers are caught and formatted.
- **[useAction](/guide/use-action)** -- Call builder-created actions from Vue components.
- **[Optimistic Updates](/guide/optimistic-updates)** -- Pair builder actions with `useOptimisticAction` for instant UI feedback.
