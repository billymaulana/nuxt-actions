<template>
  <div>
    <h1>Real-World App</h1>
    <h2>Complete mini todo app combining auth, CRUD, optimistic updates, and validation</h2>

    <template v-if="!isAuthenticated">
      <section>
        <h3 style="margin-bottom: 8px;">
          Login First
        </h3>
        <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
          Authenticate to access the todo app. Use <code>admin@example.com</code> / <code>password123</code>.
        </p>
        <form @submit.prevent="handleLogin">
          <div style="display: grid; gap: 8px;">
            <input
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="admin@example.com"
            >
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="password123"
            >
            <button
              type="submit"
              :disabled="loginAction.isExecuting.value"
            >
              {{ loginAction.isExecuting.value ? 'Logging in...' : 'Login' }}
            </button>
          </div>
        </form>
        <div
          v-if="loginAction.error.value"
          class="error"
        >
          {{ loginAction.error.value.message }}
        </div>
      </section>
    </template>

    <template v-else>
      <section>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3>
            Welcome, {{ userName }}
          </h3>
          <button
            style="background: #2c1a0a; color: #fb923c; font-size: 12px; padding: 4px 10px;"
            @click="handleLogout"
          >
            Logout
          </button>
        </div>
      </section>

      <section>
        <h3 style="margin-bottom: 8px;">
          Add Todo
        </h3>
        <form
          style="display: flex; gap: 8px;"
          @submit.prevent="handleCreateTodo"
        >
          <input
            v-model="newTodoTitle"
            type="text"
            placeholder="Enter todo title..."
            style="flex: 1;"
          >
          <button
            type="submit"
            :disabled="createAction.isExecuting.value || !newTodoTitle.trim()"
          >
            {{ createAction.isExecuting.value ? 'Adding...' : 'Add' }}
          </button>
        </form>
        <div
          v-if="createAction.error.value"
          class="error"
        >
          {{ createAction.error.value.message }}
          <pre v-if="createAction.error.value.fieldErrors">{{ JSON.stringify(createAction.error.value.fieldErrors, null, 2) }}</pre>
        </div>
        <p style="color: #666; font-size: 12px; margin-top: 4px;">
          Try "Buy milk" or "Walk dog" to see validation errors via returnValidationErrors.
        </p>
      </section>

      <section>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3>
            Todos ({{ todos.length }})
          </h3>
        </div>

        <div
          v-if="todos.length === 0"
          style="color: #666; font-size: 14px; padding: 16px 0;"
        >
          No todos yet. Add one above.
        </div>

        <div
          v-for="todo in sortedTodos"
          :key="todo.id"
          style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #222;"
        >
          <button
            style="padding: 4px 10px; font-size: 16px;"
            :disabled="toggleAction.isExecuting.value"
            @click="handleToggle(todo)"
          >
            {{ todo.done ? '&#10003;' : '&nbsp;&nbsp;' }}
          </button>
          <span
            :style="{
              textDecoration: todo.done ? 'line-through' : 'none',
              color: todo.done ? '#666' : '#e5e5e5',
              flex: 1,
            }"
          >
            {{ todo.title }}
          </span>
          <span
            class="badge"
            :style="{
              background: todo.done ? '#0a2c0a' : '#2c1a0a',
              color: todo.done ? '#4ade80' : '#fb923c',
            }"
          >
            {{ todo.done ? 'Done' : 'Pending' }}
          </span>
        </div>
      </section>

      <section>
        <h3 style="margin-bottom: 8px;">
          Features composed
        </h3>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px;">
          <span style="color: #60a5fa;">Auth guard</span>
          <span style="color: #a3a3a3;">Login via useAction(login) before accessing the app</span>
          <span style="color: #60a5fa;">Validation</span>
          <span style="color: #a3a3a3;">returnValidationErrors for duplicate title detection</span>
          <span style="color: #60a5fa;">Optimistic</span>
          <span style="color: #a3a3a3;">Instant checkbox toggle with rollback on error</span>
          <span style="color: #60a5fa;">Sorting</span>
          <span style="color: #a3a3a3;">Completed todos move to the bottom</span>
        </div>
      </section>

      <section>
        <h3 style="margin-bottom: 8px;">
          How it works
        </h3>
        <pre>import { login, createValidatedTodo, toggleTodo } from '#actions'

// Auth
const loginAction = useAction(login, { onSuccess(data) { ... } })

// Create with validation errors
const createAction = useAction(createValidatedTodo)

// Optimistic toggle; the action returns one todo, reconcile merges it
const toggleAction = useOptimisticAction(toggleTodo, {
  currentData: todos,
  updateFn(input, current) {
    return current.map(t =>
      t.id === input.id ? { ...t, done: input.done } : t
    )
  },
  reconcile(confirmed, current) {
    return current.map(t =>
      t.id === confirmed.id ? { ...t, done: confirmed.done } : t
    )
  },
})

// Render the optimistic list, completed todos last
const sortedTodos = computed(() =>
  [...toggleAction.optimisticData.value].sort((a, b) => Number(a.done) - Number(b.done)),
)</pre>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { login, createValidatedTodo, toggleTodo } from '#actions'

interface Todo {
  id: number
  title: string
  done: boolean
}

// ── Auth ──
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

// ── Local Todos (simulated with local state) ──
const todos = ref<Todo[]>([
  { id: 1, title: 'Learn Nuxt', done: true },
  { id: 2, title: 'Build app', done: false },
])

// ── Create Todo ──
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

// ── Optimistic Toggle ──
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
