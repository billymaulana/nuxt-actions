---
title: Polling & Auto-Refetch
description: Four useActionQuery options side by side, polling with refetchInterval, refetchOnFocus, an enabled ref that gates fetching, and transform.
---

# Polling & Auto-Refetch

Each section of this page is one `useActionQuery` with a single option turned on, so you can see what each option does on its own: polling the server clock, refreshing when the tab becomes visible again, holding a query until a ref turns true, and reshaping the response before it reaches the template.

<ExampleSource page="pages/polling.vue" />

## Server actions

::: code-group

```ts [server/actions/current-time.get.ts]
export default defineAction({
  handler: () => ({
    time: new Date().toISOString(),
    timestamp: Date.now(),
  }),
})
```

```ts [server/actions/list-todos.get.ts]
export default defineAction({
  handler: async () => {
    return {
      items: [
        { id: 1, title: 'Learn Nuxt', done: true },
        { id: 2, title: 'Build app', done: false },
      ],
    }
  },
})
```

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

:::

## Page

```vue [pages/polling.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { currentTime, listTodos, searchTodos } from '#actions'

const { data: timeData, pending: timePending } = useActionQuery(
  currentTime,
  undefined,
  { refetchInterval: 2000 },
)

const { data: focusData, pending: focusPending } = useActionQuery(
  listTodos,
  undefined,
  { refetchOnFocus: true },
)

const fetchEnabled = ref(false)
const { data: enabledData, pending: enabledPending } = useActionQuery(
  listTodos,
  undefined,
  { enabled: fetchEnabled },
)

const { data: transformData, pending: transformPending } = useActionQuery(
  searchTodos,
  () => ({ q: '' }),
  {
    transform: (result: {
      items: Array<{ id: number, title: string, done: boolean }>
      total: number
    }) =>
      [...result.items].reverse().map((item, i) => ({
        ...item,
        index: i + 1,
      })),
  },
)
</script>

<template>
  <div>
    <section>
      <h3>refetchInterval (auto-refresh every 2s)</h3>
      <div v-if="timePending">
        Loading...
      </div>
      <div v-else-if="timeData">
        <p>Server time: <strong>{{ timeData.time }}</strong></p>
        <p>Timestamp: {{ timeData.timestamp }}</p>
      </div>
    </section>

    <section>
      <h3>refetchOnFocus</h3>
      <div v-if="focusPending">
        Loading...
      </div>
      <div v-else-if="focusData">
        <p>
          {{ focusData.items.length }} todo(s) loaded —
          last refreshed when tab gained focus
        </p>
        <div v-for="item in focusData.items" :key="item.id">
          <span :style="{ textDecoration: item.done ? 'line-through' : 'none' }">
            {{ item.title }}
          </span>
          <span class="badge">{{ item.done ? 'Done' : 'Pending' }}</span>
        </div>
      </div>
    </section>

    <section>
      <h3>enabled (toggle fetching)</h3>
      <button @click="fetchEnabled = !fetchEnabled">
        {{ fetchEnabled ? 'Disable fetching' : 'Enable fetching' }}
      </button>
      <span>enabled: <strong>{{ fetchEnabled }}</strong></span>
      <div v-if="enabledPending">
        Loading...
      </div>
      <div v-else-if="enabledData" class="success">
        Fetched {{ enabledData.items.length }} todo(s)
      </div>
      <div v-else>
        Fetching disabled — no data loaded
      </div>
    </section>

    <section>
      <h3>transform</h3>
      <div v-if="transformPending">
        Loading...
      </div>
      <div v-else-if="transformData">
        <div v-for="item in transformData" :key="item.id">
          <span>#{{ item.index }}</span>
          <span :style="{ textDecoration: item.done ? 'line-through' : 'none' }">
            {{ item.title }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- `refetchInterval: 2000` runs the `currentTime` query again every two seconds, so the server time keeps moving.
- `refetchOnFocus: true` refetches the todo list when the browser tab becomes visible again. It listens to `visibilitychange` and does nothing during SSR.
- `enabled` takes a ref. While `fetchEnabled` is false the query does not run and `enabledData` stays empty; the button flips the ref and starts the fetch.
- `transform` runs on each response before it is stored, so `transformData` is the reversed, numbered array instead of `{ items, total }`.
- `undefined` as the second argument means the action takes no input.

## Related

- Guide: [SSR Queries](/guide/action-queries)
- API: [useActionQuery](/api/use-action-query)
