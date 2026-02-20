# createActionError()

Create a structured, typed error to throw from action handlers or middleware. The error is caught by `defineAction` and returned to the client as a structured `ActionResult` with `success: false`.

## Type Signature

```ts
function createActionError(opts: {
  code: string
  message: string
  statusCode?: number
  fieldErrors?: Record<string, string[]>
}): ActionError
```

### Parameters

A single options object with the following properties.

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `code` | `string` | Yes | -- | A machine-readable error code identifier. Use UPPER_SNAKE_CASE by convention. |
| `message` | `string` | Yes | -- | A human-readable error message suitable for display to users. |
| `statusCode` | `number` | No | `400` | The HTTP status code associated with the error. |
| `fieldErrors` | `Record<string, string[]>` | No | `undefined` | A map of field names to arrays of error messages. Used for form-level validation feedback. |

### Return Type

```ts
interface ActionError {
  code: string
  message: string
  statusCode: number
  fieldErrors?: Record<string, string[]>
}
```

The returned object also has an internal `__isActionError: true` marker (not part of the public type). This marker allows `defineAction` to distinguish action errors from other thrown exceptions and serialize them without leaking internal details.

---

## Usage in Handlers

Throw `createActionError` inside a `defineAction` handler or a `createActionClient` `.action()` handler to return a structured error response.

```ts
export default defineAction({
  input: z.object({ id: z.string() }),
  handler: async ({ input }) => {
    const todo = await db.todo.findUnique({ where: { id: input.id } })
    if (!todo) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
        statusCode: 404,
      })
    }
    return todo
  },
})
```

The client receives:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Todo not found",
    "statusCode": 404
  }
}
```

## Usage in Middleware

Throw `createActionError` in middleware to halt the chain and return an error before the handler executes.

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

## Usage with Field Errors

Use `fieldErrors` to provide per-field validation feedback for custom validation logic that goes beyond schema validation (e.g., uniqueness checks against a database).

```ts
export default defineAction({
  input: z.object({
    email: z.string().email(),
    username: z.string().min(3),
  }),
  handler: async ({ input }) => {
    const existing = await db.user.findFirst({
      where: {
        OR: [
          { email: input.email },
          { username: input.username },
        ],
      },
    })

    if (existing) {
      const fieldErrors: Record<string, string[]> = {}
      if (existing.email === input.email) {
        fieldErrors.email = ['Email is already taken']
      }
      if (existing.username === input.username) {
        fieldErrors.username = ['Username is already taken']
      }

      throw createActionError({
        code: 'CONFLICT',
        message: 'Duplicate entry',
        statusCode: 409,
        fieldErrors,
      })
    }

    return await db.user.create({ data: input })
  },
})
```

The client receives:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Duplicate entry",
    "statusCode": 409,
    "fieldErrors": {
      "email": ["Email is already taken"],
      "username": ["Username is already taken"]
    }
  }
}
```

---

## Built-in Error Codes

The following error codes are produced automatically by the `defineAction` runtime. You do not need to throw these yourself, but you may use them for consistency.

| Code | Status Code | Produced By | Description |
|------|-------------|-------------|-------------|
| `VALIDATION_ERROR` | `422` | Input schema validation | The request input did not match the `input` schema. `fieldErrors` contains per-field details. |
| `OUTPUT_VALIDATION_ERROR` | `500` | Output schema validation | The handler return value did not match the `outputSchema`. Indicates a server-side bug. |
| `PARSE_ERROR` | `400` | Request body parsing | The request body could not be parsed as JSON when `Content-Type: application/json` was set. |
| `SERVER_ERROR` | varies | H3 `createError()` | An H3 error was thrown (via `createError`). The `statusCode` and `statusMessage` are preserved. |
| `INTERNAL_ERROR` | `500` | Unhandled exceptions | An unexpected error occurred. Internal details are never exposed to the client. In development mode, the full error is logged to the server console. |
| `FETCH_ERROR` | `500` | `useAction` / `useOptimisticAction` | A network-level fetch error occurred on the client side. |

### Custom Error Codes

You are free to define any string as a `code`. Common conventions:

```ts
// Authentication / Authorization
throw createActionError({ code: 'UNAUTHORIZED', message: '...', statusCode: 401 })
throw createActionError({ code: 'FORBIDDEN', message: '...', statusCode: 403 })

// Resource errors
throw createActionError({ code: 'NOT_FOUND', message: '...', statusCode: 404 })
throw createActionError({ code: 'CONFLICT', message: '...', statusCode: 409 })
throw createActionError({ code: 'GONE', message: '...', statusCode: 410 })

// Rate limiting
throw createActionError({ code: 'RATE_LIMITED', message: '...', statusCode: 429 })

// Business logic
throw createActionError({ code: 'INSUFFICIENT_FUNDS', message: '...', statusCode: 422 })
throw createActionError({ code: 'QUOTA_EXCEEDED', message: '...', statusCode: 422 })

// Input (custom validation beyond schema)
throw createActionError({ code: 'VALIDATION_ERROR', message: '...', statusCode: 422, fieldErrors: { ... } })
```

---

## Examples

### Simple Error

```ts
throw createActionError({
  code: 'NOT_FOUND',
  message: 'Todo not found',
  statusCode: 404,
})
```

### Default Status Code

When `statusCode` is omitted, it defaults to `400`.

```ts
throw createActionError({
  code: 'BAD_REQUEST',
  message: 'Invalid operation',
})
// statusCode will be 400
```

### Error with Field Errors

```ts
throw createActionError({
  code: 'VALIDATION_ERROR',
  message: 'Registration failed',
  statusCode: 422,
  fieldErrors: {
    email: ['Email is already taken'],
    username: ['Must be at least 3 characters', 'Cannot contain spaces'],
  },
})
```

### Conditional Error in Handler

```ts
export default defineAction({
  input: z.object({ amount: z.number().positive() }),
  middleware: [authMiddleware],
  handler: async ({ input, ctx }) => {
    const balance = await getBalance(ctx.user.id)
    if (balance < input.amount) {
      throw createActionError({
        code: 'INSUFFICIENT_FUNDS',
        message: `Insufficient balance. Available: ${balance}`,
        statusCode: 422,
      })
    }
    return await processPayment(ctx.user.id, input.amount)
  },
})
```

### Handling on the Client

```vue
<script setup lang="ts">
const { execute, error } = useAction<{ title: string }, Todo>('/api/todos', {
  method: 'POST',
  onError(err) {
    if (err.code === 'VALIDATION_ERROR' && err.fieldErrors) {
      // Display per-field errors in the form
      formErrors.value = err.fieldErrors
    } else {
      toast.error(err.message)
    }
  },
})
</script>
```

---

## Auto-Import

`createActionError` is auto-imported in all server routes (`server/`) when the `nuxt-actions` module is installed. It is exported from the same file as `defineAction`.

## See Also

- [defineAction](/api/define-action) -- Error handling lifecycle
- [defineMiddleware](/api/define-middleware) -- Throwing errors from middleware
- [useAction](/api/use-action) -- Handling errors on the client
- [Types Reference](/api/types) -- `ActionError` type definition
