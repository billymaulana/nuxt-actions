# createActionClient()

Create a builder-based action client for composing actions with shared middleware, schemas, and metadata. Each method returns a new immutable instance, making it safe to share and extend base clients across multiple actions.

## Type Signature

```ts
function createActionClient<TCtx = Record<string, never>>(
  opts?: { middleware?: ActionMiddleware[] }
): ActionClient<TCtx>
```

### Type Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TCtx` | `Record<string, never>` | The accumulated context type. Starts empty and grows as `.use()` adds middleware that extends context. |

---

## Constructor Options

```ts
interface CreateActionClientOptions {
  /** Pre-seed the client with middleware. Equivalent to calling .use() for each entry. */
  middleware?: ActionMiddleware[]
}
```

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `middleware` | `ActionMiddleware[]` | No | `[]` | An initial array of middleware to include in the chain. |

### Example: Constructor with Middleware

```ts
// Equivalent to createActionClient().use(authMiddleware).use(rateLimitMiddleware)
const client = createActionClient({
  middleware: [authMiddleware, rateLimitMiddleware],
})
```

---

## ActionClient Methods

The `ActionClient<TCtx>` interface exposes four methods. Each returns a new instance (immutable builder pattern).

```ts
interface ActionClient<TCtx = Record<string, never>> {
  use: <TNewCtx extends Record<string, unknown>>(
    middleware: ActionMiddleware<TCtx, TNewCtx>,
  ) => ActionClient<TCtx & TNewCtx>

  schema: <TInputSchema extends StandardSchemaV1>(
    inputSchema: TInputSchema,
  ) => ActionClientWithSchema<TCtx, TInputSchema>

  metadata: (meta: ActionMetadata) => ActionClient<TCtx>

  action: <TOutput>(
    handler: ActionHandler<unknown, TOutput, TCtx>,
  ) => EventHandler
}
```

### `.use(middleware)`

Add a middleware function to the chain. Returns a new `ActionClient` with the context type extended by the middleware output.

- **Parameter:** `middleware: ActionMiddleware<TCtx, TNewCtx>`
- **Returns:** `ActionClient<TCtx & TNewCtx>`

Middleware is called in the order it was added. Each middleware can augment the context passed to subsequent middleware and the handler.

```ts
const authClient = createActionClient()
  .use(authMiddleware)      // TCtx becomes { user: User }
  .use(rateLimitMiddleware) // TCtx becomes { user: User } & { rateLimit: RateLimitInfo }
```

Type inference flows through the chain, so the handler receives the combined context:

```ts
authClient
  .schema(z.object({ title: z.string() }))
  .action(async ({ input, ctx }) => {
    // ctx.user    -- typed from authMiddleware
    // ctx.rateLimit -- typed from rateLimitMiddleware
    return { id: 1, title: input.title, owner: ctx.user.id }
  })
```

### `.schema(inputSchema)`

Set the input validation schema. Transitions the client from `ActionClient` to `ActionClientWithSchema`, which unlocks `.outputSchema()` and changes the `.action()` handler input type.

- **Parameter:** `inputSchema: TInputSchema extends StandardSchemaV1`
- **Returns:** `ActionClientWithSchema<TCtx, TInputSchema>`

```ts
const handler = createActionClient()
  .use(authMiddleware)
  .schema(z.object({
    title: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high']),
  }))
  .action(async ({ input }) => {
    // input is typed as { title: string; priority: 'low' | 'medium' | 'high' }
    return { id: Date.now(), ...input }
  })
```

### `.metadata(meta)`

Attach metadata to the action. Metadata is merged with any previously set metadata. Available on both `ActionClient` and `ActionClientWithSchema`.

- **Parameter:** `meta: ActionMetadata` (alias for `Record<string, unknown>`)
- **Returns:** `ActionClient<TCtx>` (same context type)

```ts
const client = createActionClient()
  .use(authMiddleware)
  .metadata({ role: 'admin', action: 'list-users' })
```

### `.action(handler)` (without schema)

Terminal method. Creates an H3 event handler from the accumulated configuration. When called on an `ActionClient` (no `.schema()` was used), the handler input is `unknown`.

- **Parameter:** `handler: ActionHandler<unknown, TOutput, TCtx>`
- **Returns:** `EventHandler`

```ts
// server/api/health.get.ts
export default createActionClient()
  .action(async ({ event }) => {
    return { status: 'ok', timestamp: Date.now() }
  })
```

---

## ActionClientWithSchema Methods

After calling `.schema()`, the client transitions to `ActionClientWithSchema<TCtx, TInputSchema>`. This interface exposes three methods.

```ts
interface ActionClientWithSchema<TCtx, TInputSchema extends StandardSchemaV1> {
  outputSchema: <TOutputSchema extends StandardSchemaV1>(
    schema: TOutputSchema,
  ) => ActionClientWithSchema<TCtx, TInputSchema>

  metadata: (meta: ActionMetadata) => ActionClientWithSchema<TCtx, TInputSchema>

  action: <TOutput>(
    handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>,
  ) => EventHandler
}
```

