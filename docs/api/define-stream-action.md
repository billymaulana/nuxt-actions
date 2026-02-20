# defineStreamAction()

Create a streaming server action that sends data via Server-Sent Events (SSE). Returns an H3 event handler with a `_isStream` marker for the module's type generation.

## Type Signature

```ts
function defineStreamAction<
  TInputSchema extends StandardSchemaV1,
  TChunk = unknown,
  TCtx = Record<string, unknown>,
>(options: DefineStreamActionOptions<TInputSchema, TChunk, TCtx>): EventHandler
```

### Type Parameters

| Parameter | Constraint | Default | Description |
|-----------|-----------|---------|-------------|
| `TInputSchema` | `extends StandardSchemaV1` | -- | The Standard Schema type for input validation. |
| `TChunk` | -- | `unknown` | The type of each data chunk sent to the client. |
| `TCtx` | -- | `Record<string, unknown>` | The accumulated context type produced by middleware. |

### Return Type

The returned handler includes:
- Standard H3 event handler behavior
- `_isStream: true` marker (used by module for type generation)
- `_types` phantom property carrying `{ input: TInput, output: TChunk }`

---

## Options

```ts
interface DefineStreamActionOptions<TInputSchema, TChunk, TCtx> {
  input?: TInputSchema
  middleware?: ActionMiddleware[]
  metadata?: ActionMetadata
  handleServerError?: (error: Error) => { code: string, message: string, statusCode?: number }
  handler: (params: {
    input: InferOutput<TInputSchema>
    event: H3Event
    ctx: TCtx
    stream: StreamActionSender<TChunk>
  }) => Promise<void>
}
```

### `input`

- **Type:** `TInputSchema extends StandardSchemaV1`
- **Required:** No
- **Description:** Standard Schema compliant schema for input validation. Works with Zod, Valibot, ArkType, etc. When validation fails, the error is sent as an SSE event (not an HTTP error response) so the client can handle it through the normal stream protocol.

### `middleware`

- **Type:** `ActionMiddleware[]`
- **Required:** No
- **Description:** Middleware chain executed before the handler. Same middleware used with `defineAction` works here.

### `metadata`

- **Type:** `ActionMetadata` (alias for `Record<string, unknown>`)
- **Required:** No
- **Description:** Arbitrary metadata for logging/analytics, accessible to middleware.

### `handleServerError`

- **Type:** `(error: Error) => { code: string, message: string, statusCode?: number }`
- **Required:** No
- **Description:** Custom error handler invoked when the handler or middleware throws an `Error` instance that is not an `ActionError`. This is called for **both** setup errors (middleware) and handler runtime errors. If `statusCode` is omitted, defaults to `500`.

### `handler`

- **Type:** `(params) => Promise<void>`
- **Required:** Yes
- **Description:** The streaming handler function. Must use `stream.send()` to push data and `stream.close()` to signal completion.

---

## Stream Sender API

The `stream` parameter provides two methods:

```ts
interface StreamActionSender<TChunk> {
  /** Send a data chunk to the client as an SSE event */
  send: (data: TChunk) => Promise<void>
  /** Send a __done marker and close the stream */
  close: () => Promise<void>
}
```

**Important:** Always call `stream.close()` when done. If the handler throws without closing, the error is automatically sent as an SSE error event and the stream is closed.

---

## SSE Protocol

Data is sent using the standard Server-Sent Events format:

| Event Type | SSE Data | Description |
|-----------|---------|-------------|
| Data chunk | `data: {"text":"hello"}` | Regular chunk from `stream.send()` |
| Done | `data: {"__actions_done":true}` | Stream completed from `stream.close()` |
| Error | `data: {"__actions_error":{"code":"...","message":"...","statusCode":500}}` | Error from handler/middleware |

The client composable (`useStreamAction`) parses these events automatically.

---

## Execution Lifecycle

1. **Parse input** -- For `GET`/`HEAD`, reads query parameters. For other methods, reads JSON body.
2. **Validate input** -- If `input` schema is provided, validates against Standard Schema. Validation errors are sent as SSE error events.
3. **Run middleware** -- Executes middleware chain in order. Errors are sent as SSE error events.
4. **Create event stream** -- Opens the SSE connection to the client.
5. **Run handler (non-blocking)** -- The handler runs asynchronously after the stream is returned to H3. This ensures the SSE connection is established before data is sent.
6. **Error handling** -- If the handler throws, the error is sent as an SSE event and the stream is closed.

---

## Error Handling

Errors at different stages are handled differently:

| Stage | Error Type | Behavior |
|-------|-----------|----------|
| Setup (before stream) | `TypeError` | Re-thrown (invalid schema) |
| Setup (before stream) | `ActionError` | Sent as SSE error event |
| Setup (before stream) | `Error` | `handleServerError` if provided, else generic error |
| Handler (during stream) | `ActionError` | Sent as SSE error event, stream closed |
| Handler (during stream) | `Error` | `handleServerError` if provided, else `STREAM_ERROR` |
| Handler (during stream) | Non-Error | `STREAM_ERROR` with generic message |

---

## Examples

### Basic Counter Stream

```ts
// server/actions/counter.get.ts
export default defineStreamAction({
  handler: async ({ stream }) => {
    for (let i = 1; i <= 5; i++) {
      await stream.send({ count: i })
      await new Promise(r => setTimeout(r, 1000))
    }
    await stream.close()
  },
})
```

### AI Text Generation

```ts
// server/actions/ai-complete.post.ts
import { z } from 'zod'

export default defineStreamAction({
  input: z.object({
    prompt: z.string().min(1),
    maxTokens: z.number().default(100),
  }),
  handler: async ({ input, stream }) => {
    const response = await ai.complete(input.prompt, {
      maxTokens: input.maxTokens,
      stream: true,
    })
    for await (const token of response) {
      await stream.send({ text: token })
    }
    await stream.close()
  },
})
```

### With Middleware and Error Handling

```ts
// server/actions/chat.post.ts
import { z } from 'zod'

export default defineStreamAction({
  input: z.object({ message: z.string() }),
  middleware: [authMiddleware, rateLimitMiddleware],
  handleServerError: (error) => ({
    code: 'AI_ERROR',
    message: 'AI service unavailable',
    statusCode: 503,
  }),
  handler: async ({ input, ctx, stream }) => {
    await stream.send({ text: `Hello ${ctx.user.name}! ` })

    const response = await ai.chat(input.message)
    for await (const chunk of response) {
      await stream.send({ text: chunk })
    }

    await stream.close()
  },
})
```

### Typed Error from Handler

```ts
export default defineStreamAction({
  input: z.object({ documentId: z.string() }),
  handler: async ({ input, stream }) => {
    const doc = await db.document.findUnique({ where: { id: input.documentId } })
    if (!doc) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: 'Document not found',
        statusCode: 404,
      })
    }

    for (const section of doc.sections) {
      await stream.send({ section })
    }
    await stream.close()
  },
})
```

---

## Auto-Import

`defineStreamAction` is auto-imported in all server routes when the module is installed.

## See Also

- [useStreamAction](/api/use-stream-action) -- Client composable for consuming streams
- [defineAction](/api/define-action) -- Non-streaming server actions
- [Types Reference](/api/types) -- Full type definitions
