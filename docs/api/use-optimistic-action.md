# useOptimisticAction()

A Vue composable for optimistic UI updates with automatic rollback on server error. Applies an update function immediately when `execute()` is called, then reconciles with the server response or rolls back if the request fails.

## Type Signature

```ts
function useOptimisticAction<TInput = void, TOutput = unknown>(
  path: string,
  options: UseOptimisticActionOptions<TInput, TOutput>
): UseOptimisticActionReturn<TInput, TOutput>
```

### Type Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TInput` | `void` | The shape of the input data passed to `execute()`. |
| `TOutput` | `unknown` | The data type for both the optimistic state and the server response. |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | The API route path (e.g., `'/api/todos/toggle'`). |
| `options` | `UseOptimisticActionOptions<TInput, TOutput>` | Yes | Configuration including the current data source and update function. |

---

## Options

```ts
interface UseOptimisticActionOptions<TInput, TOutput> {
  method?: HttpMethod
  headers?: Record<string, string> | (() => Record<string, string>)
  retry?: boolean | number | RetryConfig
  timeout?: number
  debounce?: number
  throttle?: number
  currentData: Ref<TOutput> | ComputedRef<TOutput>
  updateFn: (input: TInput, currentData: TOutput) => TOutput
  onSuccess?: (data: TOutput) => void
  onError?: (error: ActionError) => void
  onSettled?: (result: ActionResult<TOutput>) => void
  onExecute?: (input: TInput) => void
}
```

### `currentData`

- **Type:** `Ref<TOutput> | ComputedRef<TOutput>`
- **Required:** Yes
- **Description:** A reactive reference to the current source-of-truth data. This is read via `toValue()` at execution time to produce the base state for the optimistic update. Also used by `reset()` to restore the original state.

### `updateFn`

- **Type:** `(input: TInput, currentData: TOutput) => TOutput`
- **Required:** Yes
- **Description:** A pure function that computes the optimistic state. Called synchronously with the action input and the current value of `currentData`. The return value is immediately written to `optimisticData`.

This function should be pure (no side effects) and must return a new object -- never mutate the `currentData` argument.

```ts
// Toggle a todo's done status
updateFn: (input, current) =>
  current.map(t => t.id === input.id ? { ...t, done: !t.done } : t)
```

### `method`

- **Type:** `HttpMethod` (`'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'`)
- **Default:** `'POST'`
- **Description:** The HTTP method for the fetch request. For `GET`/`HEAD`, input is sent as query parameters. For all other methods, input is sent as the JSON body.

### `headers`

- **Type:** `Record<string, string> | (() => Record<string, string>)`
- **Required:** No
- **Description:** Static headers or a function returning headers. Useful for authorization tokens.

### `retry`

