# defineAction()

Create a type-safe server action with Standard Schema validation, middleware, and structured error handling. Returns an H3 event handler that can be used as a Nuxt API route.

## Type Signature

```ts
function defineAction<
  TInputSchema extends StandardSchemaV1,
  TOutput,
  TCtx = Record<string, unknown>,
  TOutputSchema extends StandardSchemaV1 | undefined = undefined,
>(options: DefineActionOptions<TInputSchema, TOutput, TCtx, TOutputSchema>): EventHandler
```

### Type Parameters

| Parameter | Constraint | Default | Description |
|-----------|-----------|---------|-------------|
| `TInputSchema` | `extends StandardSchemaV1` | -- | The Standard Schema type for input validation. Inferred from `options.input`. |
| `TOutput` | -- | -- | The return type of the handler function. |
| `TCtx` | -- | `Record<string, unknown>` | The accumulated context type produced by middleware. |
| `TOutputSchema` | `extends StandardSchemaV1 \| undefined` | `undefined` | The Standard Schema type for output validation. Inferred from `options.outputSchema`. |

### Return Type

```ts
ReturnType<typeof defineEventHandler>  // H3 EventHandler
```

The returned event handler wraps the action lifecycle (parse, validate, middleware, execute, output-validate) and always responds with `ActionResult<TOutput>`.

---

## Options

```ts
interface DefineActionOptions<TInputSchema, TOutput, TCtx, TOutputSchema> {
  input?: TInputSchema
  outputSchema?: TOutputSchema
  middleware?: ActionMiddleware[]
  metadata?: ActionMetadata
  handleServerError?: (error: Error) => { code: string, message: string, statusCode?: number }
  handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>
}
```

### `input`

- **Type:** `TInputSchema extends StandardSchemaV1`
- **Required:** No
- **Description:** A Standard Schema compliant object used to validate the request input. Compatible with Zod (>=3.24), Valibot (>=1.0), ArkType (>=2.1), and any library implementing the [Standard Schema](https://standardschema.dev/) specification.

When provided, the raw input is validated before the handler executes. If validation fails, the action returns an `ActionResult` with `code: 'VALIDATION_ERROR'`, `statusCode: 422`, and per-field error details in `fieldErrors`.

If the schema object does not implement the `~standard.validate` interface, a `TypeError` is thrown at runtime.

```ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  }),
  handler: async ({ input }) => {
    // input is typed as { title: string; priority: 'low' | 'medium' | 'high' }
    return { id: Date.now(), ...input }
  },
})
```

### `outputSchema`

- **Type:** `TOutputSchema extends StandardSchemaV1 | undefined`
- **Required:** No
- **Default:** `undefined`
- **Description:** A Standard Schema compliant object used to validate the handler return value. If the output does not match, the action returns `code: 'OUTPUT_VALIDATION_ERROR'` with `statusCode: 500`.

```ts
import { z } from 'zod'

export default defineAction({
  input: z.object({ id: z.string() }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
  handler: async ({ input }) => {
    return await db.user.findUnique({ where: { id: input.id } })
  },
})
```

### `middleware`

- **Type:** `ActionMiddleware[]`
- **Required:** No
- **Description:** An array of middleware functions executed sequentially before the handler. Each middleware can extend the handler context (`ctx`) or throw errors to halt execution.

```ts
export default defineAction({
  middleware: [authMiddleware, rateLimitMiddleware],
  input: z.object({ title: z.string() }),
  handler: async ({ input, ctx }) => {
    // ctx contains values from both middleware
    return await db.todo.create({
      data: { title: input.title, userId: ctx.user.id },
    })
  },
})
```

### `metadata`

- **Type:** `ActionMetadata` (alias for `Record<string, unknown>`)
- **Required:** No
- **Description:** Arbitrary key-value data attached to the action for logging, analytics, or authorization. Metadata is not used internally by the runtime but can be read by middleware or external tooling.

```ts
export default defineAction({
  metadata: { action: 'create-todo', requiredRole: 'editor' },
  input: z.object({ title: z.string() }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title }
  },
})
```

### `handleServerError`

- **Type:** `(error: Error) => { code: string, message: string, statusCode?: number }`
- **Required:** No
- **Description:** Custom error handler invoked when the handler or middleware throws an `Error` instance that is **not** an `ActionError` (created via `createActionError`). Allows mapping application-specific exceptions to structured error responses. If `statusCode` is omitted, defaults to `500`.

This handler is **not** called for:
- `ActionError` instances (thrown via `createActionError`) — these are preserved as-is
- H3 errors (thrown via `createError`) — these are handled separately
- Non-Error values (e.g., `throw "string"`) — these result in `INTERNAL_ERROR`

```ts
export default defineAction({
  handleServerError: (error) => {
    if (error.message.includes('UNIQUE constraint')) {
      return { code: 'DUPLICATE', message: 'Record already exists', statusCode: 409 }
    }
    // Never leak internal error messages to clients
    return { code: 'SERVER_ERROR', message: 'Something went wrong', statusCode: 500 }
  },
  input: z.object({ email: z.string().email() }),
  handler: async ({ input }) => {
    return await db.user.create({ data: { email: input.email } })
  },
})
```

### `handler`

- **Type:** `ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>`
- **Required:** Yes
- **Description:** The core function that processes the request. Receives a single object parameter with three properties.

```ts
type ActionHandler<TInput, TOutput, TCtx> = (params: {
  input: TInput
  event: H3Event
  ctx: TCtx
}) => TOutput | Promise<TOutput>
```

---

## Handler Parameters

### `input`

- **Type:** `InferOutput<TInputSchema>` (or `unknown` when no `input` schema is provided)
- **Description:** The validated and typed input data. For `GET`/`HEAD` requests, parsed from query parameters. For all other methods, parsed from the request body.

### `event`

- **Type:** `H3Event` (from the `h3` package)
- **Description:** The raw H3 event object. Provides access to headers, cookies, request metadata, and all H3 utilities (`getHeader`, `setCookie`, `getRequestIP`, etc.).

### `ctx`

- **Type:** `TCtx` (defaults to `Record<string, unknown>`)
- **Description:** The accumulated context object built by the middleware chain. If no middleware is provided, `ctx` is an empty object.

---

## Execution Lifecycle

1. **Parse input** -- For `GET`/`HEAD`, reads query parameters via `getQuery(event)`. For other methods, reads the JSON body via `readBody(event)`. Malformed JSON on a `content-type: application/json` request throws `PARSE_ERROR` (`statusCode: 400`).
2. **Validate input** -- If `input` schema is provided, validates the parsed input against the Standard Schema `~standard.validate()` method. Failures return `VALIDATION_ERROR` (`statusCode: 422`) with `fieldErrors`.
3. **Run middleware** -- Executes each middleware in array order. Each middleware should call `next()` exactly once. Context passed via `next({ ctx: { ... } })` is **deep-merged** into the existing context (nested objects are recursively merged, arrays are replaced). If a middleware does not call `next()`, a warning is logged in development to help detect accidental omissions.
4. **Execute handler** -- Calls the handler with `{ input, event, ctx }`.
5. **Validate output** -- If `outputSchema` is provided, validates the handler return value. Failures return `OUTPUT_VALIDATION_ERROR` (`statusCode: 500`).
6. **Return result** -- On success, returns `{ success: true, data: TOutput }`.

---

## Response Format

Every action returns an `ActionResult<TOutput>` regardless of outcome.

### Success

```json
{
  "success": true,
  "data": { "id": 1, "title": "Buy milk" }
}
```

### Input Validation Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "statusCode": 422,
    "fieldErrors": {
      "title": ["Title is required"],
      "email": ["Invalid email address"]
    }
  }
}
```

### Output Validation Error

```json
{
  "success": false,
  "error": {
    "code": "OUTPUT_VALIDATION_ERROR",
    "message": "Output validation failed",
    "statusCode": 500,
    "fieldErrors": {
      "email": ["Invalid email"]
    }
  }
}
```

### Parse Error

```json
{
  "success": false,
  "error": {
    "code": "PARSE_ERROR",
    "message": "Invalid JSON in request body",
    "statusCode": 400
  }
}
```

### Handler / Middleware Error (via `createActionError`)

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

### H3 Error (via `createError`)

```json
{
  "success": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Forbidden",
    "statusCode": 403
  }
}
```

### Unhandled Error

Internal details are never leaked to the client. In development mode, the error is logged to the server console.

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "statusCode": 500
  }
}
```

