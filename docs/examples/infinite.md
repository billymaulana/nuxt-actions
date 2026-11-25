---
title: Infinite Scroll
description: Load 20 todos five at a time with useInfiniteActionQuery, using a page number param, getNextPageParam, hasNextPage, and refresh to start over.
---

# Infinite Scroll

`useInfiniteActionQuery` keeps every fetched page in `pages` and asks you for the parameter of the next one. This example walks a list of 20 todos five at a time with a page number, and the same shape works with a cursor. The first page is rendered on the server.

<ExampleSource page="pages/infinite.vue" />

## Server action

```ts [server/actions/paginated-todos.get.ts]
import { z } from 'zod'

const allTodos = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: `Todo item #${i + 1}`,
  done: i % 3 === 0,
}))

export default defineAction({
  input: z.object({
    pageParam: z.coerce.number().optional().default(1),
    limit: z.coerce.number().optional().default(5),
  }),
  handler: async ({ input }) => {
    const { pageParam: page, limit } = input
    const start = (page - 1) * limit
    const end = start + limit
    const items = allTodos.slice(start, end)
    const hasMore = end < allTodos.length

    return {
      items,
      nextPage: hasMore ? page + 1 : null,
    }
  },
})
```

## Page

```vue [pages/infinite.vue]
<script setup lang="ts">
import { paginatedTodos } from '#actions'

interface PageData {
  items: Array<{ id: number, title: string, done: boolean }>
  nextPage: number | null
}

const {
  pages,
  pending,
  error,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refresh,
} = useInfiniteActionQuery(
  paginatedTodos,
  undefined,
  {
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage as PageData).nextPage ?? undefined,
  },
)
</script>

<template>
  <div>
    <section>
      <div v-if="pending && pages.length === 0">
        Loading first page...
      </div>

      <div v-else>
        <p>{{ pages.length }} page(s) loaded</p>

        <div v-for="(page, pageIndex) in pages" :key="pageIndex">
          <div>Page {{ pageIndex + 1 }}</div>
          <div v-for="item in (page as PageData).items" :key="item.id">
            <span>#{{ item.id }}</span>
            <span :style="{ textDecoration: item.done ? 'line-through' : 'none' }">
              {{ item.title }}
            </span>
            <span class="badge">{{ item.done ? 'Done' : 'Pending' }}</span>
          </div>
        </div>
      </div>
    </section>

    <section>
      <button v-if="hasNextPage" :disabled="isFetchingNextPage" @click="fetchNextPage">
        {{ isFetchingNextPage ? 'Loading...' : 'Load More' }}
      </button>
      <span v-else>
        All items loaded
      </span>
      <button @click="refresh">
        Reset
      </button>
    </section>

    <section v-if="error">
      <div class="error">
        {{ error.message }}
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- `initialPageParam: 1` is merged into the input as `pageParam`, which is the field the action's schema reads.
- `getNextPageParam` returns `nextPage` from the last page, or `undefined` when the server sends `null`. That value drives `hasNextPage`.
- `fetchNextPage()` requests the next page and appends it to `pages`, and `isFetchingNextPage` is true while it runs.
- `refresh()` clears every page and fetches from the first one again, which is what the Reset button does.
- The schema uses `z.coerce.number()` because the action is a `GET` route and its input arrives as query string values.

## Related

- Guide: [Infinite Queries](/guide/infinite-queries)
- API: [useInfiniteActionQuery](/api/use-infinite-action-query)
