---
title: Form Actions
description: A registration form built with useFormAction, with field errors from Zod and from the server, dirty tracking, a submitting state, and reset.
---

# Form Actions

A registration form driven by `useFormAction`. The composable owns the field values, maps validation errors to each field, and tracks whether the form has changed, so the page only binds inputs and buttons. The server adds a field error of its own when the email address is already taken.

Reach for it whenever a form maps one to one onto an action's input.

<ExampleSource page="pages/forms.vue" />

## Server action

```ts [server/actions/register.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
  handler: async ({ input }) => {
    await new Promise(r => setTimeout(r, 500))

    if (input.email === 'taken@example.com') {
      throw createActionError({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        statusCode: 422,
        fieldErrors: {
          email: ['This email is already registered'],
        },
      })
    }

    return {
      id: Math.floor(Math.random() * 10000),
      name: input.name,
      email: input.email,
    }
  },
})
```

## Page

```vue [pages/forms.vue]
<script setup lang="ts">
import { register } from '#actions'

const {
  fields,
  submit,
  fieldErrors,
  isDirty,
  isSubmitting,
  reset,
  data,
  error,
  status,
} = useFormAction(register, {
  initialValues: { name: '', email: '', password: '' },
})
</script>

<template>
  <div>
    <section>
      <form @submit.prevent="submit()">
        <label>Name</label>
        <input v-model="fields.name" autocomplete="name" placeholder="Your name">
        <span v-if="fieldErrors.name" class="field-error">
          {{ fieldErrors.name[0] }}
        </span>

        <label>Email</label>
        <input v-model="fields.email" type="email" autocomplete="email" placeholder="you@example.com">
        <span v-if="fieldErrors.email" class="field-error">
          {{ fieldErrors.email[0] }}
        </span>

        <label>Password</label>
        <input v-model="fields.password" type="password" autocomplete="new-password" placeholder="Min 8 characters">
        <span v-if="fieldErrors.password" class="field-error">
          {{ fieldErrors.password[0] }}
        </span>

        <button type="submit" :disabled="isSubmitting || !isDirty">
          {{ isSubmitting ? 'Registering...' : 'Register' }}
        </button>
        <button type="button" :disabled="!isDirty" @click="reset()">
          Reset
        </button>
      </form>
    </section>

    <section v-if="error && !error.fieldErrors" class="error">
      {{ error.message }}
    </section>

    <section v-if="data">
      <h3>Registered!</h3>
      <pre>{{ JSON.stringify(data, null, 2) }}</pre>
    </section>

    <section>
      <span>isDirty:</span>
      <span>{{ isDirty }}</span>
      <span>isSubmitting:</span>
      <span>{{ isSubmitting }}</span>
      <span>status:</span>
      <span>{{ status }}</span>
      <span>fieldErrors:</span>
      <span>
        {{ Object.keys(fieldErrors).length > 0 ? JSON.stringify(fieldErrors) : '{}' }}
      </span>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- `initialValues` seeds `fields`, and `isDirty` turns true as soon as a value differs from it. Register and Reset stay disabled until then.
- `submit()` sends the current `fields`. When the schema rejects a field, its messages land in `fieldErrors` under the field name.
- `taken@example.com` passes the schema, but the handler throws `createActionError` with `fieldErrors.email`, so the message shows under the email input exactly like a schema error.
- The generic error block only renders when the error has no `fieldErrors`, so a field problem is never reported twice.
- `reset()` restores the initial values and clears errors, data, and status.

## Related

- Guide: [Form Actions](/guide/form-actions), [Error Handling](/guide/error-handling)
- API: [useFormAction](/api/use-form-action), [createActionError](/api/create-action-error)
