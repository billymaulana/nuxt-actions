<template>
  <div>
    <h1>Batch Actions</h1>
    <h2>useActions: execute multiple actions in parallel</h2>

    <section>
      <h3 style="margin-bottom: 8px;">
        Execute All at Once
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 12px;">
        Calls createTodo, listTodos, and searchTodos simultaneously using Promise.allSettled.
      </p>
      <button
        :disabled="pending"
        @click="handleBatch"
      >
        {{ pending ? 'Executing...' : 'Run Batch' }}
      </button>

      <div
        v-if="hasErrors"
        class="error"
      >
        Some actions failed.
      </div>
    </section>

    <section v-if="results.some(r => r !== null)">
      <h3 style="margin-bottom: 8px;">
        Results
      </h3>

      <div
        v-for="(result, i) in results"
        :key="i"
        style="margin-bottom: 12px;"
      >
        <div style="font-size: 12px; color: #60a5fa; margin-bottom: 4px;">
          Action {{ i + 1 }}: {{ actionLabels[i] }}
        </div>
        <div
          v-if="result === null"
          style="color: #666; font-size: 13px;"
        >
          Not executed yet
        </div>
        <div
          v-else-if="result.success"
          class="success"
        >
          <pre style="margin: 0;">{{ JSON.stringify(result.data, null, 2) }}</pre>
        </div>
        <div
          v-else
          class="error"
        >
          {{ result.error.message }}
        </div>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { createTodo, listTodos, searchTodos } from '#actions'

const { execute, pending, results, hasErrors } = useActions([
  createTodo,
  listTodos,
  searchTodos,
])

// Execute all with corresponding inputs
await execute([
  { title: 'New batch todo' },  // createTodo input
  {},                            // listTodos input (none)
  { q: 'Learn' },               // searchTodos input
])</pre>
    </section>
  </div>
</template>

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
