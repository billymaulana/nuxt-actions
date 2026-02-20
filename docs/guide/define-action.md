# defineAction

`defineAction` is the core server utility for creating type-safe API routes with automatic input validation, output validation, middleware, and a consistent response format. It wraps the H3 `defineEventHandler` and adds the validation and error-handling layers that make your API routes predictable and safe.

::: tip Working examples
See `defineAction` used in a real application: [nuxt-actions-example/server/actions/](https://github.com/billymaulana/nuxt-actions-example/tree/master/server/actions) -- includes CRUD, validation, middleware, and streaming actions.
:::

## Basic Usage with Zod

The most common pattern is a POST action with a Zod input schema:

```ts
// server/api/posts.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required').max(200),
    body: z.string().min(1, 'Body is required'),
    categoryId: z.string().uuid('Invalid category ID'),
    tags: z.array(z.string()).max(5, 'Maximum 5 tags').default([]),
    published: z.boolean().default(false),
  }),
  handler: async ({ input, event }) => {
    const session = await getUserSession(event)

    const post = await db.post.create({
      data: {
        ...input,
        authorId: session.user.id,
      },
    })

    return post
  },
})
```

The `input` parameter inside the handler is fully typed based on the schema output type, including defaults applied by Zod. In this example, `input.tags` is typed as `string[]` (not `string[] | undefined`) because the `.default([])` call guarantees a value.

## Usage with Valibot

Valibot works identically -- pass any Standard Schema compliant object as the `input`:

```ts
// server/api/posts.post.ts
import * as v from 'valibot'

export default defineAction({
  input: v.object({
    title: v.pipe(v.string(), v.minLength(1, 'Title is required'), v.maxLength(200)),
    body: v.pipe(v.string(), v.minLength(1, 'Body is required')),
    categoryId: v.pipe(v.string(), v.uuid('Invalid category ID')),
    tags: v.optional(v.pipe(v.array(v.string()), v.maxLength(5, 'Maximum 5 tags')), []),
    published: v.optional(v.boolean(), false),
  }),
  handler: async ({ input }) => {
    const post = await db.post.create({ data: input })
    return post
  },
})
```

## Usage with ArkType

ArkType uses a different syntax but the same Standard Schema interface:

```ts
// server/api/posts.post.ts
import { type } from 'arktype'

export default defineAction({
  input: type({
    title: 'string >= 1 & string <= 200',
    body: 'string >= 1',
    categoryId: 'string.uuid',
    'tags?': 'string[] <= 5',
    'published?': 'boolean',
  }),
  handler: async ({ input }) => {
    const post = await db.post.create({ data: input })
    return post
  },
})
```

::: tip Switching libraries
Because `defineAction` accepts any Standard Schema, you can use different libraries in different actions within the same project. There is no lock-in.
:::

## Input Validation and Field Errors

When the request body fails validation, the action returns a `422` response with field-level error messages. The client receives this without the handler ever running:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "statusCode": 422,
    "fieldErrors": {
      "title": ["Title is required"],
      "categoryId": ["Invalid category ID"],
      "tags": ["Maximum 5 tags"]
    }
  }
}
```

Field paths are resolved from the schema. Nested objects use dot notation:

```ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    billing: z.object({
      address: z.object({
        zip: z.string().regex(/^\d{5}$/, 'Must be a 5-digit ZIP code'),
      }),
    }),
  }),
  handler: async ({ input }) => {
    // ...
  },
})

// Validation error for the zip field returns:
// fieldErrors: { "billing.address.zip": ["Must be a 5-digit ZIP code"] }
```

### Displaying field errors on the client

```vue
<script setup lang="ts">
const { execute, error } = useAction<CreateOrderInput, Order>('/api/orders')

function fieldError(path: string): string | undefined {
  return error.value?.fieldErrors?.[path]?.[0]
}
</script>

<template>
  <div>
    <input v-model="form.billing.address.zip" />
    <span v-if="fieldError('billing.address.zip')" class="error">
      {{ fieldError('billing.address.zip') }}
    </span>
  </div>
</template>
```

## Output Schema Validation

You can validate the data your handler returns before it reaches the client. This acts as a safety net to prevent leaking sensitive fields or returning malformed data:

```ts
// server/api/users/[id].get.ts
import { z } from 'zod'

const userOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable(),
  role: z.enum(['user', 'admin']),
  // Note: password, passwordHash, internalNotes are NOT in this schema.
  // If the handler accidentally returns them, they will be stripped.
})

