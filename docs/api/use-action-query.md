# useActionQuery()

SSR-capable query composable that wraps Nuxt's `useAsyncData` with automatic `ActionResult` unwrapping, reactive cache keys, and deterministic deduplication.

## Type Signature

```ts
// Overload 1: Typed reference (E2E inference)
function useActionQuery<T extends TypedActionReference>(
  action: T,
  input?: MaybeRefOrGetter<InferActionInput<T>>,
  options?: UseActionQueryOptions,
): UseActionQueryReturn<InferActionOutput<T>>

// Overload 2: String path (manual generics)
function useActionQuery<TInput = void, TOutput = unknown>(
  path: string,
  input?: MaybeRefOrGetter<TInput>,
  options?: UseActionQueryOptions,
): UseActionQueryReturn<TOutput>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `TypedActionReference \| string` | Typed action reference from `#actions` or a manual API path |
| `input` | `MaybeRefOrGetter<T>` | Reactive input. When provided, changes trigger automatic refetch. |
| `options` | `UseActionQueryOptions` | Nuxt async data configuration |

---

## Options

```ts
interface UseActionQueryOptions {
  /** Run on SSR. Default: true */
  server?: boolean
  /** Don't block navigation. Default: false */
  lazy?: boolean
  /** Execute immediately. Default: true */
  immediate?: boolean
  /** Default value factory when data is null */
  default?: () => unknown
}
```

### `server`

- **Default:** `true`
- **Description:** When `true`, the query runs during SSR and hydrates on the client. Set to `false` for client-only queries.

### `lazy`

- **Default:** `false`
- **Description:** When `true`, navigation is not blocked while the query loads. Useful for non-critical data.

### `immediate`

- **Default:** `true`
- **Description:** When `true`, the query executes immediately. Set to `false` to defer execution until `refresh()` is called.

### `default`

- **Type:** `() => unknown`
- **Description:** Factory function returning the default value when data is `null` (before first fetch or on error).

---

## Return Value

```ts
interface UseActionQueryReturn<TOutput> {
  data: ComputedRef<TOutput | null>
  error: ComputedRef<ActionError | null>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
  pending: Ref<boolean>
  refresh: () => Promise<void>
  clear: () => void
}
```

### `data`

- **Type:** `ComputedRef<TOutput | null>`
- **Description:** Unwrapped data from the server's `ActionResult`. When the result is `{ success: true, data }`, returns `data`. When the result is a failure or not yet loaded, returns the `default()` value or `null`.

### `error`

- **Type:** `ComputedRef<ActionError | null>`
- **Description:** Error extracted from a failed `ActionResult`. Returns `null` when the last result was successful or data hasn't loaded yet.

### `status`

- **Type:** `Ref<'idle' | 'pending' | 'success' | 'error'>`
- **Description:** Status from Nuxt's `useAsyncData`. Note: this reflects the fetch status, not the `ActionResult` outcome.

### `pending`

- **Type:** `Ref<boolean>`
- **Description:** `true` while a fetch is in flight.

### `refresh`

- **Type:** `() => Promise<void>`
- **Description:** Manually re-fetch data. Useful for refresh buttons or after mutations.

### `clear`

- **Type:** `() => void`
- **Description:** Clear cached data and reset state.

---

## Cache Keys & Reactivity

Cache keys are generated using the action path and the initial input value, producing a deterministic string passed to `useAsyncData`. When the reactive `input` changes, the `watch` option triggers an automatic refetch.

- Different inputs at initialization produce different cache entries
- Same inputs (even with different key order) share the same cache
- Reactive input changes trigger refetch via `useAsyncData`'s `watch` mechanism

```ts
const query = ref('hello')
const { data } = useActionQuery(searchTodos, () => ({ q: query.value }))

// Initial cache key: "action:/api/_actions/search-todos:{"q":"hello"}"
query.value = 'world'
// → watch triggers automatic refetch with new input
```

### Deterministic Serialization

Keys use `stableStringify()` — a deterministic JSON serializer that sorts object keys recursively. This means `{ b: 2, a: 1 }` and `{ a: 1, b: 2 }` produce the same cache key, preventing unnecessary refetches.

### Nuxt Compatibility

Cache keys are passed as strings (not getter functions) to ensure compatibility with Nuxt 3.7+. Getter keys for `useAsyncData` are only supported in Nuxt 3.14+.

---

## HTTP Method Routing

`useActionQuery` automatically routes input to the correct location based on the action's HTTP method:

| Method | Input Location | Use Case |
|--------|---------------|----------|
| `GET`, `HEAD`, `DELETE` | Query parameters | List, search, delete |
| `POST`, `PUT`, `PATCH` | Request body | Create, update (when using query-style composable) |

This is determined by the typed reference's `__actionMethod` or defaults to `GET` for string paths.

---

## Examples

### Basic List Query

```vue
<script setup lang="ts">
import { listTodos } from '#actions'

const { data: todos, pending } = useActionQuery(listTodos)
</script>

<template>
  <div v-if="pending">Loading...</div>
  <ul v-else>
    <li v-for="todo in todos" :key="todo.id">{{ todo.title }}</li>
  </ul>
</template>
```

### Reactive Search

```vue
<script setup lang="ts">
import { searchTodos } from '#actions'

const query = ref('')
const { data: results, pending } = useActionQuery(
  searchTodos,
  () => ({ q: query.value }),
)
</script>

<template>
  <input v-model="query" placeholder="Search..." />
  <div v-if="pending">Searching...</div>
  <div v-for="item in results" :key="item.id">{{ item.title }}</div>
</template>
```

### With Default Value

```ts
const { data } = useActionQuery(listTodos, undefined, {
  default: () => [],
})

// data.value is [] instead of null before first fetch
```

### Lazy Loading (Non-Blocking)

```ts
const { data, pending, refresh } = useActionQuery(analytics, undefined, {
  lazy: true,  // Don't block navigation
  server: false, // Client-only
})
```

### Manual Refresh After Mutation

```ts
const { data: todos, refresh } = useActionQuery(listTodos)
const { execute: createTodo } = useAction(createTodoAction)

async function addTodo(title: string) {
  await createTodo({ title })
  await refresh() // Re-fetch the list
}
```

### POST-Method Query

When the action is defined with `.post.ts`, input goes to the request body:

```ts
import { generateReport } from '#actions'

// generateReport uses POST — input is sent as body
const { data } = useActionQuery(generateReport, () => ({ type: 'monthly' }))
```

### String Path

```ts
const { data } = useActionQuery<void, User[]>('/api/users')
```

---

## Auto-Import

`useActionQuery` is auto-imported in all Vue components when the module is installed.

## See Also

- [useAction](/api/use-action) -- Mutation-style action composable
- [defineAction](/api/define-action) -- Server action definition
- [Types Reference](/api/types) -- Full type definitions
