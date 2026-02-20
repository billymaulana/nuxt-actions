# Output Validation

Input validation ensures your server receives correct data. Output validation ensures your server **returns** correct data. The `outputSchema` option lets you validate the handler's return value before it reaches the client.

## Why Validate Outputs?

### Prevent data leaks

A database query might return fields you never intended to expose -- passwords, internal IDs, soft-delete flags, billing tokens. Output validation catches these at the boundary:

```ts
// Without output validation:
// handler returns { id, name, email, passwordHash } -- passwordHash leaks to client

// With output validation:
// outputSchema only allows { id, name, email } -- passwordHash triggers an error
```

### Enforce API contracts

When your frontend team, mobile app, or third-party consumers depend on a specific response shape, output validation guarantees that shape is always met. If a database migration adds or removes a column, you get a server-side error instead of a silent contract break.

### Catch bugs early

If an ORM returns `null` for a field you expect to be a string, or a number where you expect a date, output validation catches it before the malformed data propagates through the client.

## Usage with defineAction

Pass an `outputSchema` alongside your `input` schema:

```ts
// server/api/users/[id].get.ts
import { z } from 'zod'

const userOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
  createdAt: z.string(),
})

export default defineAction({
  input: z.object({
    id: z.string(),
  }),
  outputSchema: userOutput,
  handler: async ({ input }) => {
    // If db.user.findUnique returns extra fields (like passwordHash)
    // or missing fields (like a null name), validation catches it.
    return await db.user.findUnique({ where: { id: input.id } })
  },
})
```

The `outputSchema` accepts any [Standard Schema](/guide/standard-schema) compliant library -- Zod, Valibot, ArkType, or others.

## Usage with the Builder Pattern

When using `createActionClient`, chain `.outputSchema()` after `.schema()`:

```ts
// server/api/users/[id].get.ts
import { z } from 'zod'

export default authClient
  .schema(z.object({ id: z.string() }))
  .outputSchema(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['user', 'admin']),
  }))
  .action(async ({ input }) => {
    return await db.user.findUnique({ where: { id: input.id } })
  })
```

The builder enforces the correct call order: `.schema()` first, then optionally `.outputSchema()`, then `.action()`.

## Error Response Format

When output validation fails, the response uses the `OUTPUT_VALIDATION_ERROR` code with a `500` status:

```json
{
  "success": false,
  "error": {
    "code": "OUTPUT_VALIDATION_ERROR",
    "message": "Output validation failed",
    "statusCode": 500,
    "fieldErrors": {
      "passwordHash": ["Unexpected field"],
      "role": ["Invalid enum value"]
    }
  }
}
```

Key differences from input validation errors:

| | Input Validation | Output Validation |
|--|------------------|-------------------|
| Error code | `VALIDATION_ERROR` | `OUTPUT_VALIDATION_ERROR` |
| HTTP status | 422 | 500 |
| Cause | Client sent bad data | Server produced bad data |
| Responsibility | Client should fix input | Server bug or schema mismatch |

The `500` status is intentional. A failed output validation means the server produced something it should not have, which is a server-side defect.

## Real-World Use Cases

### Public API endpoints

When exposing endpoints to third-party consumers, output validation serves as a machine-enforced contract. If an internal refactor changes the response shape, the action fails loudly instead of shipping a breaking change:

```ts
const publicUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
})

export default defineAction({
  input: z.object({ id: z.string() }),
  outputSchema: publicUserSchema,
  handler: async ({ input }) => {
    const user = await db.user.findUnique({ where: { id: input.id } })
    return {
      id: user.id,
      displayName: user.name,
      avatarUrl: user.avatar,
    }
  },
})
```

### Sanitizing ORM results

ORMs and query builders often return more columns than you need. Output validation acts as a safeguard against over-fetching:

```ts
const todoOutput = z.object({
  id: z.number(),
  title: z.string(),
  done: z.boolean(),
})

export default defineAction({
  outputSchema: todoOutput,
  handler: async () => {
    // Even if the table has 20 columns, only id, title, done pass through
    return await db.todo.findMany()
  },
})
```

### Typed frontend contracts

When you define the output schema, the TypeScript type of `data` in `useAction` on the client can be aligned to the exact shape the server guarantees. This removes guesswork from frontend development:

```ts
// Server guarantees this shape
const orderOutput = z.object({
  orderId: z.string(),
  total: z.number(),
  status: z.enum(['pending', 'shipped', 'delivered']),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number(),
  })),
})
```

### Stripping sensitive fields from shared models

If your database model includes sensitive information, output validation ensures it never reaches the wire:

```ts
// Full database model has: id, name, email, passwordHash, mfaSecret, loginAttempts
// Output schema allows only the public fields:
const safeUserOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
})

export default defineAction({
  input: z.object({ id: z.string() }),
  outputSchema: safeUserOutput,
  handler: async ({ input }) => {
    // Raw database row -- passwordHash and mfaSecret are present but will be caught
    return await db.user.findUnique({ where: { id: input.id } })
  },
})
```

## With Valibot and ArkType

Output validation works with any Standard Schema library, not only Zod:

::: code-group

```ts [Valibot]
import * as v from 'valibot'

export default defineAction({
  input: v.object({ id: v.string() }),
  outputSchema: v.object({
    id: v.string(),
    name: v.string(),
    email: v.pipe(v.string(), v.email()),
  }),
  handler: async ({ input }) => {
    return await db.user.findUnique({ where: { id: input.id } })
  },
})
```

```ts [ArkType]
import { type } from 'arktype'

export default defineAction({
  input: type({ id: 'string' }),
  outputSchema: type({
    id: 'string',
    name: 'string',
    email: 'string.email',
  }),
  handler: async ({ input }) => {
    return await db.user.findUnique({ where: { id: input.id } })
  },
})
```

:::

## Performance

Output validation adds a single `~standard.validate()` call to the response path. Because it validates one return value (not a stream or batch), the overhead is negligible -- typically under 0.1ms for objects with fewer than 50 fields.

::: tip Best Practice
Use output validation for external-facing APIs, endpoints that return user data, and any action where accidentally leaking a field would be a security or compliance concern. For internal-only actions where the handler and consumer are in the same codebase, input validation alone is often sufficient.
:::
