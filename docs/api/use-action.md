# useAction()

A Vue composable for calling server actions with reactive state management, lifecycle callbacks, and two execution strategies. Provides `execute` (returns full result) and `executeAsync` (returns data directly or throws).

## Type Signature

```ts
function useAction<TInput = void, TOutput = unknown>(
  path: string,
  options?: UseActionOptions<TInput, TOutput>
): UseActionReturn<TInput, TOutput>
```

### Type Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TInput` | `void` | The shape of the input data passed to `execute()` and `executeAsync()`. When `void`, the action accepts no input. |
| `TOutput` | `unknown` | The expected data type on a successful action response. |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | The API route path (e.g., `'/api/todos'`, `'/api/users/123'`). |
| `options` | `UseActionOptions<TInput, TOutput>` | No | Configuration for HTTP method and lifecycle callbacks. |

---

## Options

```ts
interface UseActionOptions<TInput, TOutput> {
  method?: HttpMethod
  headers?: Record<string, string> | (() => Record<string, string>)
  retry?: boolean | number | RetryConfig
  timeout?: number
  dedupe?: 'cancel' | 'defer'
  debounce?: number
  throttle?: number
  onSuccess?: (data: TOutput) => void
  onError?: (error: ActionError) => void
  onSettled?: (result: ActionResult<TOutput>) => void
  onExecute?: (input: TInput) => void
}
```

### `method`

- **Type:** `HttpMethod` (`'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'`)
- **Default:** `'POST'`
- **Description:** The HTTP method used for the fetch request. For `GET` and `HEAD`, the input is sent as query parameters. For all other methods, the input is sent as the JSON request body.

### `headers`

- **Type:** `Record<string, string> | (() => Record<string, string>)`
- **Required:** No
- **Description:** Static headers or a function returning headers to include in the request. Useful for authorization tokens or custom headers.

```ts
const { execute } = useAction('/api/todos', {
  headers: () => ({ Authorization: `Bearer ${token.value}` }),
})
```

### `retry`

- **Type:** `boolean | number | RetryConfig`
- **Required:** No
- **Description:** Retry configuration for failed requests. Pass `true` for 3 retries with default settings, a number for custom retry count, or a `RetryConfig` object for full control.

```ts
interface RetryConfig {
  count?: number      // Default: 3
  delay?: number      // Default: 500ms
  statusCodes?: number[] // Default: [408, 409, 425, 429, 500, 502, 503, 504]
}
```

### `timeout`

- **Type:** `number`
- **Required:** No
- **Description:** Request timeout in milliseconds. If the request takes longer than this, it will be aborted with a timeout error.

```ts
const { execute } = useAction('/api/slow-endpoint', {
  timeout: 5000, // 5 second timeout
})
```

### `dedupe`

- **Type:** `'cancel' | 'defer'`
- **Required:** No
- **Description:** Request deduplication strategy for concurrent calls. `'cancel'` aborts the previous in-flight request. `'defer'` returns the existing in-flight promise without starting a new request.

### `debounce`

- **Type:** `number`
- **Required:** No
- **Description:** Debounce delay in milliseconds. When set, `execute()` calls are delayed — if another call comes in before the delay expires, the timer resets (last-call-wins). Mutually exclusive with `throttle`; if both are set, `debounce` takes priority.

```ts
const { execute } = useAction('/api/search', {
  method: 'GET',
  debounce: 300, // Wait 300ms after last call
})

// In a watcher — only the last call fires
watch(searchQuery, (q) => execute({ q }))
```

### `throttle`

- **Type:** `number`
- **Required:** No
- **Description:** Throttle interval in milliseconds. The first call executes immediately, then subsequent calls are rate-limited. A trailing call is fired if calls arrive during the throttle window. Ignored if `debounce` is also set.

```ts
const { execute } = useAction('/api/track', {
  method: 'POST',
  throttle: 1000, // At most once per second
})
```

### `onExecute`

- **Type:** `(input: TInput) => void`
- **Description:** Called immediately when `execute()` or `executeAsync()` is invoked, before the network request begins. Useful for logging, analytics, or showing immediate UI feedback.

### `onSuccess`