export default defineAction({
  input: z.object({
    id: z.string().uuid(),
  }),
  outputSchema: userOutput,
  handler: async ({ input }) => {
    // Even if db.user.findUnique returns passwordHash,
    // the output schema ensures it never reaches the client.
    const user = await db.user.findUnique({
      where: { id: input.id },
    })

    if (!user) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: 'User not found',
        statusCode: 404,
      })
    }

    return user
  },
})
```

If the output fails validation, the client receives a `500` error with the code `OUTPUT_VALIDATION_ERROR`. In development mode, the validation issues are logged to the server console for debugging.

::: warning
Output validation failures return a `500` status code because they indicate a server-side bug, not a client mistake. The field errors from output validation are included in the error response, but be aware they describe your return value's shape -- review them carefully before exposing them in a production UI.
:::

## Accessing the H3 Event

The `event` parameter gives you full access to the underlying H3 request. Use it for headers, cookies, IP addresses, and anything else not covered by the input schema:

```ts
// server/api/uploads.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    filename: z.string(),
    contentType: z.string(),
    sizeBytes: z.number().max(10_000_000, 'File must be under 10MB'),
  }),
  handler: async ({ input, event }) => {
    // Read authorization header
    const token = getHeader(event, 'authorization')

    // Read cookies
    const sessionId = getCookie(event, 'session_id')

    // Get client IP for rate limiting
    const clientIp = getRequestIP(event, { xForwardedFor: true })

    // Set response headers
    setResponseHeader(event, 'X-Upload-Id', uploadId)

    const presignedUrl = await generatePresignedUrl({
      filename: input.filename,
      contentType: input.contentType,
      uploadedBy: clientIp,
    })

    return { presignedUrl, expiresIn: 3600 }
  },
})
```

## Handler Return Types

Handlers can return any serializable value. The return type is inferred and passed through to the client via `useAction`:

```ts
// Returning an object
handler: async ({ input }) => {
  return { id: '123', title: input.title, createdAt: new Date().toISOString() }
}

// Returning an array
handler: async () => {
  return await db.notification.findMany({ where: { read: false } })
}

// Returning a primitive
handler: async ({ input }) => {
  const count = await db.post.count({ where: { authorId: input.userId } })
  return count
}

// Returning null (e.g., delete operations)
handler: async ({ input }) => {
  await db.post.delete({ where: { id: input.id } })
  return null
}
```

All of these are wrapped in the standard `{ success: true, data: ... }` envelope before reaching the client.

## HTTP Methods

`defineAction` works with every HTTP method. The file naming convention determines the method:

| File | Method | Input source |
|---|---|---|
| `server/api/posts.post.ts` | POST | Request body |
| `server/api/posts.get.ts` | GET | Query parameters |
| `server/api/posts.put.ts` | PUT | Request body |
| `server/api/posts.patch.ts` | PATCH | Request body |
| `server/api/posts.delete.ts` | DELETE | Request body |
| `server/api/posts.get.ts` | HEAD | Query parameters |

### GET actions

For GET requests, input is parsed from query parameters. Keep in mind that query strings are always strings, so use `.coerce` or `.transform` in your schema when you need numeric or boolean values:

```ts
// server/api/posts.get.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    published: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  }),
  handler: async ({ input }) => {
    const offset = (input.page - 1) * input.limit

    const [posts, total] = await Promise.all([
      db.post.findMany({
        where: input.search
          ? { title: { contains: input.search } }
          : undefined,
        skip: offset,
        take: input.limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.post.count(),
    ])

    return {
      posts,
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    }
  },
})
```

Call it from the client with the `method: 'GET'` option:

```ts
const { execute, data } = useAction<
  { page: number; limit: number; search?: string },
  { posts: Post[]; pagination: Pagination }
>('/api/posts', { method: 'GET' })

await execute({ page: 1, limit: 20, search: 'nuxt' })
```

## Using Middleware

Pass an array of middleware functions to run before the handler. Middleware can add context, enforce authentication, apply rate limits, or perform logging:

```ts
// server/api/billing/invoices.get.ts
import { z } from 'zod'

