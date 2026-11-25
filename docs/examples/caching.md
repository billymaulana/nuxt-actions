---
title: Server Cache
description: Cache a slow GET action on the server with the cache option, and drop the stored result after a write with invalidateActionCache.
---

# Server Cache

The report action takes about 800 ms. With `cache: { maxAge: 30 }`, the first request runs it and every request in the next 30 seconds gets the stored result, which comes back in a few milliseconds. A second action drops the stored result with `invalidateActionCache`, so the next request runs the handler again.

<ExampleSource page="pages/caching.vue" />

## Server actions

::: code-group

```ts [server/actions/cached-report.get.ts]
import { z } from 'zod'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default defineAction({
  input: z.object({}).optional(),
  cache: { maxAge: 30 },
  handler: async () => {
    const startedAt = Date.now()
    await delay(800)
    return { generatedAt: new Date().toISOString(), tookMs: Date.now() - startedAt }
  },
})
```

```ts [server/actions/refresh-report.post.ts]
export default defineAction({
  handler: async () => {
    await invalidateActionCache('cached-report')
    return { invalidated: true }
  },
})
```

:::

## Page

```vue [pages/caching.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { cachedReport, refreshReport } from '#actions'

const roundTripMs = ref<number | null>(null)

const report = useAction(cachedReport)

async function loadReport() {
  const startedAt = performance.now()
  await report.execute()
  roundTripMs.value = Math.round(performance.now() - startedAt)
}

const refresh = useAction(refreshReport, {
  onSuccess: () => loadReport(),
})
</script>

<template>
  <div>
    <section>
      <button :disabled="report.isExecuting.value" @click="loadReport">
        {{ report.isExecuting.value ? 'Loading…' : 'Load report' }}
      </button>
      <button :disabled="refresh.isExecuting.value || report.isExecuting.value" @click="refresh.execute()">
        Invalidate and reload
      </button>

      <div v-if="report.data.value" class="success">
        Generated at {{ new Date(report.data.value.generatedAt).toLocaleTimeString() }}.
        The handler took {{ report.data.value.tookMs }} ms; this request took {{ roundTripMs }} ms.
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- Only `GET` and `HEAD` requests are cached, and only successful results are stored. The action file name ends in `.get.ts`, so `useAction` sends a GET.
- `cache` needs an input schema, even though the report takes no input. `z.object({}).optional()` drops query parameters the action does not know, so `?anything=1` cannot create a new cache entry and run the slow handler again, and `.optional()` keeps `execute()` callable without an argument.
- The cache sits after input validation and middleware. An action with authentication or a rate limit would still run both on every request; a hit only skips the handler.
- "Generated at" stays the same while the result comes from the cache, and the round trip drops from about 800 ms to a few milliseconds.
- `invalidateActionCache('cached-report')` takes the action path, the file path under `server/actions/` without the method suffix, and removes every stored result of that action. Pass `{ key }` or `{ input }` to remove less.
- The report takes no input, so `report.execute()` is called without an argument.
- The demo keeps the cache in the server's memory. On several instances or serverless functions, use a shared store with `setActionCacheStore`.

## Related

- Guide: [Caching](/guide/caching)
- API: [defineAction](/api/define-action), [useAction](/api/use-action)
