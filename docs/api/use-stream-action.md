# useStreamAction()

Client composable for consuming streaming server actions via Server-Sent Events. Provides reactive state for stream chunks, status, and error handling.

## Type Signature

```ts
// Overload 1: Typed reference (E2E inference)
function useStreamAction<T extends TypedActionReference>(
  action: T,
  options?: UseStreamActionOptions<InferActionOutput<T>>,
): UseStreamActionReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: String path (manual generics)
function useStreamAction<TInput = void, TChunk = unknown>(
  path: string,
  options?: UseStreamActionOptions<TChunk>,
): UseStreamActionReturn<TInput, TChunk>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `TypedActionReference \| string` | Typed action reference from `#actions` or a manual API path |
| `options` | `UseStreamActionOptions` | Configuration for headers, timeout, and callbacks |

---

## Options

```ts
interface UseStreamActionOptions<TChunk> {
  /** Static headers or a function returning headers (e.g. for auth tokens). */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Connection timeout in milliseconds. Aborts the stream if not established within this time. */
  timeout?: number
  /** Called for each data chunk received from the stream. */
  onChunk?: (chunk: TChunk) => void
  /** Called when the stream completes successfully. Receives all accumulated chunks. */
  onDone?: (allChunks: TChunk[]) => void
  /** Called when a stream error occurs (HTTP error, SSE error event, or network failure). */
  onError?: (error: ActionError) => void
}
```

### `headers`

- **Type:** `Record<string, string> | (() => Record<string, string>)`
- **Required:** No
- **Description:** Custom headers merged with the default `Accept: text/event-stream` header. Use a function for dynamic headers (e.g., auth tokens that may change between requests).

```ts
const { execute } = useStreamAction(aiChat, {
  headers: () => ({ Authorization: `Bearer ${authStore.token}` }),
})
```

### `timeout`

- **Type:** `number`
- **Required:** No
- **Description:** Connection timeout in milliseconds. If the initial connection is not established within this time, the stream is aborted with a `TIMEOUT_ERROR` (statusCode: 408). Uses `AbortSignal.timeout()` combined with the composable's own abort controller.

```ts
const { execute } = useStreamAction(aiChat, {
  timeout: 30000, // 30 second timeout
})
```

### `onChunk`

- **Type:** `(chunk: TChunk) => void`
- **Required:** No
- **Description:** Called synchronously after each chunk is parsed and added to the `chunks` array. Useful for side effects like appending to a text buffer or triggering animations.

### `onDone`

- **Type:** `(allChunks: TChunk[]) => void`
- **Required:** No
- **Description:** Called when the stream completes successfully (either via an explicit server-sent done signal or natural stream end). Receives all accumulated chunks.

### `onError`

- **Type:** `(error: ActionError) => void`
- **Required:** No
- **Description:** Called when any error occurs: HTTP errors, SSE error events from the server, timeout errors, or network failures. The error is also available reactively via `error.value`.

---

## Return Value

```ts
interface UseStreamActionReturn<TInput, TChunk> {
  execute: (input: TInput) => Promise<void>
  stop: () => void
  chunks: Readonly<Ref<TChunk[]>>
  data: Readonly<Ref<TChunk | null>>
  status: Readonly<Ref<StreamStatus>>
  error: Readonly<Ref<ActionError | null>>
}
```

### `execute`

- **Type:** `(input: TInput) => Promise<void>`
- **Description:** Start the stream. Automatically aborts any previous in-flight stream. Resets `chunks`, `data`, and `error` before starting. The promise resolves when the stream ends (success, error, or abort).

### `stop`

- **Type:** `() => void`
- **Description:** Abort the current stream. Sets status to `'done'`. Safe to call when not streaming (no-op).

### `chunks`

- **Type:** `Readonly<Ref<TChunk[]>>`
- **Description:** All chunks received so far. Uses `shallowRef` + `push` + `triggerRef` for O(1) per-chunk reactivity. Reset to `[]` on each `execute()` call.

