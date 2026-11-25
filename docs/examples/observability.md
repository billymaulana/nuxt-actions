---
title: Observability
description: Log every action call from one place with the action:start, success, error, and settled hooks, and call a nested action through the grouped namespace.
---

# Observability

Every client call fires runtime hooks on `nuxtApp`: `action:start`, then `action:success` or `action:error`, then `action:settled`. Subscribing once gives you analytics, latency tracking, or error toasts for the whole app, without callbacks in each component. This page writes each hook event to a log, and calls `server/actions/admin/metrics.get.ts` through the grouped `actions` object.

<ExampleSource page="pages/observability.vue" />

## Server actions

::: code-group

```ts [server/actions/admin/metrics.get.ts]
export default defineAction({
  handler: async () => {
    return {
      activeUsers: 1284,
      requestsToday: 98231,
      p95LatencyMs: 142,
    }
  },
})
```

```ts [server/actions/create-todo.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return {
      id: Date.now(),
      title: input.title,
      done: false,
    }
  },
})
```

:::

## Page

```vue [pages/observability.vue]
<script setup lang="ts">
import { ref, onScopeDispose } from 'vue'
import { useNuxtApp } from '#app'
import { actions, createTodo } from '#actions'

const nuxtApp = useNuxtApp()
const events = ref<string[]>([])

function record(line: string) {
  events.value.unshift(`${new Date().toLocaleTimeString()}  ${line}`)
}

const unhooks = [
  nuxtApp.hook('action:start', p => record(`start    ${p.method} ${p.path}`)),
  nuxtApp.hook('action:success', p => record(`success  ${p.path} (${p.durationMs}ms)`)),
  nuxtApp.hook('action:error', p =>
    record(`error    ${p.path} ${p.error.code} (${p.durationMs}ms)`)),
  nuxtApp.hook('action:settled', p =>
    record(`settled  ${p.path} success=${p.result.success}`)),
]
onScopeDispose(() => unhooks.forEach(unhook => unhook()))

const metrics = useAction(actions.admin.metrics)
const create = useAction(createTodo)

async function createInvalid() {
  await create.execute({ title: '' })
}
</script>

<template>
  <div>
    <section>
      <button
        :disabled="metrics.isExecuting.value"
        @click="metrics.execute(undefined as never)"
      >
        Load metrics (namespace)
      </button>
      <button @click="createInvalid">
        Trigger a validation error
      </button>
      <button @click="events = []">
        Clear log
      </button>
    </section>

    <section v-if="metrics.data.value">
      <div class="success">
        active: {{ metrics.data.value.activeUsers }}
        · requests/day: {{ metrics.data.value.requestsToday }}
        · p95: {{ metrics.data.value.p95LatencyMs }}ms
      </div>
    </section>

    <section>
      <h2>Hook event stream</h2>
      <pre v-if="events.length">{{ events.join('\n') }}</pre>
      <p v-else>
        Trigger an action to see hook events.
      </p>
    </section>
  </div>
</template>
```

The markup is trimmed for readability, and the log lines use plain words where the original page prints symbols. The full page is linked above.

## How it works

- `nuxtApp.hook()` returns a function that removes the listener. The page keeps all four and calls them in `onScopeDispose`, so leaving the page unsubscribes.
- Every payload carries `path`, `method`, and `input`. The success and error payloads add `durationMs`, and `action:settled` adds the final `result`.
- `actions.admin.metrics` is the grouped form of the `adminMetrics` export generated from `server/actions/admin/metrics.get.ts`. Both are the same typed reference.
- "Trigger a validation error" sends an empty title to `createTodo`, so the log shows `action:error` with `VALIDATION_ERROR`, followed by `action:settled`.

## Related

- Guide: [Observability](/guide/observability), [E2E Type Inference](/guide/e2e-type-inference#grouped-actions-namespace)
- API: [Type Reference](/api/types)
