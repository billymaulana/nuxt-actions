# SSR Action Queries

`useActionQuery` wraps Nuxt's `useAsyncData` to provide SSR-capable GET action queries with caching and reactive re-fetching.

::: tip Working example
See SSR queries in the [example /queries page](https://github.com/billymaulana/nuxt-actions-example/blob/master/pages/queries.vue) -- server-rendered data with reactive search.
:::

## Basic Usage

```vue
<script setup lang="ts">
import { listTodos } from '#actions'

const { data, pending, refresh } = useActionQuery(listTodos)
</script>

<template>
  <div v-if="pending">Loading...</div>
  <ul v-else>
    <li v-for="todo in data" :key="todo.id">{{ todo.title }}</li>
  </ul>
</template>
```

## Reactive Input

When input is a ref or getter, the query re-fetches automatically when it changes:

```vue
<script setup lang="ts">
import { searchTodos } from '#actions'

const query = ref('')
const { data, pending } = useActionQuery(searchTodos, () => ({ q: query.value }))
</script>

<template>
  <input v-model="query" placeholder="Search...">
  <ul>
    <li v-for="todo in data" :key="todo.id">{{ todo.title }}</li>
  </ul>
</template>
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `server` | `boolean` | `true` | Fetch on server during SSR |
| `lazy` | `boolean` | `false` | Don't block navigation |
| `immediate` | `boolean` | `true` | Execute immediately |
| `default` | `() => T` | - | Default value factory |

### Lazy Loading

```ts
const { data, pending } = useActionQuery(listTodos, undefined, {
  lazy: true, // Don't block navigation
})
```

### Default Values

```ts
const { data } = useActionQuery(listTodos, undefined, {
  default: () => [], // Start with empty array
})
```

## Return Value

| Property | Type | Description |
|----------|------|-------------|
| `data` | `ComputedRef<T \| null>` | Unwrapped success data |
| `error` | `ComputedRef<ActionError \| null>` | Error if failed |
| `status` | `Ref<AsyncDataStatus>` | Nuxt async data status |
| `pending` | `Ref<boolean>` | Whether a request is in progress |
| `refresh` | `() => Promise<void>` | Re-fetch the data |
| `clear` | `() => void` | Clear the cached data |

## How It Works

1. **SSR**: Data is fetched on the server and hydrated on the client
2. **Caching**: Requests with the same key are deduplicated
3. **Reactive**: When input changes, the query re-fetches automatically
4. **Unwrapping**: `ActionResult<T>` is automatically unwrapped — `data` gives you `T` directly

## Server Action Setup

Define a GET action on the server:

```ts
// server/actions/list-todos.get.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    q: z.string().optional(),
  }),
  handler: async ({ input }) => {
    return await db.todo.findMany({
      where: input.q ? { title: { contains: input.q } } : undefined,
    })
  },
})
```
