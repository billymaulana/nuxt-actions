# Batch Actions

`useActions` lets you execute multiple server actions in a single call, either in parallel (default) or sequentially. This is useful for multi-step workflows, form submissions that trigger multiple backend operations, or aggregating data from several sources.

## Basic Usage

### Parallel Execution

By default, all actions run concurrently via `Promise.allSettled`:

```vue
<script setup lang="ts">
import { createTodo, sendNotification } from '#actions'

const { execute, pending, hasErrors } = useActions([createTodo, sendNotification])

async function createAndNotify() {
  await execute([
    { title: 'Buy milk' },
    { userId: 1, message: 'New todo created' },
  ])

  if (!hasErrors.value) {
    toast.success('Todo created and notification sent')
  }
}
</script>

<template>
  <button :disabled="pending" @click="createAndNotify">
    {{ pending ? 'Processing...' : 'Create & Notify' }}
  </button>
</template>
```

### Sequential Execution

Use `mode: 'sequential'` when actions must run in order:

```ts
import { validateOrder, processPayment, sendReceipt } from '#actions'

const { execute, pending, errors } = useActions(
  [validateOrder, processPayment, sendReceipt],
  { mode: 'sequential' },
)

// Each action waits for the previous one to complete
await execute([
  { orderId: 123 },
  { orderId: 123, amount: 99.99 },
  { orderId: 123, email: 'user@example.com' },
])
```

## Return Values

### Checking Results

```ts
const { execute, results, errors, hasErrors } = useActions([actionA, actionB])

await execute([inputA, inputB])

// Check individual results
if (results.value[0]?.success) {
  console.log('Action A succeeded:', results.value[0].data)
}

// Check for any errors
if (hasErrors.value) {
  errors.value.forEach((error, i) => {
    if (error) {
      console.error(`Action ${i} failed:`, error.message)
    }
  })
}
```

### Error Handling

In parallel mode, one action failing does not prevent others from completing:

```ts
const { execute, results } = useActions([actionA, actionB, actionC])

const allResults = await execute([inputA, inputB, inputC])
// allResults[0] might succeed while allResults[1] fails

// Process partial successes
allResults.forEach((result, i) => {
  if (result.success) {
    console.log(`Action ${i}: ${result.data}`)
  } else {
    console.error(`Action ${i}: ${result.error.message}`)
  }
})
```

## Use Cases

### Dashboard Data Aggregation

Fetch data from multiple sources simultaneously:

```ts
import { getStats, getRecentActivity, getNotifications } from '#actions'

const { execute, results, pending } = useActions([
  getStats,
  getRecentActivity,
  getNotifications,
])

await execute([{}, { limit: 10 }, { unread: true }])

const stats = results.value[0]?.success ? results.value[0].data : null
const activity = results.value[1]?.success ? results.value[1].data : null
const notifications = results.value[2]?.success ? results.value[2].data : null
```

### Multi-Step Form Submission

Submit to multiple endpoints in sequence:

```ts
import { createUser, assignRole, sendWelcomeEmail } from '#actions'

const { execute, errors, hasErrors } = useActions(
  [createUser, assignRole, sendWelcomeEmail],
  { mode: 'sequential' },
)

async function onSubmit(form: UserForm) {
  await execute([
    { name: form.name, email: form.email },
    { userId: form.userId, role: form.role },
    { email: form.email },
  ])

  if (hasErrors.value) {
    // Show which step failed
    const failedStep = errors.value.findIndex(Boolean)
    toast.error(`Step ${failedStep + 1} failed: ${errors.value[failedStep]?.message}`)
  }
}
```

## Next Steps

- [useActions API](/api/use-actions) -- Full API reference
- [useAction](/guide/use-action) -- Single action composable
