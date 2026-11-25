---
title: Batch Execution
description: Call three different actions with one execute() through useActions, then render each result or error on its own while one pending flag drives the button.
---

# Batch Execution

`useActions` takes a list of action references and runs them with a single `execute()` call. This page fires `createTodo`, `listTodos`, and `searchTodos` together and renders each result separately. By default the calls run in parallel through `Promise.allSettled`, so one failure does not hide the others. Pass `{ mode: 'sequential' }` as the second argument when the calls must run in order.

Use it for screens that need several independent reads or writes at the same moment.

<ExampleSource page="pages/batch.vue" />

## Server actions

::: code-group

```ts [server/actions/create-todo.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return {
      id: Date.now(),
      title: input.title,
      done: false,
    }
  },
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

```vue [pages/batch.vue]
<script setup lang="ts">
import { createTodo, listTodos, searchTodos } from '#actions'

const actionLabels = ['createTodo', 'listTodos', 'searchTodos']

const { execute, pending, results, hasErrors } = useActions([
  createTodo,
  listTodos,
  searchTodos,
])

async function handleBatch() {
  await execute([
    { title: 'New batch todo' },
    {},
    { q: 'Learn' },
  ])
}
</script>

<template>
  <div>
    <section>
      <button :disabled="pending" @click="handleBatch">
        {{ pending ? 'Executing...' : 'Run Batch' }}
      </button>

      <div v-if="hasErrors" class="error">
        Some actions failed.
      </div>
    </section>

    <section v-if="results.some(r => r !== null)">
      <div v-for="(result, i) in results" :key="i">
        <div>Action {{ i + 1 }}: {{ actionLabels[i] }}</div>
        <div v-if="result === null">
          Not executed yet
        </div>
        <div v-else-if="result.success" class="success">
          <pre>{{ JSON.stringify(result.data, null, 2) }}</pre>
        </div>
        <div v-else class="error">
          {{ result.error.message }}
        </div>
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- The inputs passed to `execute()` match the action list by position: the first object goes to `createTodo`, the empty object to `listTodos`, and `{ q: 'Learn' }` to `searchTodos`.
- `results` holds one `ActionResult` per action, or `null` before the first run, so each row can render success or failure on its own.
- `hasErrors` is true when any result in the batch failed.
- `pending` covers the whole batch and keeps the button disabled until every call has settled.

## Related

- Guide: [Batch Actions](/guide/batch-actions)
- API: [useActions](/api/use-actions)
