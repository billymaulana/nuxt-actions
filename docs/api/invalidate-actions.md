# Cache Invalidation

Utilities to refetch or clear cached data from `useActionQuery`. Useful when a mutation should update related query data.

## invalidateActions()

Refetch cached action query data. Calls `refreshNuxtData()` internally with a predicate that matches action cache keys.

### Signature

```ts
function invalidateActions(actionOrPath?: TypedActionReference | string): Promise<void>
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `actionOrPath` | `TypedActionReference \| string` | No | Specific action to invalidate. If omitted, all action queries are refetched. |

### Examples

```ts
import { createTodo, listTodos } from '#actions'

// Invalidate a specific action query (typed reference)
invalidateActions(listTodos)

// Invalidate by string path
invalidateActions('/api/todos')

// Invalidate ALL action queries
invalidateActions()
```

### Typical Pattern

```ts
const { execute } = useAction(createTodo)

async function handleCreate(title: string) {
  const result = await execute({ title })
  if (result.success) {
    // Refetch the list query so it includes the new item
    invalidateActions(listTodos)
  }
}
```

---

## clearActionCache()

Clear cached action query data without refetching. Calls `clearNuxtData()` internally with a predicate that matches action cache keys.

### Signature

```ts
function clearActionCache(actionOrPath?: TypedActionReference | string): void
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `actionOrPath` | `TypedActionReference \| string` | No | Specific action to clear. If omitted, all action query caches are cleared. |

### Examples

```ts
import { listTodos } from '#actions'

// Clear a specific action query cache
clearActionCache(listTodos)

// Clear by string path
clearActionCache('/api/todos')

// Clear ALL action query caches
clearActionCache()
```

---

## Cache Key Format

Action queries use the key format `action:{path}:{stableHash}`. The invalidation utilities match by prefix:

- **With argument:** Matches keys starting with `action:{resolvedPath}:`
- **Without argument:** Matches all keys starting with `action:`

For typed action references, the path is resolved from the reference's `__actionPath` property. For string paths, it is normalized to the full route (e.g., `/api/_actions/todos.get`).

---

## Auto-Import

Both `invalidateActions` and `clearActionCache` are auto-imported in all Vue components and composables when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [useActionQuery](/api/use-action-query) -- SSR query composable that caches data
- [useAction](/api/use-action) -- Standard action composable for mutations