export default defineAction({
  middleware: [authMiddleware, subscriptionMiddleware],
  input: z.object({
    year: z.coerce.number().int().min(2020).max(2030),
    status: z.enum(['paid', 'pending', 'overdue']).optional(),
  }),
  handler: async ({ input, ctx }) => {
    // ctx.user comes from authMiddleware
    // ctx.subscription comes from subscriptionMiddleware
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: ctx.subscription.organizationId,
        year: input.year,
        ...(input.status ? { status: input.status } : {}),
      },
    })

    return invoices
  },
})
```

Middleware is covered in detail in the [Middleware guide](/guide/middleware).

## Handler Parameters Reference

The handler function receives a single object with three properties:

| Parameter | Type | Description |
|---|---|---|
| `input` | Inferred from the `input` schema's output type | The validated, transformed input. If no `input` schema is provided, this is `unknown`. |
| `event` | `H3Event` | The raw H3 event. Use it for headers, cookies, IP, and other request metadata. |
| `ctx` | Inferred from the middleware chain | An object containing all context added by middleware via `next({ ctx: ... })`. Empty `{}` if no middleware is defined. |

## Response Format

Every action response follows the same discriminated union shape. This makes client-side error handling predictable across your entire application:

```ts
// Success -- handler returned a value
{
  success: true,
  data: { /* your return value */ }
}

// Validation error -- input schema rejected the request
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Input validation failed",
    statusCode: 422,
    fieldErrors: { title: ["Title is required"] }
  }
}

// Domain error -- handler threw createActionError(...)
{
  success: false,
  error: {
    code: "NOT_FOUND",
    message: "Invoice not found",
    statusCode: 404
  }
}

// Unhandled error -- something unexpected broke
{
  success: false,
  error: {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    statusCode: 500
  }
}
```

::: tip Security
Unhandled errors never leak stack traces, database details, or internal messages to the client. In development mode, the full error is logged to the server console. In production, clients see only the generic `"An unexpected error occurred"` message.
:::

## Best Practices

### Always validate input

Even for actions that seem simple, define an input schema. It serves as executable documentation, prevents unexpected data from reaching your handler, and gives the client structured field errors for free:

```ts
// Avoid -- no validation, no type safety
export default defineAction({
  handler: async ({ input }) => {
    // input is `unknown` -- you must cast or check manually
    const title = (input as any).title
  },
})

// Prefer -- validated and typed
export default defineAction({
  input: z.object({
    title: z.string().min(1).max(200),
  }),
  handler: async ({ input }) => {
    // input.title is `string`, guaranteed to be 1-200 characters
  },
})
```

### Keep handlers focused

Each action should do one thing. If a handler grows beyond ~50 lines, extract the business logic into a separate utility function:

```ts
// server/utils/billing.ts
export async function processRefund(invoiceId: string, userId: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw createActionError({ code: 'NOT_FOUND', message: 'Invoice not found', statusCode: 404 })
  if (invoice.status === 'refunded') throw createActionError({ code: 'CONFLICT', message: 'Already refunded', statusCode: 409 })

  await paymentProvider.refund(invoice.paymentIntentId)
  return await db.invoice.update({ where: { id: invoiceId }, data: { status: 'refunded', refundedBy: userId } })
}

// server/api/billing/refund.post.ts
import { z } from 'zod'

export default defineAction({
  middleware: [authMiddleware, adminMiddleware],
  input: z.object({ invoiceId: z.string().uuid() }),
  handler: async ({ input, ctx }) => {
    return await processRefund(input.invoiceId, ctx.user.id)
  },
})
```

### Use `createActionError` for domain errors

Throw `createActionError` for expected error conditions (not found, permission denied, conflict, business rule violations). This gives the client a structured error with a meaningful code and status:

```ts
handler: async ({ input }) => {
  const existing = await db.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw createActionError({
      code: 'DUPLICATE_EMAIL',
      message: 'An account with this email already exists',
      statusCode: 409,
      fieldErrors: { email: ['This email is already taken'] },
    })
  }

  return await db.user.create({ data: input })
}
```

### Do not leak internal errors

Never throw raw `Error` objects containing database messages, stack traces, or internal paths. The module catches unhandled errors and returns a generic message, but it is still best practice to handle known failure modes explicitly:

```ts
// Avoid -- raw error leaks database details if not caught
handler: async ({ input }) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.id } })
  return user
}

// Prefer -- explicit check with a clean error message
handler: async ({ input }) => {
  const user = await db.user.findUnique({ where: { id: input.id } })
  if (!user) {
    throw createActionError({
      code: 'NOT_FOUND',
      message: 'User not found',
      statusCode: 404,
    })
  }
  return user
}
```

## Next Steps

- **[Builder Pattern](/guide/builder-pattern)** -- Use `createActionClient` to share middleware and schemas across actions.
- **[Middleware](/guide/middleware)** -- Create reusable middleware for auth, rate limiting, and logging.
- **[Error Handling](/guide/error-handling)** -- Full reference for the error model and `createActionError`.
- **[Output Validation](/guide/output-validation)** -- Deep dive into output schema validation.
