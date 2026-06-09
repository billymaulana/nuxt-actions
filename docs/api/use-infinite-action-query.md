# useInfiniteActionQuery()

Composable for infinite scroll and cursor-based pagination with SSR support. Fetches the first page on the server via `useAsyncData`, then accumulates pages on the client.

## Type Signature

```ts
// Overload 1: Typed reference (E2E inference)
function useInfiniteActionQuery<T extends TypedActionReference>(
  action: T,
  input?: MaybeRefOrGetter<InferActionInput<T>>,
  options?: UseInfiniteActionQueryOptions<InferActionOutput<T>>,
): UseInfiniteActionQueryReturn<InferActionOutput<T>>

// Overload 2: String path (manual generics)
function useInfiniteActionQuery<TInput = void, TOutput = unknown>(
  path: string,
  input?: MaybeRefOrGetter<TInput>,
  options?: UseInfiniteActionQueryOptions<TOutput>,
): UseInfiniteActionQueryReturn<TOutput>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `TypedActionReference \| string` | Typed action reference from `#actions` or a manual API path |
| `input` | `MaybeRefOrGetter<T>` | Reactive input. Changes trigger a full refresh. |
| `options` | `UseInfiniteActionQueryOptions` | Pagination and fetch configuration |

---

## Options

```ts
interface UseInfiniteActionQueryOptions<TOutput = unknown> {
  server?: boolean
  lazy?: boolean
  enabled?: boolean | Ref<boolean> | ComputedRef<boolean>
  getNextPageParam: (lastPage: TOutput, allPages: TOutput[]) => unknown | undefined
  initialPageParam?: unknown
  transform?: (data: TOutput) => TOutput
}
```

### `getNextPageParam` (required)

- **Type:** `(lastPage: TOutput, allPages: TOutput[]) => unknown | undefined`
- **Description:** Extract the next page parameter from the last fetched page. Return `undefined` to signal there are no more pages. This drives the `hasNextPage` computed ref.

### `initialPageParam`

- **Type:** `unknown`
- **Default:** `undefined`
- **Description:** The page parameter for the first request. When provided, it is merged into the input as `pageParam`.

### `server`

- **Type:** `boolean`
- **Default:** `true`
- **Description:** Fetch the first page on the server during SSR.

### `lazy`

- **Type:** `boolean`
- **Default:** `false`
- **Description:** Don't block navigation while loading.

### `enabled`

- **Type:** `boolean | Ref<boolean> | ComputedRef<boolean>`
- **Default:** `true`
- **Description:** Conditionally enable/disable fetching. Supports reactive refs.

### `transform`

- **Type:** `(data: TOutput) => TOutput`
- **Description:** Transform each page's data before storing.

---

## Return Value

```ts
interface UseInfiniteActionQueryReturn<TOutput> {
  pages: Readonly<Ref<TOutput[]>>
  data: ComputedRef<TOutput | null>
  error: Readonly<Ref<ActionError | null>>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
  pending: Ref<boolean>
  isFetchingNextPage: Readonly<Ref<boolean>>
  hasNextPage: ComputedRef<boolean>
  fetchNextPage: () => Promise<void>
  refresh: () => Promise<void>
  clear: () => void
}
```

### `pages`

- **Type:** `Readonly<Ref<TOutput[]>>`
- **Description:** All fetched pages accumulated in order. The first page is SSR-hydrated.

### `data`

- **Type:** `ComputedRef<TOutput | null>`
- **Description:** The last page in the `pages` array. Convenient for accessing the most recent data.

### `isFetchingNextPage`

- **Type:** `Readonly<Ref<boolean>>`
- **Description:** `true` while a subsequent page is being fetched (not the initial page).

### `hasNextPage`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` when `getNextPageParam` returned a value (not `undefined`).

### `fetchNextPage`

- **Type:** `() => Promise<void>`
- **Description:** Fetch the next page using the param from `getNextPageParam`. No-op if `hasNextPage` is `false` or a fetch is already in flight.

### `refresh`

- **Type:** `() => Promise<void>`
- **Description:** Clear all pages and re-fetch from the first page.

### `clear`

- **Type:** `() => void`
- **Description:** Clear all pages and reset state.

---

## Examples

### Basic Infinite Scroll

```vue
<script setup lang="ts">
import { listTodos } from '#actions'

const { pages, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteActionQuery(
  listTodos,
  undefined,
  {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  },
)
</script>

<template>
  <div v-for="(page, i) in pages" :key="i">
    <div v-for="todo in page.items" :key="todo.id">{{ todo.title }}</div>
  </div>
  <button
    v-if="hasNextPage"
    :disabled="isFetchingNextPage"
    @click="fetchNextPage()"
  >
    {{ isFetchingNextPage ? 'Loading...' : 'Load More' }}
  </button>
</template>
```

### With Reactive Search

```ts
import { searchItems } from '#actions'

const query = ref('nuxt')
const { pages, fetchNextPage, refresh } = useInfiniteActionQuery(
  searchItems,
  () => ({ q: query.value }),
  {
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  },
)

// When query changes, pages are reset and re-fetched automatically
```

### Offset-Based Pagination

```ts
const { pages, fetchNextPage, hasNextPage } = useInfiniteActionQuery(
  listItems,
  undefined,
  {
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, p) => sum + p.items.length, 0)
      return totalFetched < lastPage.total ? totalFetched : undefined
    },
  },
)
```

---

## Auto-Import

`useInfiniteActionQuery` is auto-imported in all Vue components when the module is installed.

## See Also

- [useActionQuery](/api/use-action-query) -- Single-page SSR queries
- [Infinite Queries Guide](/guide/infinite-queries) -- Usage guide
- [Types Reference](/api/types) -- Full type definitions
