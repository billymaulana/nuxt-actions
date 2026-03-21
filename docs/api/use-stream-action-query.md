# useStreamActionQuery()

Composable that wraps `useStreamAction` with caching support. When a stream completes, the accumulated chunks are cached in `nuxtApp.payload.data`. On remount, cached chunks are restored immediately.

## Type Signature

```ts
// Overload 1: Typed reference (E2E inference)
function useStreamActionQuery<T extends TypedActionReference>(
  action: T,
  options?: UseStreamActionQueryOptions<InferActionOutput<T>>,
): UseStreamActionQueryReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: String path (manual generics)
function useStreamActionQuery<TInput = void, TChunk = unknown>(
  path: string,
  options?: UseStreamActionQueryOptions<TChunk>,
): UseStreamActionQueryReturn<TInput, TChunk>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `TypedActionReference \| string` | Typed action reference from `#actions` or a manual API path |
| `options` | `UseStreamActionQueryOptions` | Streaming and cache configuration |

---

## Options

```ts
interface UseStreamActionQueryOptions<TChunk = unknown> {
  method?: HttpMethod
  headers?: Record<string, string> | (() => Record<string, string>)
  timeout?: number
  cacheKey?: string
  onChunk?: (chunk: TChunk) => void
  onDone?: (allChunks: TChunk[]) => void
  onError?: (error: ActionError) => void
}
```

### `cacheKey`

- **Type:** `string`
- **Default:** Derived from action path
- **Description:** Cache key for storing completed stream results. When provided, completed chunks are persisted in `nuxtApp.payload.data` and restored on component remount.

### `method`

- **Type:** `HttpMethod`
- **Default:** `'POST'`
- **Description:** HTTP method override for string path usage.

### `headers`

- **Type:** `Record<string, string> | (() => Record<string, string>)`
- **Description:** Static headers or function returning headers.

### `timeout`

- **Type:** `number`
- **Description:** Connection timeout in milliseconds.

### `onChunk`

- **Type:** `(chunk: TChunk) => void`
- **Description:** Called for each chunk received during streaming.

### `onDone`

- **Type:** `(allChunks: TChunk[]) => void`
- **Description:** Called when the stream completes with all chunks.

### `onError`

- **Type:** `(error: ActionError) => void`
- **Description:** Called when a stream error occurs.

---

## Return Value

```ts
interface UseStreamActionQueryReturn<TInput, TChunk> {
  execute: (input: TInput) => Promise<void>
  stop: () => void
  chunks: Readonly<Ref<TChunk[]>>
  data: Readonly<Ref<TChunk | null>>
  status: Readonly<Ref<StreamStatus>>
  error: Readonly<Ref<ActionError | null>>
  fromCache: Readonly<Ref<boolean>>
  clearCache: () => void
}
```

### `fromCache`

- **Type:** `Readonly<Ref<boolean>>`
- **Description:** `true` when the current chunks were restored from cache instead of a fresh stream.

### `clearCache`

- **Type:** `() => void`
- **Description:** Clear the cached stream result from the Nuxt payload.

### `execute`

- **Type:** `(input: TInput) => Promise<void>`
- **Description:** Start a new stream. Clears any cached state first.

### `stop`

- **Type:** `() => void`
- **Description:** Stop the current stream.

### `chunks`

- **Type:** `Readonly<Ref<TChunk[]>>`
- **Description:** All chunks received so far (or from cache).

### `data`

- **Type:** `Readonly<Ref<TChunk | null>>`
- **Description:** The most recent chunk.

### `status`

- **Type:** `Readonly<Ref<StreamStatus>>`
- **Description:** One of `'idle'`, `'streaming'`, `'done'`, or `'error'`.

---

## Examples

### Cached AI Response

```vue
<script setup lang="ts">
import { generateReport } from '#actions'

const { execute, chunks, fromCache, status, clearCache } = useStreamActionQuery(
  generateReport,
  { cacheKey: 'report-main' },
)

// On first visit: streams from server
// On remount: chunks restored from cache instantly
</script>

<template>
  <div v-if="fromCache" class="cache-badge">From cache</div>
  <div v-for="(chunk, i) in chunks" :key="i">{{ chunk.text }}</div>
  <button @click="clearCache(); execute({ prompt: 'Q4 summary' })">
    Regenerate
  </button>
</template>
```

### With String Path

```ts
const { execute, chunks, fromCache } = useStreamActionQuery<
  { prompt: string },
  { text: string }
>('/api/stream/generate', {
  cacheKey: 'generate-stream',
})

await execute({ prompt: 'Hello' })
```

---

## Auto-Import

`useStreamActionQuery` is auto-imported in all Vue components when the module is installed.

## See Also

- [useStreamAction](/api/use-stream-action) -- Non-cached streaming composable
- [defineStreamAction](/api/define-stream-action) -- Server-side streaming definition
- [Streaming Guide](/guide/streaming) -- Usage guide
