---
title: SSR Queries
description: Search todos with useActionQuery, which renders on the server and refetches whenever its input changes, plus a debounced useAction search.
---

# SSR Queries

`useActionQuery` runs the action during server-side rendering, hydrates the result on the client, and refetches whenever its reactive input changes. Here the input is a getter that reads the search box, so typing filters the list without a watcher. A second search uses `useAction` with `debounce`, for cases where you decide when the call happens.

<ExampleSource page="pages/queries.vue" />

## Server action

```ts [server/actions/search-todos.get.ts]
import { z } from 'zod'

const allTodos = [
  { id: 1, title: 'Learn Nuxt', done: true },
  { id: 2, title: 'Build app', done: false },
  { id: 3, title: 'Write tests', done: false },
  { id: 4, title: 'Deploy to production', done: false },
  { id: 5, title: 'Set up CI/CD', done: true },
]

export default defineAction({
  input: z.object({
    q: z.string().optional().default(''),
  }),
  handler: async ({ input }) => {
    const q = input.q.toLowerCase()
    const items = q
      ? allTodos.filter(t => t.title.toLowerCase().includes(q))
      : allTodos

    return { items, total: items.length }
  },
})
```

## Page

```vue [pages/queries.vue]
<script setup lang="ts">
import { ref, watch } from 'vue'
import { searchTodos } from '#actions'

const search = ref('')

const { data, pending, error, refresh } = useActionQuery(
  searchTodos,
  () => ({ q: search.value }),
)

const debouncedQuery = ref('')
const {
  execute: debouncedSearch,
  data: debouncedResult,
  isExecuting: debouncedSearching,
} = useAction(searchTodos, { debounce: 300 })

watch(debouncedQuery, (q) => {
  if (q) debouncedSearch({ q })
})
</script>

<template>
  <div>
    <section>
      <input v-model="search" type="text" placeholder="Search todos...">
    </section>

    <section>
      <div v-if="pending">
        Loading...
      </div>
      <div v-else-if="error" class="error">
        {{ error.message }}
      </div>
      <div v-else-if="data">
        <p>{{ data.total }} result{{ data.total !== 1 ? 's' : '' }}</p>
        <div v-for="item in data.items" :key="item.id">
          <span :style="{ textDecoration: item.done ? 'line-through' : 'none' }">
            {{ item.title }}
          </span>
          <span class="badge">{{ item.done ? 'Done' : 'Pending' }}</span>
        </div>
        <div v-if="data.items.length === 0">
          No todos match "{{ search }}"
        </div>
      </div>
    </section>

    <section>
      <button @click="refresh">
        Refresh
      </button>
    </section>

    <section>
      <input v-model="debouncedQuery" type="text" placeholder="Debounced search (300ms)...">
      <span v-if="debouncedSearching">searching...</span>
      <pre v-if="debouncedResult">{{ JSON.stringify(debouncedResult, null, 2) }}</pre>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- The second argument to `useActionQuery` is a getter, so the query runs again whenever `search` changes.
- The first request runs during server-side rendering, so the HTML arrives with the list already filled in.
- `useActionQuery` wraps Nuxt's `useAsyncData`, which is where `pending`, `error`, and `refresh` come from. The Refresh button calls `refresh()` to run the query again by hand.
- The debounced `useAction` waits until 300 ms have passed since the last keystroke before it sends a request, and the watcher skips empty input.
- The action is a `GET` route, so `q` travels in the query string. `.default('')` in the schema makes the parameter optional.

## Related

- Guide: [SSR Queries](/guide/action-queries), [useAction](/guide/use-action)
- API: [useActionQuery](/api/use-action-query), [useAction](/api/use-action)
