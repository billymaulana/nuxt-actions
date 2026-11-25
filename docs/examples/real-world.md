---
title: Real-World App
description: A small todo app on one page, with a login gate built on useAction, todo creation with server-side validation errors, and a done toggle.
---

# Real-World App

This page combines patterns from the other examples into one flow. You sign in through the `login` action, then add todos through `createValidatedTodo` and mark them done through `useOptimisticAction`. The todo list lives in local state on the page, which keeps the example self-contained.

<ExampleSource page="pages/real-world.vue" />

## Server actions

::: code-group

```ts [server/actions/login.post.ts]
import { z } from 'zod'

const authMiddleware = defineMiddleware(async ({ event, next }) => {
  console.log(`[Auth] ${event.method} ${event.path}`)
  return next({ ctx: { requestTime: Date.now() } })
})

const rateLimitInfoMiddleware = defineMiddleware(async ({ next }) => {
  return next({ ctx: { rateLimitRemaining: 99 } })
})

export default defineAction({
  input: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
  middleware: [authMiddleware, rateLimitInfoMiddleware],
  handler: async ({ input, ctx }) => {
    await new Promise(r => setTimeout(r, 300))

    if (input.email === 'admin@example.com' && input.password === 'password123') {
      return {
        user: { id: 1, email: input.email, name: 'Admin' },
        token: 'demo-jwt-token',
        meta: { requestTime: (ctx as Record<string, unknown>).requestTime },
      }
    }

    throw createActionError({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
      statusCode: 401,
    })
  },
})
```

```ts [server/actions/create-validated-todo.post.ts]
import { z } from 'zod'

const existingTitles = ['Buy milk', 'Walk dog']

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    if (existingTitles.includes(input.title)) {
      returnValidationErrors({ title: ['This todo already exists'] })
    }
    return { id: Date.now(), title: input.title, done: false }
  },
})
```

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

:::

## Page

```vue [pages/real-world.vue]
<script setup lang="ts">
import { ref, computed } from 'vue'
import { login, createValidatedTodo, toggleTodo } from '#actions'

interface Todo {
  id: number
  title: string
  done: boolean
}

const isAuthenticated = ref(false)
const userName = ref('')
const email = ref('admin@example.com')
const password = ref('password123')

const loginAction = useAction(login, {
  onSuccess(data) {
    isAuthenticated.value = true
    userName.value = data.user.name
  },
})

async function handleLogin() {
  await loginAction.execute({ email: email.value, password: password.value })
}

function handleLogout() {
  isAuthenticated.value = false
  userName.value = ''
  todos.value = [
    { id: 1, title: 'Learn Nuxt', done: true },
    { id: 2, title: 'Build app', done: false },
  ]
}

const todos = ref<Todo[]>([
  { id: 1, title: 'Learn Nuxt', done: true },
  { id: 2, title: 'Build app', done: false },
])

const newTodoTitle = ref('')
const createAction = useAction(createValidatedTodo, {
  onSuccess(data) {
    todos.value.push({ id: data.id, title: data.title, done: data.done })
    newTodoTitle.value = ''
  },
})

async function handleCreateTodo() {
  await createAction.execute({ title: newTodoTitle.value })
}

const toggleAction = useOptimisticAction(toggleTodo, {
  currentData: todos,
  updateFn(input: { id: number, done: boolean }, current: Todo[]) {
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
    todos.value = todos.value.map(t => (t.id === data.id ? { ...t, done: data.done } : t))
  },
})

const sortedTodos = computed(() =>
  [...toggleAction.optimisticData.value].sort((a, b) => Number(a.done) - Number(b.done)),
)

function handleToggle(todo: Todo) {
  toggleAction.execute({ id: todo.id, done: !todo.done })
}
</script>

<template>
  <div>
    <template v-if="!isAuthenticated">
      <section>
        <form @submit.prevent="handleLogin">
          <input v-model="email" type="email" autocomplete="username" placeholder="admin@example.com">
          <input v-model="password" type="password" autocomplete="current-password" placeholder="password123">
          <button type="submit" :disabled="loginAction.isExecuting.value">
            {{ loginAction.isExecuting.value ? 'Logging in...' : 'Login' }}
          </button>
        </form>
        <div v-if="loginAction.error.value" class="error">
          {{ loginAction.error.value.message }}
        </div>
      </section>
    </template>

    <template v-else>
      <section>
        <h3>Welcome, {{ userName }}</h3>
        <button @click="handleLogout">
          Logout
        </button>
      </section>

      <section>
        <form @submit.prevent="handleCreateTodo">
          <input v-model="newTodoTitle" type="text" placeholder="Enter todo title...">
          <button
            type="submit"
            :disabled="createAction.isExecuting.value || !newTodoTitle.trim()"
          >
            {{ createAction.isExecuting.value ? 'Adding...' : 'Add' }}
          </button>
        </form>
        <div v-if="createAction.error.value" class="error">
          {{ createAction.error.value.message }}
          <pre v-if="createAction.error.value.fieldErrors">{{
            JSON.stringify(createAction.error.value.fieldErrors, null, 2)
          }}</pre>
        </div>
      </section>

      <section>
        <h3>Todos ({{ todos.length }})</h3>

        <div v-if="todos.length === 0">
          No todos yet. Add one above.
        </div>

        <div v-for="todo in sortedTodos" :key="todo.id">
          <button :disabled="toggleAction.isExecuting.value" @click="handleToggle(todo)">
            {{ todo.done ? '&#10003;' : '&nbsp;&nbsp;' }}
          </button>
          <span :style="{ textDecoration: todo.done ? 'line-through' : 'none' }">
            {{ todo.title }}
          </span>
          <span class="badge">{{ todo.done ? 'Done' : 'Pending' }}</span>
        </div>
      </section>
    </template>
  </div>
</template>
```

The markup is trimmed for readability, without the feature list and code snippets of the original page. The full page is linked above.

## How it works

- `isAuthenticated` switches the template between the login form and the app. The `onSuccess` callback of the login action sets the flag and stores the user's name.
- New todos go through `createValidatedTodo`. "Buy milk" and "Walk dog" pass the schema but come back as title errors from `returnValidationErrors`, which the page prints from `fieldErrors`.
- A successful create pushes the returned todo into the local `todos` list.
- The toggle runs through `useOptimisticAction` with `todos` as `currentData`. The action returns one todo, so `reconcile` merges it into the list, and `onSuccess` writes the server's `done` value back into `todos`.
- The list renders `sortedTodos`, a sorted copy of `optimisticData` with finished items moved to the bottom, so a toggle shows up the moment it is clicked. A created todo appears right away too, because `optimisticData` follows `todos` while no toggle is running.

## Related

- Guide: [Middleware](/guide/middleware), [Error Handling](/guide/error-handling), [Optimistic Updates](/guide/optimistic-updates)
- API: [useAction](/api/use-action), [useOptimisticAction](/api/use-optimistic-action), [returnValidationErrors](/api/return-validation-errors)
