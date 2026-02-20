<template>
  <div>
    <h1>Optimistic Updates</h1>
    <h2>Instant UI with automatic rollback on error</h2>

    <section>
      <div
        v-for="todo in (optimisticAction.optimisticData.value as typeof todos)"
        :key="todo.id"
        style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #222;"
      >
        <button
          style="padding: 4px 10px; font-size: 16px;"
          :disabled="optimisticAction.isExecuting.value"
          @click="handleToggle(todo)"
        >
          {{ todo.done ? '&check;' : '&nbsp;&nbsp;' }}
        </button>
        <span :style="{ textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? '#666' : '#e5e5e5', flex: 1 }">
          {{ todo.title }}
        </span>
        <span
          class="badge"
          :style="{ background: todo.done ? '#0a2c0a' : '#2c1a0a', color: todo.done ? '#4ade80' : '#fb923c' }"
        >
          {{ todo.done ? 'Done' : 'Pending' }}
        </span>
      </div>
    </section>

    <section v-if="optimisticAction.isExecuting.value">
      <p style="color: #a3a3a3; font-size: 13px;">
        Syncing with server...
      </p>
    </section>

    <section
      v-if="optimisticAction.error.value"
      class="error"
    >
      {{ optimisticAction.error.value.message }}
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { toggleTodo } from '#actions'

const optimisticAction = useOptimisticAction(toggleTodo, {
  currentData: todos,
  updateFn(input, current) {
    return current.map(t =>
      t.id === input.id ? { ...t, done: input.done } : t
    )
  },
})</pre>
    </section>
  </div>
</template>

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
  onSuccess(data) {
    // Sync local state with server truth
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
