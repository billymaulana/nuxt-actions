# Cache Invalidation

`useActionMutation` runs a write action and, on success, automatically refetches
the `useActionQuery` caches it affects. Targets are typed action references
(type-safe) or string tags (for grouping across actions).

## Tagging queries

```ts
import { listTodos, searchTodos } from '#actions'

useActionQuery(listTodos, undefined, { tags: ['todos'] })
useActionQuery(searchTodos, () => ({ q: query.value }), { tags: ['todos'] })
```

## Mutating with auto-invalidation

```ts
import { createTodo, listTodos } from '#actions'

const { execute, data, status } = useActionMutation(createTodo, {
  invalidates: [listTodos, 'todos'], // reference and/or tag
})

await execute({ title: 'Buy milk' }) // listTodos + every 'todos' query refetch
```

In `invalidates`, an object is an action reference and a string is a tag. By
default `execute()` resolves after the refetch completes; set
`awaitInvalidation: false` for fire-and-forget.

`useActionMutation` returns the same shape as [`useAction`](/guide/use-action) —
`execute`, `executeAsync`, `data`, `error`, `status`, and `reset`.

## Manual invalidation

```ts
import { listTodos, searchTodos } from '#actions'

await invalidateActions(listTodos)               // by reference/path
await invalidateActions([listTodos, searchTodos]) // multiple
await invalidateTags('todos')                    // by tag
await invalidateTags(['todos', 'user'])
```