- **Type:** `(data: TOutput) => void`
- **Description:** Called when the server returns `{ success: true, data }`. Receives the typed data.

### `onError`

- **Type:** `(error: ActionError) => void`
- **Description:** Called when the server returns `{ success: false, error }` or when a network fetch error occurs. Receives the `ActionError` object.

### `onSettled`

- **Type:** `(result: ActionResult<TOutput>) => void`
- **Description:** Called after every execution completes, regardless of outcome. Receives the full `ActionResult<TOutput>` (either success or error variant). Called after `onSuccess` or `onError`.

---

## Return Value

```ts
interface UseActionReturn<TInput, TOutput> {
  execute: (input: TInput) => Promise<ActionResult<TOutput>>
  executeAsync: (input: TInput) => Promise<TOutput>
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
- **Description:** Execute the action and return the full result object. Never throws. Callers must inspect `result.success` to determine the outcome.

```ts
const result = await execute({ title: 'Buy milk' })
if (result.success) {
  console.log('Created:', result.data)
} else {
  console.error('Failed:', result.error.message)
}
```

### `executeAsync(input)`

- **Type:** `(input: TInput) => Promise<TOutput>`
- **Description:** Execute the action and return the data directly. Throws `ActionError` on failure. Useful when you prefer try/catch error handling.

```ts
try {
  const todo = await executeAsync({ title: 'Buy milk' })
  console.log('Created:', todo)
} catch (err) {
  // err is ActionError
  console.error(err.code, err.message)
}
```

### `data`

- **Type:** `Ref<TOutput | null>`
- **Description:** Reactive reference to the most recent successful response data. Initialized as `null`. Updated when the server returns `success: true`.

### `error`

- **Type:** `Ref<ActionError | null>`
- **Description:** Reactive reference to the most recent error. Initialized as `null`. Set when the server returns `success: false` or a network error occurs. Cleared to `null` at the start of each new execution.

### `status`

- **Type:** `Ref<ActionStatus>`
- **Description:** Reactive reference to the current execution status. One of:

| Value | Description |
|-------|-------------|
| `'idle'` | Initial state. No execution has started yet, or `reset()` was called. |
| `'executing'` | A request is in progress. |
| `'success'` | The most recent execution succeeded. |
| `'error'` | The most recent execution failed. |

### `isIdle`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` when `status` is `'idle'`.

### `isExecuting`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` when `status` is `'executing'`.

### `hasSucceeded`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` when `status` is `'success'`.

### `hasErrored`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` when `status` is `'error'`.

### `reset()`

- **Type:** `() => void`
- **Description:** Reset all reactive state to initial values: `data` to `null`, `error` to `null`, `status` to `'idle'`. Also aborts any in-flight request.

---

## Execution Lifecycle

1. `execute(input)` or `executeAsync(input)` is called.
2. `onExecute(input)` callback fires.
3. `status` is set to `'executing'`. `error` is cleared to `null`.
4. A fetch request is sent to `path` using the configured `method`.
   - `GET`/`HEAD`: input is sent as query parameters.
   - Other methods: input is sent as the JSON body.
5. The response is parsed as `ActionResult<TOutput>`.
6. **On success** (`result.success === true`):
   - `data` is set to `result.data`.
   - `status` is set to `'success'`.
   - `onSuccess(result.data)` fires.
   - `onSettled(result)` fires.
7. **On error** (`result.success === false`):
   - `error` is set to `result.error`.
   - `status` is set to `'error'`.
   - `onError(result.error)` fires.
   - `onSettled(result)` fires.
8. **On fetch error** (network failure, timeout, etc.):
   - A `FETCH_ERROR` `ActionError` is created with the error message.
   - `error` is set to the constructed error.
   - `status` is set to `'error'`.
   - `onError(actionError)` fires.
   - `onSettled({ success: false, error: actionError })` fires.

---

## Examples

### Basic POST Action

