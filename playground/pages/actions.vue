<template>
  <div>
    <h1>CRUD Actions</h1>
    <h2>E2E typed references from #actions</h2>

    <!-- Create Todo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Create Todo
      </h3>
      <form
        style="display: flex; gap: 8px;"
        @submit.prevent="handleCreate"
      >
        <input
          v-model="todoTitle"
          type="text"
          placeholder="Enter todo title..."
          style="flex: 1;"
        >
        <button
          type="submit"
          :disabled="createAction.isExecuting.value"
        >
          {{ createAction.isExecuting.value ? 'Creating...' : 'Add Todo' }}
        </button>
      </form>

      <div
        v-if="createAction.error.value"
        class="error"
      >
        {{ createAction.error.value.message }}
        <pre v-if="createAction.error.value.fieldErrors">{{ JSON.stringify(createAction.error.value.fieldErrors, null, 2) }}</pre>
      </div>

      <div
        v-if="createAction.hasSucceeded.value"
        class="success"
      >
        Created: {{ createAction.data.value.title }} (id: {{ createAction.data.value.id }})
      </div>
    </section>

    <!-- List Todos -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Todo List
      </h3>
      <button
        :disabled="listAction.isExecuting.value"
        @click="handleList"
      >
        {{ listAction.isExecuting.value ? 'Loading...' : 'Load Todos' }}
      </button>

      <div
        v-if="listAction.hasSucceeded.value"
        style="margin-top: 12px;"
      >
        <div
          v-for="item in listAction.data.value?.items"
          :key="item.id"
          style="padding: 8px 0; border-bottom: 1px solid #222;"
        >
          <span :style="{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? '#666' : '#e5e5e5' }">
            {{ item.title }}
          </span>
          <span
            class="badge"
            :style="{ background: item.done ? '#0a2c0a' : '#2c1a0a', color: item.done ? '#4ade80' : '#fb923c' }"
          >
            {{ item.done ? 'Done' : 'Pending' }}
          </span>
        </div>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { createTodo, listTodos } from '#actions'

const createAction = useAction(createTodo)
const listAction = useAction(listTodos)</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { createTodo, listTodos } from '#actions'

const todoTitle = ref('')

const createAction = useAction(createTodo, {
  onSuccess() {
    todoTitle.value = ''
  },
})

const listAction = useAction(listTodos)

async function handleCreate() {
  await createAction.execute({ title: todoTitle.value })
}

async function handleList() {
  await listAction.execute(undefined as never)
}
</script>
