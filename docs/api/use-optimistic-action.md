---
description: "API reference for useOptimisticAction: optimistic data, update functions, reconciliation with the server, and rollback."
---

# useOptimisticAction()

A Vue composable for optimistic UI updates with automatic rollback on server error. Applies an update function immediately when `execute()` is called, then reconciles with the server response or rolls back if the request fails.

## Type Signature

```ts
function useOptimisticAction<TInput = void, TOutput = unknown, TData = TOutput>(
  path: string,
  options: UseOptimisticActionOptions<TInput, TOutput, TData>
): UseOptimisticActionReturn<TInput, TOutput, TData>
```

### Type Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TInput` | `void` | The shape of the input data passed to `execute()`. |
| `TOutput` | `unknown` | The server response type. |
| `TData` | `TOutput` | The type of `currentData` and `optimisticData`. Set it when the action returns something other than the whole state, and pass [`reconcile`](#reconcile). |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | The API route path (e.g., `'/api/todos/toggle'`). |
| `options` | `UseOptimisticActionOptions<TInput, TOutput>` | Yes | Configuration including the current data source and update function. |

---

## Options

```ts
interface UseOptimisticActionOptions<TInput, TOutput, TData = TOutput> {
  method?: HttpMethod
  headers?: Record<string, string> | (() => Record<string, string>)
  retry?: boolean | number | RetryConfig
  timeout?: number
  debounce?: number
  throttle?: number
  currentData: Ref<TData> | ComputedRef<TData>
  updateFn: (input: TInput, current: TData) => TData
  transform?: (data: TOutput) => TOutput
  reconcile?: (data: TOutput, optimisticData: TData) => TData
  onSuccess?: (data: TOutput) => void
  onError?: (error: ActionError) => void
  onSettled?: (result: ActionResult<TOutput>) => void
  onExecute?: (input: TInput) => void
}
```

### `currentData`

- **Type:** `Ref<TData> | ComputedRef<TData>`
- **Required:** Yes
- **Description:** A reactive reference to the current source-of-truth data. It sets the starting value of `optimisticData`, and `optimisticData` follows it whenever no call is running. `updateFn` receives the latest optimistic state, which equals `currentData` unless a call is in flight. `reset()` also restores `optimisticData` from it.

### `updateFn`

- **Type:** `(input: TInput, current: TData) => TData`
- **Required:** Yes
- **Description:** A pure function that computes the optimistic state. Called synchronously with the action input and the latest optimistic state, which starts as the value of `currentData`. The return value is immediately written to `optimisticData`.

This function should be pure (no side effects) and must return a new object -- never mutate the `currentData` argument.

```ts
// Toggle a todo's done status
updateFn: (input, current) =>
  current.map(t => t.id === input.id ? { ...t, done: !t.done } : t)
```

### `reconcile`

- **Type:** `(data: TOutput, optimisticData: TData) => TData`
- **Required:** No
- **Description:** Merges the server response into the optimistic state when the call succeeds. Use it when the action returns something other than the whole state, for example one updated todo while `optimisticData` holds the list. It receives the response after `transform`. Without it, the response replaces `optimisticData`.

```ts
// The action returns the updated todo, the state is the whole list
reconcile: (todo, list) =>
  list.map(t => t.id === todo.id ? { ...t, ...todo } : t)
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

## Concurrency

Unlike [`useAction`](/api/use-action) (which runs calls concurrently by default), `useOptimisticAction` **always cancels the previous in-flight request** when `execute()` is called again — there is no `dedupe`/`cancelPrevious` option because chained optimistic updates require it. A superseded call resolves with an `ABORT_ERROR` result and its `onSuccess` does not run, even though the server may already have committed it. The latest call's `optimisticData` always wins; rapid successive calls chain correctly.

## Return Value

```ts
interface UseOptimisticActionReturn<TInput, TOutput, TData = TOutput> {
  execute: (input: TInput) => Promise<ActionResult<TOutput>>
  optimisticData: Readonly<Ref<TData>>
  data: Readonly<Ref<TOutput | null>>
  error: Readonly<Ref<ActionError | null>>
  status: Readonly<Ref<ActionStatus>>
  isIdle: ComputedRef<boolean>
  isExecuting: ComputedRef<boolean>
  hasSucceeded: ComputedRef<boolean>
  hasErrored: ComputedRef<boolean>
  cancel: () => void
  reset: () => void
}
```

### `execute(input)`

- **Type:** `(input: TInput) => Promise<ActionResult<TOutput>>`
- **Description:** Apply the optimistic update immediately, then send the request to the server. Returns the full `ActionResult`. On server error or network failure, the optimistic state is automatically rolled back.

### `optimisticData`

- **Type:** `Ref<TOutput>`
- **Description:** The reactive optimistic state. Initialized with the current value of `options.currentData`. Updated immediately when `execute()` is called (before the network request). Reconciled with the server response on success, or rolled back to the pre-execution snapshot on error. While no call is running it follows `currentData` immediately, so a refetched list or an item added elsewhere shows up without a `reset()`, and a call started in the same tick builds on it. A `currentData` change that arrives during a call is applied when the call settles: a failed call rolls back to the new value, and a successful call with `reconcile` runs `updateFn` on the new value again before merging the response, so an item the call added optimistically is kept.

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

### `cancel()`

- **Type:** `() => void`
- **Description:** Abort the request in flight, and any debounced or throttled call that has not fired yet. The aborted `execute()` call resolves with an `ABORT_ERROR` result and `status` returns to `'idle'`. `optimisticData` keeps the optimistic update, because the server may already have applied it. If `currentData` changed while the call was running, `optimisticData` takes the new value instead. A no-op when nothing is in flight.

### `reset()`

- **Type:** `() => void`
- **Description:** Reset all state: `optimisticData` reverts to `toValue(currentData)`, `data` to `null`, `error` to `null`, `status` to `'idle'`.

---

## Execution Lifecycle

1. **Snapshot** -- The current value of `optimisticData` is deep-cloned (via JSON round-trip) for potential rollback. This ensures nested objects are fully copied and not affected by later mutations.
2. **Optimistic update** -- `optimisticData` is set to `updateFn(input, optimisticData.value)`. Note: the update chains from the latest optimistic state, not `currentData`, to correctly handle rapid successive calls.
3. **Status** -- `status` is set to `'executing'`. `error` is cleared.
4. **onExecute** -- The `onExecute(input)` callback fires.
5. **Fetch** -- A request is sent to `path` with the configured `method`.
6. **On success** (`result.success === true`):
   - `data` is set to `result.data`.
   - `optimisticData` is updated to `result.data` (server truth replaces the optimistic value), or to `reconcile(result.data, optimisticData)` when `reconcile` is set. If `currentData` changed during the call, `reconcile` receives `updateFn(input, currentData)` instead.
   - `status` is set to `'success'`.
   - `onSuccess(result.data)` fires.
   - `onSettled(result)` fires.
7. **On error** (`result.success === false`):
   - `optimisticData` is rolled back to the snapshot from step 1, or to `currentData` if it changed during the call.
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
