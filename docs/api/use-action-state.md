# useActionState()

Composable for progressive enhancement with HTML forms. Wraps `useAction` internally and provides a `formAction` handler that converts `FormData` to a plain object before executing.

## Type Signature

```ts
// Overload 1: Typed reference (E2E inference)
function useActionState<T extends TypedActionReference>(
  action: T,
  options?: UseActionStateOptions<InferActionOutput<T>>,
): UseActionStateReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: String path (manual generics)
function useActionState<TInput = void, TOutput = unknown>(
  path: string,
  options?: UseActionStateOptions<TOutput>,
): UseActionStateReturn<TInput, TOutput>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `TypedActionReference \| string` | Typed action reference from `#actions` or a manual API path |
| `options` | `UseActionStateOptions` | Configuration options |

---

## Options

```ts
interface UseActionStateOptions<TOutput> {
  initialState?: TOutput | null
}
```

### `initialState`

- **Type:** `TOutput | null`
- **Default:** `null`
- **Description:** Initial state value before any action has completed.

---

## Return Value

```ts
interface UseActionStateReturn<TInput, TOutput> {
  state: Readonly<Ref<TOutput | null>>
  error: Readonly<Ref<ActionError | null>>
  pending: Readonly<Ref<boolean>>
  formAction: (formData: FormData) => Promise<void>
  formProps: ComputedRef<{ action: string, method: string }>
}
```

### `state`

- **Type:** `Readonly<Ref<TOutput | null>>`
- **Description:** Updated after each successful action execution with the server response data.

### `error`

- **Type:** `Readonly<Ref<ActionError | null>>`
- **Description:** Last error from the action execution.

### `pending`

- **Type:** `Readonly<Ref<boolean>>`
- **Description:** `true` while the action is executing.

### `formAction`

- **Type:** `(formData: FormData) => Promise<void>`
- **Description:** Submit handler that converts `FormData` to a plain object and executes the action. Multi-value fields (e.g. checkboxes) are converted to arrays.

### `formProps`

- **Type:** `ComputedRef<{ action: string, method: string }>`
- **Description:** Bind to `<form>` via `v-bind` for progressive enhancement (native form fallback when JavaScript is unavailable).

---

## Examples

### Basic Form

```vue
<script setup lang="ts">
import { createTodo } from '#actions'

const { state, error, pending, formAction } = useActionState(createTodo)
</script>

<template>
  <form @submit.prevent="formAction(new FormData($event.target as HTMLFormElement))">
    <input name="title" placeholder="What needs to be done?" />
    <button :disabled="pending">
      {{ pending ? 'Creating...' : 'Create' }}
    </button>
  </form>

  <p v-if="state">Created: {{ state.title }}</p>
  <p v-if="error" class="error">{{ error.message }}</p>
</template>
```

### Progressive Enhancement

```vue
<script setup lang="ts">
import { createTodo } from '#actions'

const { formProps, formAction, state, pending } = useActionState(createTodo)
</script>

<template>
  <!-- v-bind="formProps" provides action/method for native form fallback -->
  <form
    v-bind="formProps"
    @submit.prevent="formAction(new FormData($event.target as HTMLFormElement))"
  >
    <input name="title" required />
    <button :disabled="pending">Create</button>
  </form>
</template>
```

### With Initial State

```ts
import { createTodo } from '#actions'

const { state } = useActionState(createTodo, {
  initialState: { id: 0, title: '' },
})

// state.value starts as { id: 0, title: '' } instead of null
```

---

## Auto-Import

`useActionState` is auto-imported in all Vue components when the module is installed.

## See Also

- [useFormAction](/api/use-form-action) -- Form composable with field-level errors and dirty tracking
- [useAction](/api/use-action) -- General-purpose action composable
- [Form Actions Guide](/guide/form-actions) -- Usage guide
