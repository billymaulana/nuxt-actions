---
title: Advanced Features
description: One page of useAction options, retry, timeout, static and dynamic headers, dedupe, throttle, debounce, executeAsync, and a server outputSchema.
---

# Advanced Features

A tour of the `useAction` options that change how a call is sent, plus `outputSchema` on the server. Each block on the page wires one action to one option, so you can trigger them independently and compare the results.

<ExampleSource page="pages/advanced.vue" />

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

```ts [server/actions/slow-endpoint.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    delayMs: z.number().min(0).max(30000).default(3000),
    label: z.string().optional(),
  }),
  handler: async ({ input }) => {
    await new Promise(r => setTimeout(r, input.delayMs))

    return {
      label: input.label ?? 'done',
      delayMs: input.delayMs,
      completedAt: new Date().toISOString(),
    }
  },
})
```

```ts [server/actions/echo-headers.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    ping: z.string().optional(),
  }),
  handler: async ({ input, event }) => {
    const headers = getHeaders(event)

    return {
      ping: input.ping ?? 'pong',
      receivedHeaders: {
        'x-custom-token': headers['x-custom-token'] ?? null,
        'x-request-id': headers['x-request-id'] ?? null,
        'content-type': headers['content-type'] ?? null,
      },
    }
  },
})
```

```ts [server/actions/throttle-counter.post.ts]
import { z } from 'zod'

let counter = 0

export default defineAction({
  input: z.object({
    increment: z.number().default(1),
  }),
  handler: async ({ input }) => {
    counter += input.increment
    return {
      counter,
      timestamp: new Date().toISOString(),
    }
  },
})
```

```ts [server/actions/validated-output.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    name: z.string().min(1),
    role: z.enum(['admin', 'user', 'guest']),
  }),
  outputSchema: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    permissions: z.array(z.string()),
  }),
  handler: async ({ input }) => {
    const permissionMap: Record<string, string[]> = {
      admin: ['read', 'write', 'delete', 'manage'],
      user: ['read', 'write'],
      guest: ['read'],
    }

    return {
      id: Math.floor(Math.random() * 10000),
      name: input.name,
      role: input.role,
      permissions: permissionMap[input.role],
    }
  },
})
```

:::

::: tip Nitro v3
`echo-headers.post.ts` uses h3's auto-imported `getHeaders`, which is available on Nitro v2. On Nitro v3, read headers from `event.req.headers` or with `getRequestHeader` from `nuxt/server`. See [Server Runtimes](/guide/server-runtimes).
:::

## Page

