---
title: Optimistic Updates
description: Toggle todos with useOptimisticAction, so the list changes the moment you click and then reconciles with the server, or rolls back if the call fails.
---

# Optimistic Updates

`useOptimisticAction` applies your `updateFn` to a copy of the data as soon as `execute()` is called, renders that copy through `optimisticData`, and then reconciles with the server. The toggle action waits 500 ms before it answers, which makes the gap between the instant UI change and the server response easy to see.

Use it for small writes that almost always succeed, such as checkboxes, likes, and reordering.

<ExampleSource page="pages/optimistic.vue" />

## Server action

```ts [server/actions/toggle-todo.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    id: z.number(),
    done: z.boolean(),
  }),
  handler: async ({ input }) => {
    await new Promise(r => setTimeout(r, 500))

    return {
      id: input.id,
      done: input.done,
      updatedAt: new Date().toISOString(),
    }
  },
})
```

## Page

```vue [pages/optimistic.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { toggleTodo } from '#actions'

const todos = ref([
  { id: 1, title: 'Learn Nuxt', done: true },
  { id: 2, title: 'Build server actions', done: false },
  { id: 3, title: 'Add optimistic updates', done: false },
  { id: 4, title: 'Ship to production', done: false },
])

const optimisticAction = useOptimisticAction(toggleTodo, {
  currentData: todos,
  updateFn(input: { id: number, done: boolean }, current: typeof todos.value) {
    return current.map(t =>
      t.id === input.id ? { ...t, done: input.done } : t,
    )
  },
  reconcile(confirmed, current) {
    return current.map(t =>
      t.id === confirmed.id ? { ...t, done: confirmed.done } : t,
    )
  },
  onSuccess(data) {
    const index = todos.value.findIndex(t => t.id === data.id)
    if (index !== -1) {
      todos.value[index] = { ...todos.value[index], done: data.done }
    }
  },
})

function handleToggle(todo: { id: number, done: boolean }) {
  optimisticAction.execute({ id: todo.id, done: !todo.done })
}
</script>

<template>
  <div>
    <section>
      <div
        v-for="todo in optimisticAction.optimisticData.value"
        :key="todo.id"
      >
        <button :disabled="optimisticAction.isExecuting.value" @click="handleToggle(todo)">
          {{ todo.done ? '&#10003;' : '&nbsp;&nbsp;' }}
        </button>
        <span :style="{ textDecoration: todo.done ? 'line-through' : 'none' }">
          {{ todo.title }}
        </span>
        <span class="badge">{{ todo.done ? 'Done' : 'Pending' }}</span>
      </div>
    </section>

    <section v-if="optimisticAction.isExecuting.value">
      <p>Syncing with server...</p>
    </section>

    <section v-if="optimisticAction.error.value" class="error">
      {{ optimisticAction.error.value.message }}
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- `currentData: todos` is the source of truth. `optimisticData` starts as a copy of it, and the list renders `optimisticData`.
- On click, `updateFn` flips `done` in `optimisticData` right away, before the request leaves the browser.
- The action answers after 500 ms with the one todo it changed, not the whole list. `reconcile` merges that todo into `optimisticData`; without it, the list would be replaced by the single todo.
- `onSuccess` writes the confirmed state back into `todos`. `optimisticData` follows `todos` while no call is running, so the source matches what the user already sees.
- If the request fails, `optimisticData` is restored from the snapshot taken before the update and `error` holds the reason.
- The buttons are disabled while a request is in flight, so only one toggle is pending at a time.

## Related

- Guide: [Optimistic Updates](/guide/optimistic-updates)
- API: [useOptimisticAction](/api/use-optimistic-action)