- **Type:** `boolean | number | RetryConfig`
- **Required:** No
- **Description:** Retry configuration for failed requests. See [useAction retry](/api/use-action#retry) for full details.

### `timeout`

- **Type:** `number`
- **Required:** No
- **Description:** Request timeout in milliseconds. Aborts the request if exceeded.

### `debounce`

- **Type:** `number`
- **Required:** No
- **Description:** Debounce delay in milliseconds. Delays the execution — if another call comes in before the delay expires, the timer resets. Mutually exclusive with `throttle`; if both are set, `debounce` takes priority.

### `throttle`

- **Type:** `number`
- **Required:** No
- **Description:** Throttle interval in milliseconds. The first call executes immediately, then subsequent calls are rate-limited. Ignored if `debounce` is also set.

### `onExecute`

- **Type:** `(input: TInput) => void`
- **Description:** Called after the optimistic update is applied but before the network request begins.

### `onSuccess`

- **Type:** `(data: TOutput) => void`
- **Description:** Called when the server returns `{ success: true, data }`. At this point, `optimisticData` has already been updated to the server-confirmed value.

### `onError`

- **Type:** `(error: ActionError) => void`
- **Description:** Called when the server returns `{ success: false, error }` or a network error occurs. At this point, `optimisticData` has already been rolled back to the pre-execution snapshot.

### `onSettled`

- **Type:** `(result: ActionResult<TOutput>) => void`
- **Description:** Called after every execution completes, regardless of outcome. Fires after `onSuccess` or `onError`.

---

## Return Value

```ts
interface UseOptimisticActionReturn<TInput, TOutput> {
  execute: (input: TInput) => Promise<ActionResult<TOutput>>
  optimisticData: Readonly<Ref<TOutput>>
  data: Readonly<Ref<TOutput | null>>
  error: Readonly<Ref<ActionError | null>>
  status: Readonly<Ref<ActionStatus>>
  isIdle: ComputedRef<boolean>
  isExecuting: ComputedRef<boolean>
  hasSucceeded: ComputedRef<boolean>
  hasErrored: ComputedRef<boolean>
  reset: () => void
}
```

### `execute(input)`

- **Type:** `(input: TInput) => Promise<ActionResult<TOutput>>`
- **Description:** Apply the optimistic update immediately, then send the request to the server. Returns the full `ActionResult`. On server error or network failure, the optimistic state is automatically rolled back.

### `optimisticData`

- **Type:** `Ref<TOutput>`
- **Description:** The reactive optimistic state. Initialized with the current value of `options.currentData`. Updated immediately when `execute()` is called (before the network request). Reconciled with the server response on success, or rolled back to the pre-execution snapshot on error.

Bind your UI to this ref for instant feedback:

```vue
<li v-for="todo in optimisticData" :key="todo.id">
  {{ todo.title }}
</li>
```

### `data`

- **Type:** `Ref<TOutput | null>`
- **Description:** The server-confirmed response data. Initialized as `null`. Only set on a successful server response. Unlike `optimisticData`, this is never set speculatively.

### `error`

- **Type:** `Ref<ActionError | null>`
- **Description:** The most recent error. Initialized as `null`. Set when the server returns `success: false` or a fetch error occurs. Cleared at the start of each new execution.

### `status`

- **Type:** `Ref<ActionStatus>`
- **Description:** The current execution status:

| Value | Description |
|-------|-------------|
| `'idle'` | No execution has started, or `reset()` was called. |
| `'executing'` | Optimistic update applied, waiting for server response. |
| `'success'` | Server confirmed the update. |
| `'error'` | Server rejected the update or network failed. Optimistic state was rolled back. |

### `reset()`

- **Type:** `() => void`
- **Description:** Reset all state: `optimisticData` reverts to `toValue(currentData)`, `data` to `null`, `error` to `null`, `status` to `'idle'`.

---

## Execution Lifecycle

1. **Snapshot** -- The current value of `optimisticData` is deep-cloned (via JSON round-trip) for potential rollback. This ensures nested objects are fully copied and not affected by later mutations.
2. **Optimistic update** -- `optimisticData` is set to `updateFn(input, optimisticData.value)`. Note: the update chains from the latest optimistic state, not `currentData`, to correctly handle rapid successive calls.
3. **onExecute** -- The `onExecute(input)` callback fires.
4. **Status** -- `status` is set to `'executing'`. `error` is cleared.
5. **Fetch** -- A request is sent to `path` with the configured `method`.
6. **On success** (`result.success === true`):
   - `data` is set to `result.data`.
   - `optimisticData` is updated to `result.data` (server truth replaces the optimistic value).
   - `status` is set to `'success'`.
   - `onSuccess(result.data)` fires.
   - `onSettled(result)` fires.
7. **On error** (`result.success === false`):
   - `optimisticData` is rolled back to the snapshot from step 1.
   - `error` is set to `result.error`.
   - `status` is set to `'error'`.
   - `onError(result.error)` fires.
   - `onSettled(result)` fires.
8. **On fetch error** (network failure):
   - `optimisticData` is rolled back to the snapshot.
   - A `FETCH_ERROR` `ActionError` is created.
   - `error` is set to the constructed error.
   - `status` is set to `'error'`.
   - `onError(actionError)` fires.
   - `onSettled({ success: false, error: actionError })` fires.

---

## Examples

### Toggle Todo Completion

```vue
<script setup lang="ts">
interface Todo {
  id: number
  title: string
  done: boolean
}

const todos = ref<Todo[]>([
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Walk dog', done: true },
])

const { execute, optimisticData } = useOptimisticAction<
  { id: number },
  Todo[]
>('/api/todos/toggle', {
  method: 'PATCH',
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
  onSuccess(serverTodos) {
    // Sync source of truth with server response
    todos.value = serverTodos
  },
  onError(error) {
    toast.error('Failed to update -- changes reverted')
  },
})
</script>

<template>
  <ul>
    <li v-for="todo in optimisticData" :key="todo.id">
      <input
        type="checkbox"
        :checked="todo.done"
        @change="execute({ id: todo.id })"
      />
      {{ todo.title }}
    </li>
  </ul>
</template>
```

### Optimistic Delete

```vue
<script setup lang="ts">
const items = ref<Item[]>([/* ... */])

const { execute, optimisticData, status } = useOptimisticAction<
  { id: string },
  Item[]
>('/api/items', {
  method: 'DELETE',
  currentData: items,
  updateFn: (input, current) => current.filter(item => item.id !== input.id),
  onSuccess(serverItems) {
    items.value = serverItems
  },
  onError() {
    toast.error('Delete failed -- item restored')
  },
})
</script>

<template>
  <div v-for="item in optimisticData" :key="item.id">
    <span>{{ item.name }}</span>
    <button @click="execute({ id: item.id })" :disabled="status === 'executing'">
      Delete
    </button>
  </div>
</template>
```

### Optimistic Add

```vue
<script setup lang="ts">
const messages = ref<Message[]>([])

const { execute, optimisticData } = useOptimisticAction<
  { text: string },
  Message[]
>('/api/messages', {
  method: 'POST',
  currentData: messages,
  updateFn: (input, current) => [
    ...current,
    { id: `temp-${Date.now()}`, text: input.text, pending: true },
  ],
  onSuccess(serverMessages) {
    messages.value = serverMessages
  },
})
</script>

<template>
  <div v-for="msg in optimisticData" :key="msg.id" :class="{ pending: msg.pending }">
    {{ msg.text }}
  </div>
  <form @submit.prevent="execute({ text: newMessage })">
    <input v-model="newMessage" />
    <button type="submit">Send</button>
  </form>
</template>
```

### With ComputedRef as currentData

```vue
<script setup lang="ts">
const store = useTodoStore()

// ComputedRef works as currentData
const todos = computed(() => store.todos)

const { execute, optimisticData } = useOptimisticAction<
  { id: number },
  Todo[]
>('/api/todos/toggle', {
  method: 'PATCH',
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
})
</script>
```

### With All Callbacks

```ts
const { execute, optimisticData, data, error, status, reset } = useOptimisticAction<
  { id: number; rating: number },
  Product[]
>('/api/products/rate', {
  method: 'PATCH',
  currentData: products,
  updateFn: (input, current) =>
    current.map(p => p.id === input.id ? { ...p, rating: input.rating } : p),
  onExecute(input) {
    console.log('Rating product:', input.id, 'with', input.rating)
  },
  onSuccess(serverProducts) {
    products.value = serverProducts
    toast.success('Rating saved')
  },
  onError(error) {
    toast.error(`Rating failed: ${error.message}`)
  },
  onSettled(result) {
    analytics.track('product_rated', { success: result.success })
  },
})
```

---

## Auto-Import

`useOptimisticAction` is auto-imported in all Vue components and composables when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [useAction](/api/use-action) -- Standard action composable without optimistic updates
- [useFormAction](/api/use-form-action) -- Form integration with field-level errors
- [defineAction](/api/define-action) -- Server-side action definition
- [Cache Invalidation](/api/invalidate-actions) -- Refetch or clear `useActionQuery` caches
- [Types Reference](/api/types) -- `UseOptimisticActionOptions`, `UseOptimisticActionReturn`
