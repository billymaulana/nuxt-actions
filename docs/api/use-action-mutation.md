# useActionMutation()

Run a write action and, on success, automatically refetch the `useActionQuery` caches it affects. Targets are typed action references (type-safe) or string tags (for grouping across actions).

## Signature

```ts
function useActionMutation<T extends TypedActionReference>(
  action: T,
  options?: UseActionMutationOptions<InferActionInput<T>, InferActionOutput<T>>,
): UseActionReturn<InferActionInput<T>, InferActionOutput<T>>

function useActionMutation<TInput = void, TOutput = unknown>(
  path: string,
  options?: UseActionMutationOptions<TInput, TOutput>,
): UseActionReturn<TInput, TOutput>
```

## Options

`UseActionMutationOptions` extends every [`useAction`](/api/use-action) option and adds:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `invalidates` | `Array<TypedActionReference \| string>` | `[]` | Queries to refetch on success. Objects are typed action references; strings are tags. |
| `awaitInvalidation` | `boolean` | `true` | When `true`, `execute()` resolves after the refetch completes. Set `false` for fire-and-forget. |

## Returns

The same shape as [`useAction`](/api/use-action) — `execute`, `executeAsync`, `data`, `error`, `status`, `isExecuting`, `reset`, and the status flags. `execute()` runs the action, then invalidates the declared targets when the result is successful.

## Examples

### Reference and tag targets

```ts
import { createTodo, listTodos } from '#actions'

const { execute, isExecuting } = useActionMutation(createTodo, {
  invalidates: [listTodos, 'todos'], // typed reference and/or tag
})

await execute({ title: 'Buy milk' }) // listTodos + every 'todos' query refetch
```

### Tagging queries so a mutation can target them

```ts
import { listTodos, searchTodos } from '#actions'

useActionQuery(listTodos, undefined, { tags: ['todos'] })
useActionQuery(searchTodos, () => ({ q: query.value }), { tags: ['todos'] })
```

A single `invalidates: ['todos']` then refetches both queries above.

### Fire-and-forget invalidation

```ts
const { execute } = useActionMutation(toggleTodo, {
  invalidates: ['todos'],
  awaitInvalidation: false, // execute() resolves immediately; refetch runs in background
})
```

## Auto-Import

`useActionMutation` is auto-imported in all Vue components and composables when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [Cache Invalidation guide](/guide/cache-invalidation) — the full tagging + mutation workflow
- [useActionQuery](/api/use-action-query) — the query composable, including the `tags` option
- [Cache Invalidation utilities](/api/invalidate-actions) — `invalidateActions`, `invalidateTags`, `clearActionCache`
