# useFormAction()

A Vue composable that wraps `useAction` with form-specific features: reactive fields for `v-model`, field-level validation error extraction, dirty tracking, and reset.

## Type Signature

```ts
// With typed action reference
function useFormAction<T extends TypedActionReference>(
  action: T,
  options: UseFormActionOptions<InferActionInput<T>, InferActionOutput<T>>,
): UseFormActionReturn<InferActionInput<T>, InferActionOutput<T>>

// With string path
function useFormAction<TInput = void, TOutput = unknown>(
  path: string,
  options: UseFormActionOptions<TInput, TOutput>,
): UseFormActionReturn<TInput, TOutput>
```

### Type Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TInput` | `void` | The shape of the form fields (inferred from `initialValues`). |
| `TOutput` | `unknown` | The expected data type on a successful submission. |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` / `path` | `TypedActionReference` or `string` | Yes | A typed action reference from `#actions` or an API route path. |
| `options` | `UseFormActionOptions<TInput, TOutput>` | Yes | Configuration including `initialValues`. |

---

## Options

```ts
interface UseFormActionOptions<TInput, TOutput> {
  initialValues: TInput
  method?: HttpMethod
  headers?: Record<string, string> | (() => Record<string, string>)
  retry?: boolean | number | RetryConfig
  timeout?: number
  dedupe?: 'cancel' | 'defer'
  onSuccess?: (data: TOutput) => void
  onError?: (error: ActionError) => void
  onSettled?: (result: ActionResult<TOutput>) => void
}
```

### `initialValues`

- **Type:** `TInput`
- **Required:** Yes
- **Description:** Starting values for all form fields. Deep-cloned internally so the original object is never mutated. Also used as the snapshot for `isDirty` comparison and `reset()`.

```ts
const { fields } = useFormAction('/api/register', {
  initialValues: { name: '', email: '', password: '' },
})
```

### `method`

- **Type:** `HttpMethod` (`'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'`)
- **Default:** `'POST'`
- **Description:** The HTTP method used for form submission.

### `headers`

- **Type:** `Record<string, string> | (() => Record<string, string>)`
- **Required:** No
- **Description:** Static headers or a function returning headers. The function form is called per-request, useful for fresh auth tokens.

### `retry`

- **Type:** `boolean | number | RetryConfig`
- **Required:** No
- **Description:** Retry configuration for failed submissions. See [useAction retry](/api/use-action#retry) for full details.

### `timeout`

- **Type:** `number`
- **Required:** No
- **Description:** Request timeout in milliseconds. Aborts the submission if exceeded.

### `dedupe`

- **Type:** `'cancel' | 'defer'`
- **Required:** No
- **Description:** Deduplication strategy for rapid submissions. `'cancel'` aborts the previous in-flight request. `'defer'` returns the existing promise.

### `onSuccess`

- **Type:** `(data: TOutput) => void`
- **Description:** Called when the server returns a successful result. Field errors are automatically cleared.

### `onError`

- **Type:** `(error: ActionError) => void`
- **Description:** Called when the server returns an error or a network error occurs.

### `onSettled`

- **Type:** `(result: ActionResult<TOutput>) => void`
- **Description:** Called after every submission, regardless of outcome. Fires after `onSuccess` or `onError`.

---

## Return Value

```ts
interface UseFormActionReturn<TInput, TOutput> {
  fields: TInput
  submit: () => Promise<ActionResult<TOutput>>
  fieldErrors: ComputedRef<Record<string, string[]>>
  isDirty: ComputedRef<boolean>
  isSubmitting: ComputedRef<boolean>
  reset: () => void
  data: Readonly<Ref<TOutput | null>>
  error: Readonly<Ref<ActionError | null>>
  status: Readonly<Ref<ActionStatus>>
}
```

### `fields`

- **Type:** `Reactive<TInput>`
- **Description:** A `reactive()` object with the same shape as `initialValues`. Bind directly with `v-model`:

```vue
<input v-model="fields.name" />
<input v-model="fields.email" type="email" />
```

### `submit()`

- **Type:** `() => Promise<ActionResult<TOutput>>`
- **Description:** Submit the current field values to the server. Deep-clones fields before sending to prevent Vue proxy issues. Returns the full `ActionResult`.

```ts
const result = await submit()
if (result.success) {
  router.push('/dashboard')
}
```

### `fieldErrors`

- **Type:** `ComputedRef<Record<string, string[]>>`
- **Description:** Field-level validation errors extracted from `VALIDATION_ERROR` responses. Keys match field names, values are arrays of error messages. Empty object `{}` when there are no field errors.

```vue
<span v-if="fieldErrors.email" class="error">
  {{ fieldErrors.email[0] }}
</span>
```

### `isDirty`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` when any field differs from its initial value. Uses deep comparison — nested object changes are detected.

### `isSubmitting`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` while a submission is in flight. Alias for the underlying `isExecuting` state.

### `reset()`

- **Type:** `() => void`
- **Description:** Restore all fields to their initial values and clear errors, data, and status. Also clears the underlying `useAction` state.

### `data`

- **Type:** `Ref<TOutput | null>`
- **Description:** Reactive reference to the last successful response data.

### `error`

- **Type:** `Ref<ActionError | null>`
- **Description:** Reactive reference to the last error.

### `status`

- **Type:** `Ref<ActionStatus>`
- **Description:** Current status: `'idle'` | `'executing'` | `'success'` | `'error'`.

---

## Examples

### Registration Form

```vue
<script setup lang="ts">
import { register } from '#actions'

const { fields, submit, fieldErrors, isDirty, isSubmitting, reset } = useFormAction(register, {
  initialValues: { name: '', email: '', password: '' },
  onSuccess(user) {
    toast.success(`Welcome, ${user.name}!`)
    router.push('/dashboard')
  },
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

### Edit Form with String Path

```vue
<script setup lang="ts">
const props = defineProps<{ todo: { id: number; title: string; done: boolean } }>()

const { fields, submit, fieldErrors, isDirty, isSubmitting } = useFormAction<
  { title: string; done: boolean },
  { id: number; title: string; done: boolean }
>(`/api/todos/${props.todo.id}`, {
  method: 'PUT',
  initialValues: { title: props.todo.title, done: props.todo.done },
  onSuccess(updated) {
    toast.success(`Updated: ${updated.title}`)
  },
})
</script>

<template>
  <form @submit.prevent="submit()">
    <input v-model="fields.title" />
    <label>
      <input v-model="fields.done" type="checkbox" />
      Done
    </label>
    <button type="submit" :disabled="isSubmitting || !isDirty">Save</button>
  </form>
</template>
```

### Inspecting Submit Result

```ts
const { fields, submit } = useFormAction(register, {
  initialValues: { name: '', email: '' },
})

async function handleSubmit() {
  const result = await submit()
  if (result.success) {
    // Navigate or update state
    navigateTo('/profile')
  } else {
    // Result.error is ActionError
    console.log(result.error.code, result.error.fieldErrors)
  }
}
```

---

## Auto-Import

`useFormAction` is auto-imported in all Vue components and composables when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [Form Actions Guide](/guide/form-actions) -- Guide with patterns and tips
- [useAction](/api/use-action) -- Underlying composable
- [Types Reference](/api/types) -- `UseFormActionOptions`, `UseFormActionReturn`
