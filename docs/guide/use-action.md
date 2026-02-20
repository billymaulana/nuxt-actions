# useAction

`useAction` is the primary client-side composable for calling server actions. It provides reactive state management, lifecycle callbacks, and a consistent interface for any HTTP method. It is auto-imported in all Nuxt components, pages, and composables.

::: tip Working example
See `useAction` with CRUD operations in the [example /actions page](https://github.com/billymaulana/nuxt-actions-example/blob/master/pages/actions.vue) -- create, list, toggle, and delete todos.
:::

## Basic Usage

Pass the API route path and optional configuration. The composable returns reactive refs and execution functions immediately -- no request is made until you call `execute` or `executeAsync`.

```vue
<script setup lang="ts">
const { execute, data, error, status } = useAction<
  { title: string },
  { id: number; title: string; done: boolean }
>('/api/todos', {
  method: 'POST',
})

const title = ref('')

async function createTodo() {
  await execute({ title: title.value })
}
</script>

<template>
  <form @submit.prevent="createTodo">
    <input v-model="title" placeholder="What needs to be done?" />
    <button :disabled="status === 'executing'">Add</button>
  </form>

  <p v-if="data">Created: {{ data.title }}</p>
  <p v-if="error" style="color: red;">{{ error.message }}</p>
</template>
```

## TypeScript Generics

`useAction` accepts two type parameters:

```ts
useAction<TInput, TOutput>(path, options?)
```

| Parameter | Description |
|-----------|-------------|
| `TInput` | The shape of the data you pass to `execute()`. Defaults to `void`. |
| `TOutput` | The shape of the data the server returns on success. Defaults to `unknown`. |

When you provide these generics, every ref and callback is fully typed:

```ts
interface CreateTodoInput {
  title: string
  priority: 'low' | 'medium' | 'high'
}

interface Todo {
  id: number
  title: string
  priority: 'low' | 'medium' | 'high'
  done: boolean
  createdAt: string
}

const { execute, data } = useAction<CreateTodoInput, Todo>('/api/todos', {
  method: 'POST',
  onSuccess(todo) {
    // todo is typed as Todo
    console.log(todo.id, todo.title)
  },
})

// execute expects CreateTodoInput
await execute({ title: 'Buy groceries', priority: 'high' })

// data.value is typed as Todo | null
console.log(data.value?.createdAt)
```

For actions with no input (such as fetching a list), set `TInput` to `void`:

```ts
const { execute, data } = useAction<void, Todo[]>('/api/todos', {
  method: 'GET',
})

// No argument needed
await execute()
```

## Return Values

`useAction` returns an object with the following properties:

### execute

```ts
execute: (input: TInput) => Promise<ActionResult<TOutput>>
```

Calls the server action and updates all reactive refs. Returns the full `ActionResult`, which is either `{ success: true, data: TOutput }` or `{ success: false, error: ActionError }`. This function **never throws** -- errors are captured in the `error` ref and the result object.

```ts
const result = await execute({ title: 'Test' })

if (result.success) {
  console.log('Created:', result.data.id)
} else {
  console.log('Failed:', result.error.code)
}
```

### executeAsync

```ts
executeAsync: (input: TInput) => Promise<TOutput>
```

Similar to `execute`, but returns the data directly on success and **throws** `ActionError` on failure. Use this when you prefer `try/catch` over checking `result.success`:

```ts
try {
  const todo = await executeAsync({ title: 'Test' })
  // todo is directly typed as Todo
  console.log(todo.id)
} catch (err) {
  // err is ActionError
  const error = err as ActionError
  console.error(error.code, error.message)
}
```

::: warning
When using `executeAsync`, unhandled rejections will propagate if you do not wrap the call in `try/catch`. Prefer `execute` when you want errors handled via refs and callbacks without risk of unhandled exceptions.
:::

### data

```ts
data: Ref<TOutput | null>
```

A reactive ref holding the most recent successful response. Starts as `null` and updates whenever an `execute` call succeeds. Remains at its last successful value even if a subsequent call fails.

### error

```ts
error: Ref<ActionError | null>
```

A reactive ref holding the most recent error. Starts as `null`. Set to `null` at the beginning of each `execute` call, and updated if the call fails. Cleared on the next successful call.

### status

```ts
status: Ref<ActionStatus>
// ActionStatus = 'idle' | 'executing' | 'success' | 'error'
```

Tracks the lifecycle of the action:

```
idle  -->  executing  -->  success
                       -->  error
```

- `idle` -- Initial state, or after calling `reset()`
- `executing` -- A request is in flight
- `success` -- The most recent request succeeded
- `error` -- The most recent request failed

### reset

```ts
reset: () => void
```

Resets all reactive state to its initial values:

```ts
const { execute, data, error, status, reset } = useAction('/api/todos')

await execute({ title: 'test' })
// data.value = { ... }, status.value = 'success'

reset()
// data.value = null, error.value = null, status.value = 'idle'
```

## HTTP Methods

By default, `useAction` sends `POST` requests. Set the `method` option to use a different HTTP method.

```ts
// POST (default) -- input sent as request body
const { execute } = useAction('/api/todos', { method: 'POST' })

// GET -- input sent as query parameters
const { execute } = useAction('/api/todos', { method: 'GET' })

// PUT -- input sent as request body
const { execute } = useAction('/api/todos/1', { method: 'PUT' })

// PATCH -- input sent as request body
const { execute } = useAction('/api/todos/1', { method: 'PATCH' })

// DELETE -- input sent as request body
const { execute } = useAction('/api/todos/1', { method: 'DELETE' })
```

**How input is transmitted:**

| Method | Input location |
|--------|---------------|
| `GET`, `HEAD` | Query parameters (`?key=value`) |
| `POST`, `PUT`, `PATCH`, `DELETE` | JSON request body |

This matches the convention used by `defineAction` on the server, which reads from `getQuery` for GET/HEAD and `readBody` for everything else.

## Callbacks

Four optional callbacks let you react to action lifecycle events without watching refs:

### onExecute

Fires immediately when `execute` is called, before the HTTP request is made. Useful for logging or clearing previous UI state.

```ts
const { execute } = useAction('/api/todos', {
  onExecute(input) {
    console.log('Sending:', input)
    formErrors.value = {}
  },
})
```

### onSuccess

Fires when the server returns a successful result. Receives the typed response data.

```ts
const { execute } = useAction<CreateTodoInput, Todo>('/api/todos', {
  method: 'POST',
  onSuccess(todo) {
    toast.success(`Created "${todo.title}"`)
    router.push(`/todos/${todo.id}`)
  },
})
```

### onError

Fires when the action fails (validation error, server error, or network error). Receives the `ActionError` object.

```ts
const { execute } = useAction('/api/todos', {
  onError(error) {
    if (error.code === 'VALIDATION_ERROR' && error.fieldErrors) {
      // Display per-field errors
      Object.entries(error.fieldErrors).forEach(([field, messages]) => {
        setFieldError(field, messages[0])
      })
    } else {
      toast.error(error.message)
    }
  },
})
```

### onSettled

Fires after every execution, whether it succeeded or failed. Receives the full `ActionResult`. Useful for cleanup tasks that should happen regardless of outcome.

```ts
const { execute } = useAction('/api/export', {
  onExecute() {
    showProgressBar.value = true
  },
  onSettled(result) {
    showProgressBar.value = false
    console.log('Completed with success:', result.success)
  },
})
```

### Callback execution order

When an action succeeds: `onExecute` -> `onSuccess` -> `onSettled`

When an action fails: `onExecute` -> `onError` -> `onSettled`

## Loading States

Use the `status` ref to drive loading UI in your templates:

```vue
<script setup lang="ts">
const { execute, data, error, status } = useAction<void, Todo[]>(
  '/api/todos',
  { method: 'GET' },
)

// Computed helpers for cleaner templates
const isLoading = computed(() => status.value === 'executing')
const isIdle = computed(() => status.value === 'idle')
</script>

<template>
  <div>
    <button @click="execute()" :disabled="isLoading">
      {{ isLoading ? 'Loading...' : 'Fetch Todos' }}
    </button>

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="skeleton">
      <div v-for="i in 3" :key="i" class="skeleton-row" />
    </div>

    <!-- Results -->
    <ul v-else-if="data">
      <li v-for="todo in data" :key="todo.id">
        {{ todo.title }}
      </li>
    </ul>

    <!-- Empty state -->
    <p v-else-if="isIdle">Click the button to load todos.</p>

    <!-- Error state -->
    <div v-if="error" class="error">
      <p>{{ error.message }}</p>
      <button @click="execute()">Retry</button>
    </div>
  </div>
</template>
```

### Disabling buttons during execution

A common pattern is to disable submit buttons while an action is in flight:

```vue
<button
  type="submit"
  :disabled="status === 'executing'"
  :class="{ 'opacity-50': status === 'executing' }"
>
  <span v-if="status === 'executing'">Saving...</span>
  <span v-else>Save</span>
</button>
```

## Complete Example: Contact Form

This example brings together input handling, loading states, error display, field errors, and success feedback.

```vue
<script setup lang="ts">
interface ContactInput {
  name: string
  email: string
  message: string
}

interface ContactResponse {
  ticketId: string
}

const form = reactive<ContactInput>({
  name: '',
  email: '',
  message: '',
})

const fieldErrors = ref<Record<string, string[]>>({})

const { execute, status, data } = useAction<ContactInput, ContactResponse>(
  '/api/contact',
  {
    method: 'POST',
    onExecute() {
      fieldErrors.value = {}
    },
    onSuccess(response) {
      toast.success(`Message sent! Ticket: ${response.ticketId}`)
      // Reset form
      form.name = ''
      form.email = ''
      form.message = ''
    },
    onError(error) {
      if (error.fieldErrors) {
        fieldErrors.value = error.fieldErrors
      } else {
        toast.error(error.message)
      }
    },
  },
)

function fieldError(field: string): string | undefined {
  return fieldErrors.value[field]?.[0]
}
</script>

<template>
  <form @submit.prevent="execute(form)">
    <div>
      <label>Name</label>
      <input v-model="form.name" />
      <span v-if="fieldError('name')" class="error">{{ fieldError('name') }}</span>
    </div>

    <div>
      <label>Email</label>
      <input v-model="form.email" type="email" />
      <span v-if="fieldError('email')" class="error">{{ fieldError('email') }}</span>
    </div>

    <div>
      <label>Message</label>
      <textarea v-model="form.message" rows="4" />
      <span v-if="fieldError('message')" class="error">{{ fieldError('message') }}</span>
    </div>

    <button type="submit" :disabled="status === 'executing'">
      {{ status === 'executing' ? 'Sending...' : 'Send Message' }}
    </button>

    <p v-if="data" class="success">
      Thank you! Your ticket ID is {{ data.ticketId }}.
    </p>
  </form>
</template>
```

The corresponding server action:

```ts
// server/api/contact.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Please enter a valid email'),
    message: z.string().min(10, 'Message must be at least 10 characters'),
  }),
  handler: async ({ input }) => {
    const ticketId = `TICKET-${Date.now()}`
    await sendEmail({
      to: 'support@example.com',
      subject: `Contact: ${input.name}`,
      body: `From: ${input.email}\n\n${input.message}`,
    })
    return { ticketId }
  },
})
```

## Best Practices

### Provide explicit type parameters

Always specify `TInput` and `TOutput` for full type safety across `execute`, `data`, callbacks, and destructured return values:

```ts
// Preferred: explicit types
const { execute, data } = useAction<
  { title: string; priority: string },
  { id: number; title: string }
>('/api/todos', { method: 'POST' })

// Avoid: relying on defaults leaves data as unknown
const { execute, data } = useAction('/api/todos')
```

### Handle loading states in UI

Always account for the `executing` state. Disabling buttons and showing spinners prevents duplicate submissions and communicates progress to users.

### Use onError for toast notifications and side effects

Keep the template clean by handling transient feedback (toasts, redirects, analytics) in `onError` and `onSuccess`. Reserve the `error` ref for persistent, inline error display.

### Use reset() for multi-step forms

After a successful form submission, call `reset()` to return the composable to its initial state, ready for the next entry:

```ts
const { execute, reset, status, data } = useAction('/api/entries', {
  method: 'POST',
  onSuccess() {
    // Clear form inputs
    form.name = ''
    form.value = ''
    // Reset composable state
    reset()
  },
})
```

### Avoid calling execute in setup without user intent

`useAction` does not make a request on mount. If you need to fetch data on page load, consider using Nuxt's built-in `useFetch` or `useAsyncData`. Reserve `useAction` for user-triggered mutations and queries.

## Next Steps

- [Optimistic Updates](/guide/optimistic-updates) -- Instant UI feedback with `useOptimisticAction`
- [Error Handling](/guide/error-handling) -- Detailed error handling patterns
- [useAction API](/api/use-action) -- Full API reference
