<script setup lang="ts">
import { ref } from 'vue'
import { createTodo, listTodos } from '#actions'

const { data: todos, status } = useActionQuery(listTodos, undefined, { tags: ['todos'] })

const title = ref('')
const { execute, isExecuting } = useActionMutation(createTodo, {
  invalidates: ['todos'],
})

async function addTodo() {
  if (!title.value) return
  await execute({ title: title.value })
  title.value = ''
}
</script>

<template>
  <div>
    <h2>Smart Cache: mutation auto-refetches the list</h2>
    <form @submit.prevent="addTodo">
      <input
        v-model="title"
        placeholder="New todo"
      >
      <button :disabled="isExecuting">
        Add
      </button>
    </form>

    <p v-if="status === 'pending'">
      Loading...
    </p>
    <ul>
      <li
        v-for="todo in todos"
        :key="todo.id"
      >
        {{ todo.title }}
      </li>
    </ul>
  </div>
</template>