### `data`

- **Type:** `Readonly<Ref<TChunk | null>>`
- **Description:** The most recently received chunk. Useful for displaying the latest piece of data (e.g., the last token in an AI response).

### `status`

- **Type:** `Readonly<Ref<StreamStatus>>`
- **Description:** Current stream state.

```ts
type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'
```

| Status | Description |
|--------|-------------|
| `idle` | No stream has been started |
| `streaming` | Stream is active and receiving data |
| `done` | Stream completed successfully or was stopped |
| `error` | Stream failed (HTTP error, timeout, SSE error) |

### `error`

- **Type:** `Readonly<Ref<ActionError | null>>`
- **Description:** The last error, if any. Error codes include:

| Code | Description |
|------|-------------|
| `STREAM_ERROR` | HTTP error response or generic stream failure |
| `TIMEOUT_ERROR` | Connection timed out (when `timeout` option is set) |
| Server error code | Error sent from server via `createActionError` or `handleServerError` |

---

## Examples

### AI Chat with Actions

```vue
<script setup lang="ts">
import { aiChat } from '#actions'

const prompt = ref('')
const { execute, chunks, status, error } = useStreamAction(aiChat)

const fullText = computed(() =>
  chunks.value.map(c => c.text).join('')
)

async function send() {
  await execute({ prompt: prompt.value })
}
</script>

<template>
  <div>
    <input v-model="prompt" @keyup.enter="send" />
    <button @click="send" :disabled="status === 'streaming'">
      Send
    </button>
    <div v-if="status === 'streaming'">Generating...</div>
    <div v-if="error">Error: {{ error.message }}</div>
    <pre>{{ fullText }}</pre>
  </div>
</template>
```

### With Auth Headers and Timeout

```ts
import { generateReport } from '#actions'

const { execute, chunks, status, error } = useStreamAction(generateReport, {
  headers: () => ({
    Authorization: `Bearer ${useAuth().token.value}`,
  }),
  timeout: 60000, // 60s timeout for long-running generation
  onChunk(chunk) {
    console.log('Progress:', chunk.progress)
  },
  onDone(allChunks) {
    toast.success('Report generated!')
  },
  onError(err) {
    toast.error(err.message)
  },
})
```

### Stop and Resume

```ts
const { execute, stop, status, chunks } = useStreamAction(streamData)

// Start streaming
execute({ query: 'latest data' })

// Stop mid-stream (status becomes 'done')
stop()

// Re-start with new input (previous chunks are cleared)
execute({ query: 'different data' })
```

### String Path (No Action Refs)

```ts
const { execute, chunks } = useStreamAction<
  { prompt: string },
  { text: string }
>('/api/ai/chat')

await execute({ prompt: 'Hello' })
```

---

## SSR Support

`useStreamAction` automatically handles SSR:

- **URL resolution**: Uses `useRequestURL()` to resolve the full URL during server-side rendering
- **Cookie forwarding**: Forwards cookies from the incoming request for authentication
- **Client-side**: Relative URLs work natively in the browser

No additional configuration is needed.

---

## Performance

- **O(1) per chunk**: Chunks are stored in a `shallowRef` and updated via `push` + `triggerRef` instead of creating a new array on every chunk
- **AbortController cleanup**: `onScopeDispose` automatically aborts the stream when the component unmounts, preventing memory leaks
- **No retry**: Unlike `useAction`, streaming does not support automatic retry because partial data has already been received. Use `execute()` again to restart from scratch.

---

## Auto-Import

`useStreamAction` is auto-imported in all Vue components when the module is installed.

## See Also

- [defineStreamAction](/api/define-stream-action) -- Server-side streaming action definition
- [useAction](/api/use-action) -- Non-streaming action composable
- [Types Reference](/api/types) -- Full type definitions
