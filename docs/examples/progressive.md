---
title: Progressive Enhancement
description: A todo form built on useActionState, where formProps provides the native action and method and formAction submits FormData once JavaScript runs.
---

# Progressive Enhancement

`useActionState` is built for forms that should still submit before JavaScript has loaded. `formProps` supplies the `action` and `method` attributes for a native form post, and `formAction` takes the form's `FormData` when JavaScript is running. Validation errors from the schema and from `returnValidationErrors` come back the same way.

<ExampleSource page="pages/progressive.vue" />

## Server action

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

## Page

```vue [pages/progressive.vue]
<script setup lang="ts">
import { createValidatedTodo } from '#actions'

const { state, error, pending, formAction, formProps } =
  useActionState(createValidatedTodo)

async function handleSubmit(e: Event) {
  const form = e.target as HTMLFormElement
  await formAction(new FormData(form))
  if (!error.value) {
    form.reset()
  }
}
</script>

<template>
  <div>
    <section>
      <form v-bind="formProps" @submit.prevent="handleSubmit">
        <label>Title</label>
        <input name="title" type="text" placeholder="Enter todo title...">

        <button type="submit" :disabled="pending">
          {{ pending ? 'Creating...' : 'Create Todo' }}
        </button>
      </form>

      <div v-if="error" class="error">
        {{ error.message }}
        <pre v-if="error.fieldErrors">{{ JSON.stringify(error.fieldErrors, null, 2) }}</pre>
      </div>

      <div v-if="state" class="success">
        <p>Created todo:</p>
        <pre>{{ JSON.stringify(state, null, 2) }}</pre>
      </div>
    </section>

    <section>
      <span>pending:</span>
      <span>{{ pending }}</span>
      <span>state:</span>
      <span>{{ state ? JSON.stringify(state) : 'null' }}</span>
      <span>error:</span>
      <span>{{ error ? error.message : 'null' }}</span>
      <span>formProps:</span>
      <span>{{ JSON.stringify(formProps) }}</span>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- `v-bind="formProps"` puts `action` and `method` on the `<form>`, which is what the browser uses to submit the form when no JavaScript runs.
- With JavaScript running, `@submit.prevent` stops the native post and `handleSubmit` passes `new FormData(form)` to `formAction`, which turns it into a plain object and runs the action.
- The input only needs `name="title"`. It is not bound with `v-model`, because the values are read from the form when it is submitted.
- An empty title fails the schema. "Buy milk" and "Walk dog" pass the schema, but the handler calls `returnValidationErrors`, so the title error arrives in the same `fieldErrors` shape.
- `state` holds the data from the last successful call, and the form is only reset when the call ended without an error.

## Related

- Guide: [Form Actions](/guide/form-actions)
- API: [useActionState](/api/use-action-state), [returnValidationErrors](/api/return-validation-errors)