### `.outputSchema(schema)`

Set the output validation schema. The handler return value is validated against this schema at runtime. If validation fails, the action returns `code: 'OUTPUT_VALIDATION_ERROR'` with `statusCode: 500`.

- **Parameter:** `schema: TOutputSchema extends StandardSchemaV1`
- **Returns:** `ActionClientWithSchema<TCtx, TInputSchema>`

```ts
export default authClient
  .schema(z.object({ id: z.string() }))
  .outputSchema(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }))
  .action(async ({ input }) => {
    return await db.user.findUnique({ where: { id: input.id } })
  })
```

### `.metadata(meta)`

Identical to the `ActionClient.metadata()` method. Merges metadata into the builder configuration.

- **Parameter:** `meta: ActionMetadata`
- **Returns:** `ActionClientWithSchema<TCtx, TInputSchema>`

### `.action(handler)` (with schema)

Terminal method. Creates an H3 event handler. The handler `input` parameter is fully typed based on the schema provided to `.schema()`.

- **Parameter:** `handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>`
- **Returns:** `EventHandler`

```ts
export default authClient
  .schema(z.object({ title: z.string() }))
  .action(async ({ input, ctx }) => {
    // input.title is typed as string
    // ctx.user is typed from authMiddleware
    return await db.todo.create({
      data: { title: input.title, userId: ctx.user.id },
    })
  })
```

---

## Type Inference Through the Chain

The builder pattern preserves full type information at each step. Context types are intersected as middleware is added, and input types are inferred from the schema.

```ts
// Step 1: Empty context
const base = createActionClient()
// ActionClient<Record<string, never>>

// Step 2: Auth middleware adds { user: User }
const withAuth = base.use(authMiddleware)
// ActionClient<Record<string, never> & { user: User }>

// Step 3: Logging middleware adds { requestId: string }
const withLogging = withAuth.use(loggingMiddleware)
// ActionClient<Record<string, never> & { user: User } & { requestId: string }>

// Step 4: Schema locks the input type
const withSchema = withLogging.schema(z.object({ title: z.string() }))
// ActionClientWithSchema<... , z.ZodObject<{ title: z.ZodString }>>

// Step 5: Terminal -- handler receives fully typed input and ctx
export default withSchema.action(async ({ input, ctx }) => {
  // input: { title: string }
  // ctx: { user: User; requestId: string }
  return { id: 1, title: input.title }
})
```

---

## Builder Flow Diagram

```
createActionClient(opts?)
  |
  +-- .use(middleware)      -> ActionClient (extended ctx)
  |     (chainable)
  |
  +-- .metadata(meta)       -> ActionClient (same ctx)
  |     (chainable)
  |
  +-- .schema(inputSchema)  -> ActionClientWithSchema
  |     |
  |     +-- .outputSchema(schema) -> ActionClientWithSchema
  |     |     (chainable)
  |     |
  |     +-- .metadata(meta)       -> ActionClientWithSchema
  |     |     (chainable)
  |     |
  |     +-- .action(handler)      -> EventHandler [terminal]
  |
  +-- .action(handler)      -> EventHandler [terminal, input = unknown]
```

---

## Examples

### Shared Auth and Admin Clients

```ts
// server/utils/action-clients.ts
export const authClient = createActionClient()
  .use(authMiddleware)
  .use(rateLimitMiddleware)

export const adminClient = createActionClient()
  .use(authMiddleware)
  .use(adminMiddleware)
```

### Using a Shared Client in an API Route

```ts
// server/api/todos.post.ts
import { z } from 'zod'
import { authClient } from '~/server/utils/action-clients'

export default authClient
  .schema(z.object({
    title: z.string().min(1),
  }))
  .action(async ({ input, ctx }) => {
    return await db.todo.create({
      data: { title: input.title, userId: ctx.user.id },
    })
  })
```

### Admin Route with Metadata and Output Validation

```ts
// server/api/admin/users.get.ts
import { z } from 'zod'
import { adminClient } from '~/server/utils/action-clients'

export default adminClient
  .schema(z.object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(10),
  }))
  .outputSchema(z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['user', 'admin']),
  })))
  .metadata({ role: 'admin', action: 'list-users' })
  .action(async ({ input, ctx }) => {
    return await db.user.findMany({
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    })
  })
```

### Action Without Schema

```ts
// server/api/health.get.ts
export default createActionClient()
  .use(loggingMiddleware)
  .action(async ({ event, ctx }) => {
    return { status: 'ok', requestId: ctx.requestId }
  })
```

---

## Auto-Import

`createActionClient` is auto-imported in all server routes (`server/`) when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [defineAction](/api/define-action) -- Standalone action definition (non-builder)
- [defineMiddleware](/api/define-middleware) -- Create reusable middleware for `.use()`
- [Types Reference](/api/types) -- `ActionClient`, `ActionClientWithSchema`, and related types