```vue
<script setup lang="ts">
const { execute, data, error, status } = useAction<
  { title: string },
  { id: number; title: string }
>('/api/todos', {
  method: 'POST',
  onSuccess(todo) {
    toast.success(`Created: ${todo.title}`)
  },
  onError(err) {
    toast.error(err.message)
  },
})

async function handleSubmit(title: string) {
  await execute({ title })
}
</script>

<template>
  <form @submit.prevent="handleSubmit('Buy milk')">
    <button :disabled="status === 'executing'">
      {{ status === 'executing' ? 'Creating...' : 'Add Todo' }}
    </button>
    <p v-if="error">{{ error.message }}</p>
    <p v-if="data">Created: {{ data.title }}</p>
  </form>
</template>
```

### GET Action with Query Parameters

```vue
<script setup lang="ts">
const { execute, data, status } = useAction<
  { page: number; limit: number },
  { users: User[]; total: number }
>('/api/users', {
  method: 'GET',
})

// Input is sent as ?page=1&limit=10
await execute({ page: 1, limit: 10 })
</script>
```

### Using executeAsync with Try/Catch

```vue
<script setup lang="ts">
const { executeAsync, status } = useAction<
  { title: string },
  { id: number; title: string }
>('/api/todos', { method: 'POST' })

async function handleSubmit(title: string) {
  try {
    const todo = await executeAsync({ title })
    toast.success(`Created todo #${todo.id}`)
    router.push(`/todos/${todo.id}`)
  } catch (err) {
    // err is ActionError
    if (err.fieldErrors?.title) {
      titleError.value = err.fieldErrors.title[0]
    } else {
      toast.error(err.message)
    }
  }
}
</script>
```

### Handling Field Errors

```vue
<script setup lang="ts">
const formErrors = ref<Record<string, string[]>>({})

const { execute, status } = useAction<
  { email: string; password: string },
  { token: string }
>('/api/auth/register', {
  method: 'POST',
  onError(err) {
    if (err.fieldErrors) {
      formErrors.value = err.fieldErrors
    } else {
      toast.error(err.message)
    }
  },
  onExecute() {
    formErrors.value = {}
  },
})
</script>

<template>
  <form @submit.prevent="execute({ email, password })">
    <div>
      <input v-model="email" type="email" />
      <span v-if="formErrors.email" class="error">
        {{ formErrors.email[0] }}
      </span>
    </div>
    <div>
      <input v-model="password" type="password" />
      <span v-if="formErrors.password" class="error">
        {{ formErrors.password[0] }}
      </span>
    </div>
    <button :disabled="status === 'executing'">Register</button>
  </form>
</template>
```

### DELETE Action

```vue
<script setup lang="ts">
const { execute, status } = useAction<{ id: string }, void>(
  '/api/todos',
  {
    method: 'DELETE',
    onSuccess() {
      toast.success('Deleted')
      refreshTodos()
    },
  },
)
</script>
```

### Resetting State

```vue
<script setup lang="ts">
const { execute, data, error, status, reset } = useAction<
  { title: string },
  Todo
>('/api/todos', { method: 'POST' })

function openNewForm() {
  reset() // Clear previous data, error, and status
}
</script>
```

### All Callbacks

```ts
const { execute } = useAction<CreateTodoInput, Todo>('/api/todos', {
  method: 'POST',
  onExecute(input) {
    console.log('Sending:', input)
    loadingOverlay.show()
  },
  onSuccess(data) {
    console.log('Created:', data)
    todos.value.push(data)
  },
  onError(error) {
    console.error('Failed:', error.code, error.message)
    if (error.fieldErrors) {
      formErrors.value = error.fieldErrors
    }
  },
  onSettled(result) {
    loadingOverlay.hide()
    console.log('Settled:', result.success ? 'success' : 'error')
  },
})
```

---

## Auto-Import

`useAction` is auto-imported in all Vue components and composables when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [useFormAction](/api/use-form-action) -- Form integration with field-level errors and dirty tracking
- [useOptimisticAction](/api/use-optimistic-action) -- Optimistic updates with automatic rollback
- [defineAction](/api/define-action) -- Server-side action definition
- [Cache Invalidation](/api/invalidate-actions) -- Refetch or clear `useActionQuery` caches
- [Types Reference](/api/types) -- `UseActionOptions`, `UseActionReturn`, `ActionResult`, `ActionError`, `ActionStatus`
