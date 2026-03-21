# Infinite Queries

`useInfiniteActionQuery` provides infinite scroll and cursor-based pagination with SSR support. The first page is fetched on the server, and subsequent pages are accumulated on the client.

::: tip Working example
See infinite scroll in the [example repository](https://github.com/billymaulana/nuxt-actions-example).
:::

## Basic Usage

### Server Action

Define a paginated GET action:

```ts
// server/actions/list-todos.get.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    pageParam: z.string().optional(),
    limit: z.number().default(20),
  }),
  handler: async ({ input }) => {
    const todos = await db.todo.findMany({
      take: input.limit + 1,
      cursor: input.pageParam ? { id: input.pageParam } : undefined,
    })

    const hasMore = todos.length > input.limit
    const items = hasMore ? todos.slice(0, -1) : todos

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
    }
  },
})
```

### Client Component

```vue
<script setup lang="ts">
import { listTodos } from '#actions'

const { pages, fetchNextPage, hasNextPage, isFetchingNextPage, pending } =
  useInfiniteActionQuery(listTodos, undefined, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
</script>

<template>
  <div v-if="pending">Loading...</div>
  <template v-else>
    <div v-for="(page, i) in pages" :key="i">
      <div v-for="todo in page.items" :key="todo.id">
        {{ todo.title }}
      </div>
    </div>

    <button
      v-if="hasNextPage"
      :disabled="isFetchingNextPage"
      @click="fetchNextPage()"
    >
      {{ isFetchingNextPage ? 'Loading more...' : 'Load More' }}
    </button>

    <p v-if="!hasNextPage">No more items</p>
  </template>
</template>
```

## How It Works

1. **SSR**: The first page is fetched on the server via `useAsyncData` and hydrated on the client
2. **Pagination**: `getNextPageParam` extracts the cursor/offset for the next request
3. **Accumulation**: Each `fetchNextPage()` appends to the `pages` array
4. **End detection**: When `getNextPageParam` returns `undefined`, `hasNextPage` becomes `false`

## Pagination Strategies

### Cursor-Based

The most common pattern -- use a unique, ordered field (like `id` or `createdAt`):

```ts
const { pages, fetchNextPage } = useInfiniteActionQuery(
  listItems,
  undefined,
  {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  },
)
```

### Offset-Based

Use a numeric offset:

```ts
const { pages, fetchNextPage } = useInfiniteActionQuery(
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

### Page Number

Use a simple page number:

```ts
const { pages, fetchNextPage } = useInfiniteActionQuery(
  listItems,
  undefined,
  {
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined
    },
  },
)
```

## Reactive Input

When the input is reactive, changing it resets all pages and re-fetches from the first page:

```vue
<script setup lang="ts">
import { searchItems } from '#actions'

const query = ref('')

const { pages, fetchNextPage, hasNextPage } = useInfiniteActionQuery(
  searchItems,
  () => ({ q: query.value }),
  {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  },
)
</script>

<template>
  <input v-model="query" placeholder="Search..." />
  <!-- pages reset when query changes -->
</template>
```

## Conditional Fetching

Use the `enabled` option to defer fetching until a condition is met:

```ts
const categoryId = ref<number | null>(null)
const isReady = computed(() => categoryId.value !== null)

const { pages } = useInfiniteActionQuery(
  listByCategory,
  () => ({ categoryId: categoryId.value! }),
  {
    enabled: isReady,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  },
)
```

## Infinite Scroll with Intersection Observer

Combine with `IntersectionObserver` for automatic loading:

```vue
<script setup lang="ts">
import { listTodos } from '#actions'

const { pages, fetchNextPage, hasNextPage, isFetchingNextPage } =
  useInfiniteActionQuery(listTodos, undefined, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

const sentinel = ref<HTMLElement | null>(null)

onMounted(() => {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasNextPage.value && !isFetchingNextPage.value) {
      fetchNextPage()
    }
  })

  if (sentinel.value) {
    observer.observe(sentinel.value)
  }

  onUnmounted(() => observer.disconnect())
})
</script>

<template>
  <div v-for="(page, i) in pages" :key="i">
    <div v-for="item in page.items" :key="item.id">{{ item.title }}</div>
  </div>
  <div ref="sentinel" />
  <p v-if="isFetchingNextPage">Loading more...</p>
</template>
```

## Next Steps

- [useInfiniteActionQuery API](/api/use-infinite-action-query) -- Full API reference
- [SSR Queries](/guide/action-queries) -- Single-page queries with `useActionQuery`
