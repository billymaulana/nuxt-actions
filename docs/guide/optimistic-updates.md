# Optimistic Updates

`useOptimisticAction` gives users instant visual feedback by updating the UI **before** the server responds. If the server confirms the change, the optimistic state is replaced with the server's authoritative data. If the server returns an error, the optimistic state is automatically rolled back to the snapshot taken before the update.

::: tip Working example
Try optimistic updates live in the [example /optimistic page](https://github.com/billymaulana/nuxt-actions-example/blob/master/pages/optimistic.vue) -- toggle todos and see instant UI feedback with rollback.
:::

## What Are Optimistic Updates?

In a typical action flow, the user clicks a button, waits for the server to respond, and then sees the UI update. With optimistic updates, you flip the order: the UI updates immediately, and the server request happens in the background. This eliminates perceived latency for operations that almost always succeed, such as toggling a checkbox, liking a post, or reordering a list.

```
Standard flow:    click -> wait for server -> update UI
Optimistic flow:  click -> update UI immediately -> server confirms (or rolls back)
```

The tradeoff is that you must handle the rare case where the server rejects the change, which `useOptimisticAction` does automatically via rollback.

## Basic Usage

```vue
<script setup lang="ts">
interface Todo {
  id: number
  title: string
  done: boolean
}

const todos = ref<Todo[]>([
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Walk the dog', done: true },
  { id: 3, title: 'Write docs', done: false },
])

const { execute, optimisticData } = useOptimisticAction<
  { id: number },
  Todo[]
>('/api/todos/toggle', {
  method: 'PATCH',
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
})
</script>

<template>
  <ul>
    <li v-for="todo in optimisticData" :key="todo.id">
      <label>
        <input
          type="checkbox"
          :checked="todo.done"
          @change="execute({ id: todo.id })"
        />
        {{ todo.title }}
      </label>
    </li>
  </ul>
</template>
```

Notice that the template renders from `optimisticData`, not from `todos`. This is what makes the UI update instantly when the user clicks.

## How It Works

Here is the step-by-step lifecycle when `execute(input)` is called:

1. **Snapshot** -- The current value of `optimisticData` is saved internally for potential rollback.
2. **Optimistic update** -- `updateFn(input, currentData)` is called immediately. The return value becomes the new `optimisticData`.
3. **HTTP request** -- The request is sent to the server in the background.
4. **On success** -- `optimisticData` is replaced with the server's response (the authoritative data).
5. **On error** -- `optimisticData` is rolled back to the snapshot from step 1.

```
execute(input)
  |
  +-- Save snapshot of optimisticData
  +-- optimisticData = updateFn(input, currentData)  [instant]
  +-- fetch(path, input)
        |
        +-- success: optimisticData = serverResponse
        +-- error:   optimisticData = snapshot  [rollback]
```

## The currentData + updateFn Pattern

Two required options control the optimistic behavior:

### currentData

A `Ref` or `ComputedRef` containing the source-of-truth data. This is what `updateFn` receives as its second argument to compute the next optimistic state.

```ts
const todos = ref<Todo[]>([])

// currentData can be a plain ref
useOptimisticAction('/api/todos/toggle', {
  currentData: todos,
  updateFn: (input, current) => /* ... */,
})
```

```ts
// Or a computed ref
const activeTodos = computed(() => todos.value.filter(t => !t.done))

useOptimisticAction('/api/todos/archive', {
  currentData: activeTodos,
  updateFn: (input, current) => /* ... */,
})
```

### updateFn

A **pure function** that takes the action input and the current data, and returns the new state. This function runs synchronously and should have no side effects.

```ts
updateFn: (input, current) => {
  // Return a new array/object -- do not mutate `current`
  return current.map(t =>
    t.id === input.id ? { ...t, done: !t.done } : t
  )
}
```

The function signature:

```ts
updateFn: (input: TInput, currentData: TOutput) => TOutput
```

## Return Values

`useOptimisticAction` returns all the same values as `useAction`, plus `optimisticData`:

| Property | Type | Description |
|----------|------|-------------|
| `execute` | `(input: TInput) => Promise<ActionResult<TOutput>>` | Triggers the optimistic update and server request |
| `optimisticData` | `Ref<TOutput>` | The optimistically updated data. Render from this ref. |
| `data` | `Ref<TOutput \| null>` | The most recent **server-confirmed** data |
| `error` | `Ref<ActionError \| null>` | The most recent error, or `null` |
| `status` | `Ref<ActionStatus>` | `'idle'` \| `'executing'` \| `'success'` \| `'error'` |
| `reset` | `() => void` | Resets `optimisticData` to `currentData`, clears `data`, `error`, and `status` |

### optimisticData vs data

These two refs serve different purposes:

- **`optimisticData`** -- Reflects the predicted state. Updated instantly when `execute` is called. This is what your template should render.
- **`data`** -- Only set when the server responds successfully. Always `null` until the first successful response.

In practice, you rarely need `data` when using optimistic updates. It exists for cases where you need to distinguish between what the user sees (optimistic) and what the server confirmed (authoritative).

## Rollback on Error

When the server request fails, `optimisticData` is automatically reset to the snapshot taken before the optimistic update was applied. The user sees the state revert, and the `error` ref is populated.

```ts
const { execute, optimisticData, error } = useOptimisticAction<
  { id: number },
  Todo[]
>('/api/todos/toggle', {
  method: 'PATCH',
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
  onError(error) {
    toast.error('Failed to update. Your changes have been reverted.')
  },
})
```

This covers both server errors (the request completed but returned `{ success: false }`) and network errors (the request itself failed).

## Callbacks

All callbacks from `useAction` are available:

```ts
const { execute } = useOptimisticAction('/api/todos/toggle', {
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),

  onExecute(input) {
    // Fires after the optimistic update, before the fetch
    console.log('Toggling todo:', input.id)
  },

  onSuccess(serverData) {
    // Server confirmed the change
    // optimisticData is now replaced with serverData
    console.log('Confirmed by server')
  },

  onError(error) {
    // Server rejected the change
    // optimisticData has been rolled back
    toast.error(`Update failed: ${error.message}`)
  },

  onSettled(result) {
    // Always fires, whether success or error
    console.log('Done:', result.success)
  },
})
```

### Callback execution order

```
execute(input)
  -> save snapshot
  -> apply updateFn to optimisticData
  -> onExecute(input)
  -> fetch begins
  -> ... server responds ...
  -> onSuccess(data)  OR  onError(error)
  -> onSettled(result)
```

## Real-World Example: Todo Toggle

A complete implementation of a todo list where clicking a checkbox instantly toggles the visual state.

Server action:

```ts
// server/api/todos/toggle.patch.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    id: z.number(),
  }),
  middleware: [authMiddleware],
  handler: async ({ input, ctx }) => {
    const todo = await db.todo.findFirst({
      where: { id: input.id, userId: ctx.user.id },
    })

    if (!todo) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
        statusCode: 404,
      })
    }

    await db.todo.update({
      where: { id: input.id },
      data: { done: !todo.done },
    })

    // Return the full updated list for the user
    return await db.todo.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: 'desc' },
    })
  },
})
```

Client component:

```vue
<script setup lang="ts">
interface Todo {
  id: number
  title: string
  done: boolean
  createdAt: string
}

const todos = ref<Todo[]>([])

// Load initial data
onMounted(async () => {
  const { data } = await useFetch<{ success: true; data: Todo[] }>('/api/todos')
  if (data.value?.success) {
    todos.value = data.value.data
  }
})

const { execute: toggleTodo, optimisticData, status } = useOptimisticAction<
  { id: number },
  Todo[]
>('/api/todos/toggle', {
  method: 'PATCH',
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
  onSuccess(serverTodos) {
    // Sync source of truth with server data
    todos.value = serverTodos
  },
  onError() {
    toast.error('Could not update todo. Please try again.')
  },
})
</script>

<template>
  <div class="todo-list">
    <h2>My Todos</h2>

    <ul>
      <li
        v-for="todo in optimisticData"
        :key="todo.id"
        :class="{ done: todo.done }"
      >
        <label>
          <input
            type="checkbox"
            :checked="todo.done"
            @change="toggleTodo({ id: todo.id })"
          />
          <span>{{ todo.title }}</span>
        </label>
      </li>
    </ul>

    <p v-if="optimisticData.length === 0">No todos yet.</p>
  </div>
</template>

<style scoped>
.done span {
  text-decoration: line-through;
  opacity: 0.6;
}
</style>
```

## Real-World Example: Like Button

A like button that instantly updates the count and visual state, rolling back if the server rejects the request.

Server action:

```ts
// server/api/posts/like.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    postId: z.number(),
  }),
  middleware: [authMiddleware],
  handler: async ({ input, ctx }) => {
    const existing = await db.like.findFirst({
      where: { postId: input.postId, userId: ctx.user.id },
    })

    if (existing) {
      await db.like.delete({ where: { id: existing.id } })
    } else {
      await db.like.create({
        data: { postId: input.postId, userId: ctx.user.id },
      })
    }

    const likeCount = await db.like.count({
      where: { postId: input.postId },
    })

    const isLiked = !existing

    return { postId: input.postId, likeCount, isLiked }
  },
})
```

Client component:

```vue
<script setup lang="ts">
interface PostLikeState {
  postId: number
  likeCount: number
  isLiked: boolean
}

const props = defineProps<{
  postId: number
  initialLikeCount: number
  initialIsLiked: boolean
}>()

const likeState = ref<PostLikeState>({
  postId: props.postId,
  likeCount: props.initialLikeCount,
  isLiked: props.initialIsLiked,
})

const { execute: toggleLike, optimisticData } = useOptimisticAction<
  { postId: number },
  PostLikeState
>('/api/posts/like', {
  method: 'POST',
  currentData: likeState,
  updateFn: (input, current) => ({
    ...current,
    isLiked: !current.isLiked,
    likeCount: current.isLiked
      ? current.likeCount - 1
      : current.likeCount + 1,
  }),
  onSuccess(serverState) {
    // Sync with server truth
    likeState.value = serverState
  },
  onError() {
    toast.error('Could not update like. Please try again.')
  },
})
</script>

<template>
  <button
    @click="toggleLike({ postId })"
    :class="{ liked: optimisticData.isLiked }"
    class="like-button"
  >
    <span class="heart">{{ optimisticData.isLiked ? '&#9829;' : '&#9825;' }}</span>
    <span class="count">{{ optimisticData.likeCount }}</span>
  </button>
</template>

<style scoped>
.like-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.like-button.liked {
  color: #e53e3e;
  border-color: #fed7d7;
  background: #fff5f5;
}

.heart {
  font-size: 1.2em;
}
</style>
```

## Using reset()

Call `reset()` to restore `optimisticData` to the current value of `currentData`, and clear `data`, `error`, and `status`:

```ts
const { execute, optimisticData, reset } = useOptimisticAction('/api/todos/toggle', {
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
})

// After some operations, reset everything
function discardChanges() {
  reset()
  // optimisticData now equals todos.value
  // status is 'idle', data is null, error is null
}
```

## Best Practices

### Design updateFn as a pure function

`updateFn` should take its arguments, return a new value, and do nothing else. No API calls, no DOM manipulation, no `ref` mutations. This makes it predictable and testable.

```ts
// Preferred: pure function returning new data
updateFn: (input, current) =>
  current.map(t => t.id === input.id ? { ...t, done: !t.done } : t)

// Avoid: side effects inside updateFn
updateFn: (input, current) => {
  toast.info('Updating...')      // Side effect -- do this in onExecute instead
  analytics.track('toggle')      // Side effect
  return current.map(t => t.id === input.id ? { ...t, done: !t.done } : t)
}
```

### Do not mutate current -- return a new value

`updateFn` receives the current data by value. Always return a new object or array rather than mutating the existing one, so the snapshot mechanism works correctly.

```ts
// Correct: returns new array
updateFn: (input, current) =>
  current.filter(item => item.id !== input.id)

// Wrong: mutates current in place
updateFn: (input, current) => {
  const index = current.findIndex(item => item.id === input.id)
  current.splice(index, 1) // Mutation -- breaks rollback
  return current
}
```

### Keep optimistic state serializable

Since `optimisticData` may be rolled back, snapshotted, or compared, keep it as plain JSON-serializable data. Avoid storing class instances, functions, or circular references.

### Sync currentData in onSuccess

When the server returns the authoritative state, update your `currentData` ref so that subsequent optimistic updates start from the correct baseline:

```ts
const todos = ref<Todo[]>([])

const { execute } = useOptimisticAction('/api/todos/toggle', {
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
  onSuccess(serverTodos) {
    todos.value = serverTodos // Keep source of truth in sync
  },
})
```

### Render from optimisticData, not currentData

The whole point of optimistic updates is that `optimisticData` reflects the predicted state instantly. Always bind your template to `optimisticData`:

```vue
<!-- Correct: renders optimistic state -->
<li v-for="todo in optimisticData" :key="todo.id">

<!-- Wrong: renders the unmodified source of truth -->
<li v-for="todo in todos" :key="todo.id">
```

### Use optimistic updates for likely-to-succeed actions

Optimistic updates work best for operations with a high success rate: toggling booleans, incrementing counters, reordering items. For operations that frequently fail (payments, complex validations), a standard `useAction` with a loading spinner provides a better user experience, because frequent rollbacks feel jarring.

## Next Steps

- [useAction](/guide/use-action) -- The standard (non-optimistic) composable
- [Error Handling](/guide/error-handling) -- How rollback errors are surfaced to the client
- [useOptimisticAction API](/api/use-optimistic-action) -- Full API reference
