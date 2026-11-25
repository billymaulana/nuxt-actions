---
title: Smart Cache Invalidation
description: Two queries share a tasks tag, and useActionMutation invalidates it after each add, toggle, or delete, so the list and the stats refetch together.
---

# Smart Cache Invalidation

After a write, every query that shows the changed data is stale. Here a task list and a stats panel both register the `tasks` tag, and each of the three mutations declares `invalidates: ['tasks']`. A successful add, toggle, or delete refetches both queries, without a single manual refresh call in the page.

<ExampleSource page="pages/mutations.vue" />

## Server actions

The five actions share an in-memory store in `server/utils/task-store.ts`.

::: code-group

```ts [server/actions/list-tasks.get.ts]
import { taskStore } from '../utils/task-store'

export default defineAction({
  handler: async () => {
    return { items: taskStore.list() }
  },
})
```

```ts [server/actions/task-stats.get.ts]
import { taskStore } from '../utils/task-store'

export default defineAction({
  handler: async () => {
    return taskStore.stats()
  },
})
```

```ts [server/actions/add-task.post.ts]
import { z } from 'zod'
import { taskStore } from '../utils/task-store'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    return taskStore.add(input.title)
  },
})
```

```ts [server/actions/toggle-task.post.ts]
import { z } from 'zod'
import { taskStore } from '../utils/task-store'

export default defineAction({
  input: z.object({
    id: z.number(),
  }),
  handler: async ({ input }) => {
    const task = taskStore.toggle(input.id)
    if (!task) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: `Task ${input.id} not found`,
        statusCode: 404,
      })
    }
    return task
  },
})
```

```ts [server/actions/delete-task.post.ts]
import { z } from 'zod'
import { taskStore } from '../utils/task-store'

export default defineAction({
  input: z.object({
    id: z.number(),
  }),
  handler: async ({ input }) => {
    const removed = taskStore.remove(input.id)
    if (!removed) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: `Task ${input.id} not found`,
        statusCode: 404,
      })
    }
    return { id: input.id, removed: true }
  },
})
```

```ts [server/utils/task-store.ts]
export interface Task {
  id: number
  title: string
  done: boolean
}

const tasks: Task[] = [
  { id: 1, title: 'Ship nuxt-actions v1.2.0', done: true },
  { id: 2, title: 'Write real-world demos', done: false },
  { id: 3, title: 'Update the documentation', done: false },
]
let nextId = 4

export const taskStore = {
  list(): Task[] {
    return tasks.map(task => ({ ...task }))
  },
  stats(): { total: number, done: number, pending: number } {
    const done = tasks.filter(task => task.done).length
    return { total: tasks.length, done, pending: tasks.length - done }
  },
  add(title: string): Task {
    const task: Task = { id: nextId++, title, done: false }
    tasks.push(task)
    return { ...task }
  },
  toggle(id: number): Task | null {
    const task = tasks.find(item => item.id === id)
    if (!task) return null
    task.done = !task.done
    return { ...task }
  },
  remove(id: number): boolean {
    const index = tasks.findIndex(item => item.id === id)
    if (index === -1) return false
    tasks.splice(index, 1)
    return true
  },
}
```

:::

## Page

```vue [pages/mutations.vue]
<script setup lang="ts">
import { ref, computed } from 'vue'
import { listTasks, taskStats, addTask, toggleTask, deleteTask } from '#actions'

const { data: listData, status: listStatus } = useActionQuery(
  listTasks,
  undefined,
  { tags: ['tasks'] },
)
const { data: stats, status: statsStatus } = useActionQuery(
  taskStats,
  undefined,
  { tags: ['tasks'] },
)

const tasks = computed(() => listData.value?.items ?? [])

const newTitle = ref('')

const addMutation = useActionMutation(addTask, { invalidates: ['tasks'] })
const toggleMutation = useActionMutation(toggleTask, { invalidates: ['tasks'] })
const deleteMutation = useActionMutation(deleteTask, { invalidates: ['tasks'] })

async function handleAdd() {
  if (!newTitle.value) return
  const result = await addMutation.execute({ title: newTitle.value })
  if (result.success) newTitle.value = ''
}

async function handleToggle(id: number) {
  await toggleMutation.execute({ id })
}

async function handleDelete(id: number) {
  await deleteMutation.execute({ id })
}
</script>

<template>
  <div>
    <section>
      <span class="badge">Total: {{ stats?.total ?? 0 }}</span>
      <span class="badge">Done: {{ stats?.done ?? 0 }}</span>
      <span class="badge">Pending: {{ stats?.pending ?? 0 }}</span>
      <span v-if="statsStatus === 'pending'">refetching…</span>
    </section>

    <section>
      <form @submit.prevent="handleAdd">
        <input v-model="newTitle" type="text" placeholder="What needs doing?">
        <button type="submit" :disabled="addMutation.isExecuting.value">
          {{ addMutation.isExecuting.value ? 'Adding…' : 'Add' }}
        </button>
      </form>
      <div v-if="addMutation.error.value" class="error">
        {{ addMutation.error.value.message }}
      </div>
    </section>

    <section>
      <h3>
        Tasks
        <span v-if="listStatus === 'pending'">refetching…</span>
      </h3>
      <div v-for="task in tasks" :key="task.id">
        <input type="checkbox" :checked="task.done" @change="handleToggle(task.id)">
        <span :style="{ textDecoration: task.done ? 'line-through' : 'none' }">
          {{ task.title }}
        </span>
        <button @click="handleDelete(task.id)">
          Delete
        </button>
      </div>
      <p v-if="tasks.length === 0">
        No tasks — add one above.
      </p>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- Both `useActionQuery` calls pass `tags: ['tasks']`, which puts them in the same cache group.
- Each `useActionMutation` lists `invalidates: ['tasks']`. When a mutation succeeds, every query under that tag refetches, so the list and the counters update together.
- A failed mutation invalidates nothing. Toggling or deleting an id that no longer exists throws `NOT_FOUND` with status 404, and the queries keep their data.
- Each query's `status` is `'pending'` while it refetches, which shows the small "refetching" label.
- The store is a module-level array, so tasks survive between requests until the server restarts.

## Related

- Guide: [Cache Invalidation](/guide/cache-invalidation)
- API: [useActionMutation](/api/use-action-mutation), [useActionQuery](/api/use-action-query), [Cache Invalidation](/api/invalidate-actions)
