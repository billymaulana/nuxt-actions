# E2E Type Inference

::: tip New in v0.3.0
End-to-end type inference eliminates manual generics. Define your action once on the server, and the client automatically knows the input and output types.
:::

## Overview

Instead of writing:

```ts
// Manual generics — tedious and error-prone
const { execute, data } = useAction<{ title: string }, { id: number; title: string }>('/api/todos', {
  method: 'POST',
})
```

You can now write:

```ts
import { createTodo } from '#actions'

// Types fully auto-inferred!
const { execute, data } = useAction(createTodo, {
  onSuccess(data) {
    // data: { id: number; title: string } — inferred automatically
  },
})

await execute({ title: 'Buy milk' }) // input: { title: string } — inferred
```

## How It Works

### 1. Create Actions in `server/actions/`

Place your action files in the `server/actions/` directory:

```
server/
  actions/
    create-todo.ts        # POST /api/_actions/create-todo
    list-todos.get.ts     # GET  /api/_actions/list-todos
    update-todo.put.ts    # PUT  /api/_actions/update-todo
    delete-todo.delete.ts # DELETE /api/_actions/delete-todo
```

### 2. Define Actions with `defineAction`

```ts
// server/actions/create-todo.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1),
  }),
  handler: async ({ input }) => {
    // Save to database...
    return { id: Date.now(), title: input.title, done: false }
  },
})
```

### 3. Import and Use with Full Types

```vue
<script setup lang="ts">
import { createTodo } from '#actions'

const { execute, data, isExecuting, hasSucceeded } = useAction(createTodo, {
  onSuccess(todo) {
    // todo is typed as { id: number; title: string; done: boolean }
    console.log('Created:', todo.title)
  },
})
</script>

<template>
  <button @click="execute({ title: 'New todo' })" :disabled="isExecuting">
    {{ isExecuting ? 'Creating...' : 'Create Todo' }}
  </button>
  <p v-if="hasSucceeded">Created: {{ data?.title }}</p>
</template>
```

## HTTP Method Convention

The file name determines the HTTP method:

| File Name | HTTP Method | Route |
|-----------|-------------|-------|
| `create-todo.ts` | POST (default) | `/api/_actions/create-todo` |
| `list-todos.get.ts` | GET | `/api/_actions/list-todos` |
| `update-todo.put.ts` | PUT | `/api/_actions/update-todo` |
| `update-todo.patch.ts` | PATCH | `/api/_actions/update-todo` |
| `delete-todo.delete.ts` | DELETE | `/api/_actions/delete-todo` |

## Generated Exports

The `#actions` virtual module exports a **camelCase** reference for each action file:

| File Name | Export Name |
|-----------|-------------|
| `create-todo.ts` | `createTodo` |
| `list-todos.get.ts` | `listTodos` |
| `update-user.put.ts` | `updateUser` |

## Configuration

You can customize the actions directory in your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  actions: {
    actionsDir: 'actions', // default: 'actions' (relative to server/)
  },
})
```

## Using with `useOptimisticAction`

Typed references work with optimistic actions too:

```vue
<script setup lang="ts">
import { toggleTodo } from '#actions'

const todos = ref([{ id: 1, title: 'Buy milk', done: false }])

const { execute, optimisticData } = useOptimisticAction(toggleTodo, {
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
})
</script>
```

## Backward Compatibility

The string-path API still works exactly as before:

```ts
// This still works — no changes needed for existing code
const { execute } = useAction<{ title: string }, Todo>('/api/todos', {
  method: 'POST',
})
```

Both patterns can coexist in the same project. Use `#actions` for new code and migrate existing code at your own pace.
