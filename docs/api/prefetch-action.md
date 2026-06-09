# prefetchAction()

Pre-warm the Nuxt data cache for an action query. Fetches the result and stores it under the same cache key that `useActionQuery` uses, so when the composable mounts it skips the initial network request.

## Type Signature

```ts
// Overload 1: Typed reference (E2E inference)
function prefetchAction<T extends TypedActionReference>(
  action: T,
  input?: MaybeRefOrGetter<InferActionInput<T>>,
): Promise<InferActionOutput<T> | null>

// Overload 2: String path (manual generics)
function prefetchAction<TInput = void, TOutput = unknown>(
  path: string,
  input?: MaybeRefOrGetter<TInput>,
): Promise<TOutput | null>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `TypedActionReference \| string` | Typed action reference or manual API path |
| `input` | `MaybeRefOrGetter<T>` | Input data for the action |

### Return Value

- **Type:** `Promise<TOutput | null>`
- **Description:** The prefetched data, or `null` if the fetch fails. Prefetching is best-effort -- failures are silently ignored.

---

## Behavior

1. Generates the same cache key that `useActionQuery` would use
2. If data is already cached under that key, returns it immediately (no network request)
3. Otherwise, fetches the data and stores it in both `nuxtApp.payload.data` and `nuxtApp.static.data`
4. When `useActionQuery` mounts later, it finds the cached data and skips the initial fetch

---

## Examples

### Prefetch on Hover

```vue
<script setup lang="ts">
import { getUserProfile } from '#actions'

async function onHover(userId: number) {
  await prefetchAction(getUserProfile, { id: userId })
}
</script>

<template>
  <NuxtLink
    v-for="user in users"
    :key="user.id"
    :to="`/users/${user.id}`"
    @mouseenter="onHover(user.id)"
  >
    {{ user.name }}
  </NuxtLink>
</template>
```

### Prefetch Without Input

```ts
import { listTodos } from '#actions'

// Prefetch the list during idle time
await prefetchAction(listTodos)
```

### Prefetch with String Path

```ts
await prefetchAction('/api/todos')
```

---

## Auto-Import

`prefetchAction` is auto-imported in all Vue components when the module is installed.

## See Also

- [useActionQuery](/api/use-action-query) -- SSR query composable (consumes the prefetched cache)
- [Cache Invalidation](/api/invalidate-actions) -- Clear cached data
