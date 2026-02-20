# Form Actions

Bind forms directly to server actions with field-level error mapping, dirty tracking, and reset.

::: tip Working example
See form validation in the [example /middleware page](https://github.com/billymaulana/nuxt-actions-example/blob/master/pages/middleware.vue) -- login form with field-level errors.
:::

## Quick Start

```vue
<script setup lang="ts">
import { register } from '#actions'

const { fields, submit, fieldErrors, isDirty, isSubmitting, reset } = useFormAction(register, {
  initialValues: { name: '', email: '', password: '' },
})
</script>

<template>
  <form @submit.prevent="submit()">
    <div>
      <input v-model="fields.name" placeholder="Name" />
      <span v-if="fieldErrors.name" class="error">{{ fieldErrors.name[0] }}</span>
    </div>
    <div>
      <input v-model="fields.email" type="email" placeholder="Email" />
      <span v-if="fieldErrors.email" class="error">{{ fieldErrors.email[0] }}</span>
    </div>
    <div>
      <input v-model="fields.password" type="password" placeholder="Password" />
      <span v-if="fieldErrors.password" class="error">{{ fieldErrors.password[0] }}</span>
    </div>
    <button type="submit" :disabled="isSubmitting || !isDirty">
      {{ isSubmitting ? 'Registering...' : 'Register' }}
    </button>
    <button type="button" @click="reset()" :disabled="!isDirty">Reset</button>
  </form>
</template>
```

## How It Works

`useFormAction` wraps `useAction` with form-specific features:

1. **Reactive fields** -- `fields` is a `reactive()` object, enabling direct `v-model` binding
2. **Field-level errors** -- Extracts `fieldErrors` from `VALIDATION_ERROR` responses automatically
3. **Dirty tracking** -- `isDirty` is `true` when any field differs from its initial value
4. **Reset** -- Restores all fields to initial values and clears errors

## Server Action with Validation Errors

For `fieldErrors` to work, your server action should return field-level errors using the `VALIDATION_ERROR` code:

```ts
// server/actions/register.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
  handler: async ({ input }) => {
    // Schema validation errors are automatically mapped to fieldErrors
    const user = await db.user.create(input)
    return { id: user.id, name: user.name }
  },
})
```

## API

See the [useFormAction API reference](/api/use-form-action) for full details.

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `initialValues` | `TInput` | Yes | Starting values for all form fields |
| `method` | `HttpMethod` | No | HTTP method (default: `'POST'`) |
| `headers` | `Record \| Function` | No | Request headers |
| `onSuccess` | `(data) => void` | No | Called on successful submission |
| `onError` | `(error) => void` | No | Called on any error |

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `fields` | `Reactive<TInput>` | Reactive form fields for v-model |
| `submit` | `() => Promise` | Submit current field values |
| `fieldErrors` | `ComputedRef<Record>` | Field-level validation errors |
| `isDirty` | `ComputedRef<boolean>` | Whether any field has changed |
| `isSubmitting` | `ComputedRef<boolean>` | Whether submission is in flight |
| `reset` | `() => void` | Reset fields and clear errors |
| `data` | `Ref<TOutput \| null>` | Last successful response |
| `error` | `Ref<ActionError \| null>` | Last error |
| `status` | `Ref<ActionStatus>` | Current status |

## Tips

- **isDirty** uses deep comparison -- nested object changes are detected
- **reset()** also clears the underlying `useAction` state (errors, status)
- **submit()** deep-clones fields before sending to prevent Vue proxy issues
- Field errors are cleared automatically when you call `reset()` or when the next submission succeeds
