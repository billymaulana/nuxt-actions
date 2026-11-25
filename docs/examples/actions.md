---
title: CRUD Actions
description: Create and list todos with useAction and typed references from #actions, with loading, success, and validation error state wired into the page.
---

# CRUD Actions

The smallest complete round trip: two server actions and one page that calls them. The page imports typed references from `#actions` and hands them to `useAction`, so the input of `execute()` and the shape of `data` come straight from the server files, with no URLs or generics in the component.

Use this pattern for one-off calls from a component, such as a form submit or a button that loads data on demand.

<ExampleSource page="pages/actions.vue" />

## Server actions

::: code-group

```ts [server/actions/create-todo.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return {
      id: Date.now(),
      title: input.title,
      done: false,
    }
  },
})
```

```ts [server/actions/list-todos.get.ts]
export default defineAction({
  handler: async () => {
    return {
      items: [
        { id: 1, title: 'Learn Nuxt', done: true },
        { id: 2, title: 'Build app', done: false },
      ],
    }
  },
})
```

:::

## Page

```vue [pages/actions.vue]
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

<template>
  <div>
    <section>
      <form @submit.prevent="handleCreate">
        <input v-model="todoTitle" type="text" placeholder="Enter todo title...">
        <button type="submit" :disabled="createAction.isExecuting.value">
          {{ createAction.isExecuting.value ? 'Creating...' : 'Add Todo' }}
        </button>
      </form>

      <div v-if="createAction.error.value" class="error">
        {{ createAction.error.value.message }}
        <pre v-if="createAction.error.value.fieldErrors">{{
          JSON.stringify(createAction.error.value.fieldErrors, null, 2)
        }}</pre>
      </div>

      <div v-if="createAction.hasSucceeded.value" class="success">
        Created: {{ createAction.data.value.title }} (id: {{ createAction.data.value.id }})
      </div>
    </section>

    <section>
      <button :disabled="listAction.isExecuting.value" @click="handleList">
        {{ listAction.isExecuting.value ? 'Loading...' : 'Load Todos' }}
      </button>

      <div v-if="listAction.hasSucceeded.value">
        <div v-for="item in listAction.data.value?.items" :key="item.id">
          <span :style="{ textDecoration: item.done ? 'line-through' : 'none' }">
            {{ item.title }}
          </span>
          <span class="badge">{{ item.done ? 'Done' : 'Pending' }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- `create-todo.ts` has no method suffix, so it is served as `POST /api/_actions/create-todo`. The `.get` suffix makes `list-todos.get.ts` a `GET` route.
- `createTodo` and `listTodos` are typed references generated from those files. The object passed to `createAction.execute()` is checked against the Zod schema's type.
- An empty title fails validation on the server, and the page prints the messages from `error.value.fieldErrors`.
- `onSuccess` clears the input once the todo is created.
- `isExecuting` disables each button while its request is in flight, and `hasSucceeded` reveals the result.

## Related

- Guide: [useAction](/guide/use-action), [E2E Type Inference](/guide/e2e-type-inference)
- API: [defineAction](/api/define-action), [useAction](/api/use-action)
