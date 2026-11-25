---
title: Resilience
description: Retry a flaky endpoint with exponential backoff and jitter, abort stale type-ahead requests with cancelPrevious, and cancel an in-flight call.
---

# Resilience

Two client-side patterns for unreliable networks. The first retries a failing call with growing delays instead of hammering the server. The second keeps a type-ahead search consistent: every keystroke aborts the request before it, so an old response can never replace a newer one.

<ExampleSource page="pages/resilience.vue" />

## Server actions

::: code-group

```ts [server/actions/flaky-api.post.ts]
import { z } from 'zod'

let callCount = 0

export default defineAction({
  input: z.object({
    message: z.string().min(1),
  }),
  handler: async ({ input }) => {
    callCount++
    const attempt = callCount

    if (attempt % 3 !== 0) {
      throw createActionError({
        code: 'TEMPORARY_FAILURE',
        message: `Flaky API failed (attempt ${attempt})`,
        statusCode: 503,
      })
    }

    return {
      message: input.message,
      attempt,
      timestamp: new Date().toISOString(),
    }
  },
})
```

```ts [server/actions/search-todos.get.ts]
import { z } from 'zod'

const allTodos = [
  { id: 1, title: 'Learn Nuxt', done: true },
  { id: 2, title: 'Build app', done: false },
  { id: 3, title: 'Write tests', done: false },
  { id: 4, title: 'Deploy to production', done: false },
  { id: 5, title: 'Set up CI/CD', done: true },
]

export default defineAction({
  input: z.object({
    q: z.string().optional().default(''),
  }),
  handler: async ({ input }) => {
    const q = input.q.toLowerCase()
    const items = q
      ? allTodos.filter(t => t.title.toLowerCase().includes(q))
      : allTodos

    return { items, total: items.length }
  },
})
```

:::

## Page

```vue [pages/resilience.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { flakyApi, searchTodos } from '#actions'

const retried = useAction(flakyApi, {
  retry: {
    count: 3,
    delay: 200,
    backoff: 'exponential',
    maxDelay: 2000,
    jitter: true,
    statusCodes: [503],
  },
})

const query = ref('')
const search = useAction(searchTodos, { cancelPrevious: true })

async function onType() {
  const result = await search.execute({ q: query.value })
  if (!result.success && isActionError(result.error) && result.error.code === 'ABORT_ERROR') {
    /* superseded by a newer keystroke — ignore */
  }
}
</script>

<template>
  <div>
    <section>
      <h2>Exponential backoff on a flaky endpoint</h2>
      <button
        :disabled="retried.isExecuting.value"
        @click="retried.execute({ message: 'sync' })"
      >
        {{ retried.isExecuting.value ? 'Retrying…' : 'Call flaky endpoint' }}
      </button>
      <div v-if="retried.data.value" class="success">
        Succeeded on server attempt {{ retried.data.value.attempt }}
      </div>
      <div v-if="retried.error.value" class="error">
        {{ retried.error.value.code }}: {{ retried.error.value.message }}
      </div>
    </section>

    <section>
      <h2>Type-ahead search that never shows stale results</h2>
      <input v-model="query" placeholder="Type fast: nuxt, build, test…" @input="onType">
      <button @click="search.cancel()">
        cancel()
      </button>
      <div v-if="search.data.value">
        <div v-for="todo in search.data.value.items" :key="todo.id">
          {{ todo.title }}
        </div>
        <p v-if="search.data.value.items.length === 0">
          No matches.
        </p>
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- The flaky action throws a 503 `TEMPORARY_FAILURE` on two calls out of three. Its counter lives at module level, so it is shared by every client and by the [Advanced Features](/examples/advanced) example.
- `retry` allows three retries, only for status 503. With `backoff: 'exponential'` the base delay doubles per attempt (200 ms, then 400 ms), `maxDelay` caps a single wait at 2 s, and `jitter` picks a random wait between half and all of that delay.
- `isExecuting` stays true across the retries, so the button reads "Retrying…" until the final result.
- `cancelPrevious: true` aborts the in-flight search whenever `execute()` runs again. The aborted call resolves with an `ABORT_ERROR` result instead of throwing, which `onType` checks for and ignores.
- `cancel()` aborts the current request without clearing `data` or `error`.

## Related

- Guide: [useAction](/guide/use-action), [Error Handling](/guide/error-handling)
- API: [useAction](/api/use-action)
