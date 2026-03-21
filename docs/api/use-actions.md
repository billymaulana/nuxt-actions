# useActions()

Composable for batch / parallel execution of multiple server actions. Runs all actions with corresponding inputs using `Promise.allSettled` (parallel) or sequentially.

## Type Signature

```ts
function useActions(
  actions: (TypedActionReference | string)[],
  options?: UseActionsOptions,
): UseActionsReturn
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `actions` | `(TypedActionReference \| string)[]` | Array of action references or paths |
| `options` | `UseActionsOptions` | Execution mode configuration |

---

## Options

```ts
interface UseActionsOptions {
  mode?: 'parallel' | 'sequential'
}
```

### `mode`

- **Type:** `'parallel' | 'sequential'`
- **Default:** `'parallel'`
- **Description:** In `parallel` mode (default), all actions run concurrently via `Promise.allSettled`. In `sequential` mode, actions run one after another in order.

---

## Return Value

```ts
interface UseActionsReturn {
  execute: (inputs: unknown[]) => Promise<ActionResult<unknown>[]>
  pending: Readonly<Ref<boolean>>
  results: Readonly<Ref<(ActionResult<unknown> | null)[]>>
  errors: Readonly<Ref<(ActionError | null)[]>>
  hasErrors: ComputedRef<boolean>
}
```

### `execute`

- **Type:** `(inputs: unknown[]) => Promise<ActionResult<unknown>[]>`
- **Description:** Execute all actions with corresponding inputs. The `inputs` array must match the length of the `actions` array.

### `pending`

- **Type:** `Readonly<Ref<boolean>>`
- **Description:** `true` while any action is executing.

### `results`

- **Type:** `Readonly<Ref<(ActionResult<unknown> | null)[]>>`
- **Description:** Results for each action. Indices match the `actions` array.

### `errors`

- **Type:** `Readonly<Ref<(ActionError | null)[]>>`
- **Description:** Errors for each action. `null` for successful actions.

### `hasErrors`

- **Type:** `ComputedRef<boolean>`
- **Description:** `true` if any action failed.

---

## Examples

### Parallel Execution

```ts
import { createTodo, notifyUser } from '#actions'

const { execute, pending, results, hasErrors } = useActions([createTodo, notifyUser])

async function createAndNotify() {
  const results = await execute([
    { title: 'Buy milk' },
    { userId: 1, message: 'Todo created' },
  ])

  if (!hasErrors.value) {
    toast.success('All actions completed')
  }
}
```

### Sequential Execution

```ts
import { validateData, processData, sendNotification } from '#actions'

const { execute, pending } = useActions(
  [validateData, processData, sendNotification],
  { mode: 'sequential' },
)

// Actions run in order — each waits for the previous to complete
await execute([
  { data: payload },
  { data: payload },
  { type: 'success' },
])
```

### Checking Individual Results

```ts
const { execute, results, errors } = useActions([actionA, actionB])

await execute([inputA, inputB])

// Check each result
results.value.forEach((result, i) => {
  if (result?.success) {
    console.log(`Action ${i} succeeded:`, result.data)
  }
})

// Check errors
errors.value.forEach((error, i) => {
  if (error) {
    console.error(`Action ${i} failed:`, error.message)
  }
})
```

---

## Auto-Import

`useActions` is auto-imported in all Vue components when the module is installed.

## See Also

- [useAction](/api/use-action) -- Single action composable
- [Batch Actions Guide](/guide/batch-actions) -- Usage guide
- [Types Reference](/api/types) -- Full type definitions