```vue [pages/advanced.vue]
<script setup lang="ts">
import { ref } from 'vue'
import {
  echoHeaders,
  flakyApi,
  slowEndpoint,
  throttleCounter,
  validatedOutput,
} from '#actions'

const retryAction = useAction(flakyApi, {
  retry: { count: 3, delay: 500, statusCodes: [503] },
})

function handleRetry() {
  retryAction.execute({ message: 'Hello from retry demo' })
}

const timeoutAction = useAction(slowEndpoint, {
  timeout: 1000,
})

function handleTimeout() {
  timeoutAction.execute({ delayMs: 3000, label: 'slow-request' })
}

const staticHeaderAction = useAction(echoHeaders, {
  headers: { 'X-Custom-Token': 'my-static-token-123' },
})

function handleStaticHeaders() {
  staticHeaderAction.execute({ ping: 'static' })
}

const dynamicHeaderAction = useAction(echoHeaders, {
  headers: () => ({
    'X-Request-Id': `req-${Date.now()}`,
  }),
})

function handleDynamicHeaders() {
  dynamicHeaderAction.execute({ ping: 'dynamic' })
}

const cancelAction = useAction(slowEndpoint, {
  dedupe: 'cancel',
})

let cancelCounter = 0
function handleDedupeCancel() {
  cancelCounter++
  cancelAction.execute({ delayMs: 1000, label: `cancel-${cancelCounter}` })
}

const deferAction = useAction(slowEndpoint, {
  dedupe: 'defer',
})

let deferCounter = 0
function handleDedupeDefer() {
  deferCounter++
  deferAction.execute({ delayMs: 1000, label: `defer-${deferCounter}` })
}

const clickCount = ref(0)
const throttleAction = useAction(throttleCounter, {
  throttle: 1000,
})

function handleThrottle() {
  clickCount.value++
  throttleAction.execute({ increment: 1 })
}

const userName = ref('John')
const userRole = ref<'admin' | 'user' | 'guest'>('user')
const outputAction = useAction(validatedOutput)

function handleOutput() {
  outputAction.execute({ name: userName.value, role: userRole.value })
}

const debouncedFlaky = useAction(flakyApi, {
  debounce: 500,
})

function handleDebouncedFlaky() {
  debouncedFlaky.execute({ message: 'debounce-error-test' })
}

const asyncResult = ref<string | null>(null)
const asyncError = ref<string | null>(null)
const asyncAction = useAction(slowEndpoint)

async function handleExecuteAsync() {
  asyncResult.value = null
  asyncError.value = null
  try {
    const data = await asyncAction.executeAsync({ delayMs: 500, label: 'async-demo' })
    asyncResult.value = `Got: ${data.label} at ${data.completedAt}`
  }
  catch (e: unknown) {
    asyncError.value = (e as Error).message
  }
}
</script>

<template>
  <div>
    <section>
      <h3>Retry (Flaky API)</h3>
      <button :disabled="retryAction.isExecuting.value" @click="handleRetry">
        {{ retryAction.isExecuting.value ? 'Retrying...' : 'Call Flaky API' }}
      </button>
      <div v-if="retryAction.hasSucceeded.value && retryAction.data.value" class="success">
        Success on attempt {{ retryAction.data.value.attempt }}:
        {{ retryAction.data.value.message }}
      </div>
      <div v-if="retryAction.hasErrored.value" class="error">
        {{ retryAction.error.value?.message }}
      </div>
    </section>

    <section>
      <h3>Timeout</h3>
      <button :disabled="timeoutAction.isExecuting.value" @click="handleTimeout">
        {{ timeoutAction.isExecuting.value ? 'Waiting...' : 'Call Slow API (will timeout)' }}
      </button>
      <div v-if="timeoutAction.hasErrored.value" class="error">
        {{ timeoutAction.error.value?.code }}: {{ timeoutAction.error.value?.message }}
      </div>
    </section>

    <section>
      <h3>Custom Headers (static &amp; dynamic)</h3>
      <button :disabled="staticHeaderAction.isExecuting.value" @click="handleStaticHeaders">
        Static Headers
      </button>
      <button :disabled="dynamicHeaderAction.isExecuting.value" @click="handleDynamicHeaders">
        Dynamic Headers
      </button>
      <div v-if="staticHeaderAction.hasSucceeded.value && staticHeaderAction.data.value" class="success">
        <strong>Static headers echoed:</strong>
        <pre>{{
          JSON.stringify(staticHeaderAction.data.value.receivedHeaders, null, 2)
        }}</pre>
      </div>
      <div v-if="dynamicHeaderAction.hasSucceeded.value && dynamicHeaderAction.data.value" class="success">
        <strong>Dynamic headers echoed:</strong>
        <pre>{{
          JSON.stringify(dynamicHeaderAction.data.value.receivedHeaders, null, 2)
        }}</pre>
      </div>
    </section>

    <section>
      <h3>Dedupe (cancel / defer)</h3>
      <button @click="handleDedupeCancel">
        Dedupe: cancel (click fast!)
      </button>
      <button @click="handleDedupeDefer">
        Dedupe: defer (click fast!)
      </button>
      <div v-if="cancelAction.hasSucceeded.value" class="success">
        Cancel result: {{ cancelAction.data.value?.label }}
        at {{ cancelAction.data.value?.completedAt }}
      </div>
      <div v-if="deferAction.hasSucceeded.value" class="success">
        Defer result: {{ deferAction.data.value?.label }}
        at {{ deferAction.data.value?.completedAt }}
      </div>
    </section>

    <section>
      <h3>Throttle</h3>
      <button @click="handleThrottle">
        Increment (throttled 1s)
      </button>
      <span>
        Clicks: {{ clickCount }} |
        Server counter: {{ throttleAction.data.value?.counter ?? '—' }}
      </span>
    </section>

    <section>
      <h3>Output Schema Validation</h3>
      <input v-model="userName" placeholder="Name">
      <select v-model="userRole">
        <option value="admin">
          Admin
        </option>
        <option value="user">
          User
        </option>
        <option value="guest">
          Guest
        </option>
      </select>
      <button :disabled="outputAction.isExecuting.value" @click="handleOutput">
        Create User
      </button>
      <div v-if="outputAction.hasSucceeded.value" class="success">
        <pre>{{ JSON.stringify(outputAction.data.value, null, 2) }}</pre>
      </div>
    </section>

    <section>
      <h3>Debounce Error Handling</h3>
      <button :disabled="debouncedFlaky.isExecuting.value" @click="handleDebouncedFlaky">
        {{ debouncedFlaky.isExecuting.value
          ? 'Calling...'
          : 'Call Flaky API (debounced 500ms)' }}
      </button>
      <div v-if="debouncedFlaky.hasSucceeded.value" class="success">
        Success: {{ debouncedFlaky.data.value?.message }}
      </div>
      <div v-if="debouncedFlaky.hasErrored.value" class="error">
        Error caught: {{ debouncedFlaky.error.value?.message }}
      </div>
    </section>

    <section>
      <h3>executeAsync (throw on error)</h3>
      <button @click="handleExecuteAsync">
        Try executeAsync
      </button>
      <div v-if="asyncResult" class="success">
        {{ asyncResult }}
      </div>
      <div v-if="asyncError" class="error">
        Caught: {{ asyncError }}
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability, without the explanatory text and code snippets of the original page. The full page is linked above.

## How it works

- `retry: { count: 3, delay: 500, statusCodes: [503] }` retries the flaky action on 503 responses, waiting a fixed 500 ms between attempts, until the third call succeeds.
- `timeout: 1000` aborts the three-second call after one second, and the error block shows `TIMEOUT_ERROR`.
- `headers` takes an object or a function. The function runs before every request, which is how the dynamic block sends a new `X-Request-Id` each time, and the server echoes both headers back.
- `dedupe: 'cancel'` aborts the in-flight request when a new call starts, so only the last click completes. `dedupe: 'defer'` hands new calls the promise of the request that is already running instead of starting another one.
- `throttle: 1000` runs the first click at once and then at most one call per second, while `debounce: 500` waits until the clicks stop. An error from the debounced call still lands in `error`.
- `outputSchema` checks the handler's return value on the server. `executeAsync()` returns the data directly and throws on failure, which suits `try`/`catch` code.

## Related

- Guide: [useAction](/guide/use-action), [Output Validation](/guide/output-validation), [Error Handling](/guide/error-handling)
- API: [useAction](/api/use-action), [defineAction](/api/define-action)