---

## Examples

### Basic Action with Zod

```ts
// server/api/todos.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    const todo = await db.todo.create({ data: input })
    return todo
  },
})
```

### Basic Action with Valibot

```ts
// server/api/todos.post.ts
import * as v from 'valibot'

export default defineAction({
  input: v.object({
    title: v.pipe(v.string(), v.minLength(1, 'Title is required')),
  }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title }
  },
})
```

### Basic Action with ArkType

```ts
// server/api/todos.post.ts
import { type } from 'arktype'

export default defineAction({
  input: type({ title: 'string > 0' }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title }
  },
})
```

### With Middleware and Output Validation

```ts
// server/api/users/[id].get.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({ id: z.string().uuid() }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
  middleware: [authMiddleware],
  metadata: { action: 'get-user' },
  handler: async ({ input, ctx }) => {
    const user = await db.user.findUnique({ where: { id: input.id } })
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

### Without Input Schema

```ts
// server/api/health.get.ts
export default defineAction({
  handler: async ({ event }) => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      ip: getRequestIP(event),
    }
  },
})
```

### Accessing the H3 Event

```ts
// server/api/profile.get.ts
import { z } from 'zod'

export default defineAction({
  handler: async ({ event }) => {
    const cookie = getCookie(event, 'session_id')
    const userAgent = getHeader(event, 'user-agent')
    return { cookie, userAgent }
  },
})
```

---

## Auto-Import

`defineAction` is auto-imported in all server routes (`server/`) when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [createActionClient](/api/create-action-client) -- Builder pattern for shared middleware and schemas
- [defineMiddleware](/api/define-middleware) -- Create reusable middleware
- [createActionError](/api/create-action-error) -- Throw structured errors
- [Types Reference](/api/types) -- Full type definitions
