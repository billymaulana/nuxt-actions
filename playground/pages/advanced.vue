<template>
  <div>
    <h1>Advanced Features</h1>
    <h2>Retry, timeout, headers, dedupe, throttle, and output validation</h2>

    <!-- Retry Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Retry (Flaky API)
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        This endpoint fails 2 out of 3 times. Retry is set to 3 attempts with 500ms delay on status 503.
      </p>
      <button
        :disabled="retryAction.isExecuting.value"
        @click="handleRetry"
      >
        {{ retryAction.isExecuting.value ? 'Retrying...' : 'Call Flaky API' }}
      </button>
      <div
        v-if="retryAction.hasSucceeded.value"
        class="success"
      >
        Success on attempt {{ retryAction.data.value.attempt }}: {{ retryAction.data.value.message }}
      </div>
      <div
        v-if="retryAction.hasErrored.value"
        class="error"
      >
        {{ retryAction.error.value?.message }}
      </div>
      <pre>useAction(flakyApi, {
  retry: { count: 3, delay: 500, statusCodes: [503] },
})</pre>
    </section>

    <!-- Timeout Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Timeout
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        The endpoint takes 3s. Timeout is set to 1s, so it will abort.
      </p>
      <button
        :disabled="timeoutAction.isExecuting.value"
        @click="handleTimeout"
      >
        {{ timeoutAction.isExecuting.value ? 'Waiting...' : 'Call Slow API (will timeout)' }}
      </button>
      <div
        v-if="timeoutAction.hasErrored.value"
        class="error"
      >
        {{ timeoutAction.error.value?.code }}: {{ timeoutAction.error.value?.message }}
      </div>
      <pre>useAction(slowEndpoint, {
  timeout: 1000, // 1s timeout for a 3s endpoint
})</pre>
    </section>

    <!-- Custom Headers Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Custom Headers (static & dynamic)
      </h3>
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <button
          :disabled="staticHeaderAction.isExecuting.value"
          @click="handleStaticHeaders"
        >
          Static Headers
        </button>
        <button
          :disabled="dynamicHeaderAction.isExecuting.value"
          @click="handleDynamicHeaders"
        >
          Dynamic Headers
        </button>
      </div>
      <div
        v-if="staticHeaderAction.hasSucceeded.value"
        class="success"
      >
        <strong>Static headers echoed:</strong>
        <pre>{{ JSON.stringify(staticHeaderAction.data.value.receivedHeaders, null, 2) }}</pre>
      </div>
      <div
        v-if="dynamicHeaderAction.hasSucceeded.value"
        class="success"
      >
        <strong>Dynamic headers echoed:</strong>
        <pre>{{ JSON.stringify(dynamicHeaderAction.data.value.receivedHeaders, null, 2) }}</pre>
      </div>
      <pre>// Static headers
useAction(echoHeaders, {
  headers: { 'X-Custom-Token': 'my-static-token' },
})

// Dynamic headers (function called each request)
useAction(echoHeaders, {
  headers: () => ({
    'X-Request-Id': crypto.randomUUID(),
  }),
})</pre>
    </section>

    <!-- Dedupe Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Dedupe (cancel / defer)
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Click rapidly — 'cancel' aborts the previous request, 'defer' ignores subsequent ones until the first completes.
      </p>
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <button @click="handleDedupeCancel">
          Dedupe: cancel (click fast!)
        </button>
        <button @click="handleDedupeDefer">
          Dedupe: defer (click fast!)
        </button>
      </div>
      <div
        v-if="cancelAction.hasSucceeded.value"
        class="success"
      >
        Cancel result: {{ cancelAction.data.value?.label }} at {{ cancelAction.data.value?.completedAt }}
      </div>
      <div
        v-if="deferAction.hasSucceeded.value"
        class="success"
      >
        Defer result: {{ deferAction.data.value?.label }} at {{ deferAction.data.value?.completedAt }}
      </div>
      <pre>// Cancel: new request aborts the in-flight one
useAction(slowEndpoint, { dedupe: 'cancel' })

// Defer: new request is ignored while one is in-flight
useAction(slowEndpoint, { dedupe: 'defer' })</pre>
    </section>

    <!-- Throttle Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Throttle
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Throttled to 1 call per second. Click rapidly — only fires once per interval.
      </p>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button @click="handleThrottle">
          Increment (throttled 1s)
        </button>
        <span style="font-size: 14px; color: #a3a3a3;">
          Clicks: {{ clickCount }} | Server counter: {{ throttleAction.data.value?.counter ?? '—' }}
        </span>
      </div>
      <pre>useAction(throttleCounter, {
  throttle: 1000, // max 1 call per second
})</pre>
    </section>

    <!-- Output Validation Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Output Schema Validation
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        The server validates both input AND output shape with Zod.
      </p>
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <input
          v-model="userName"
          placeholder="Name"
          style="flex: 1;"
        >
        <select
          v-model="userRole"
          style="background: #1a1a1a; border: 1px solid #333; color: #e5e5e5; padding: 8px; border-radius: 6px;"
        >
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
        <button
          :disabled="outputAction.isExecuting.value"
          @click="handleOutput"
        >
          Create User
        </button>
      </div>
      <div
        v-if="outputAction.hasSucceeded.value"
        class="success"
      >
        <pre>{{ JSON.stringify(outputAction.data.value, null, 2) }}</pre>
      </div>
      <pre>defineAction({
  input: z.object({ name: z.string(), role: z.enum([...]) }),
  outputSchema: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    permissions: z.array(z.string()),
  }),
  handler: async ({ input }) => { ... },
})</pre>
    </section>

    <!-- executeAsync Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        executeAsync (throw on error)
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Unlike execute() which returns a result, executeAsync() throws on error — useful with try/catch.
      </p>
      <button @click="handleExecuteAsync">
        Try executeAsync
      </button>
      <div
        v-if="asyncResult"
        class="success"
      >
        {{ asyncResult }}
      </div>
      <div
        v-if="asyncError"
        class="error"
      >
        Caught: {{ asyncError }}
      </div>
      <pre>try {
  const data = await action.executeAsync(input)
  // data is the unwrapped output (not ActionResult)
} catch (e) {
  // e is ActionError — thrown automatically
}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { echoHeaders, flakyApi, slowEndpoint, throttleCounter, validatedOutput } from '#actions'

// ── Retry ──
const retryAction = useAction(flakyApi, {
  retry: { count: 3, delay: 500, statusCodes: [503] },
})

function handleRetry() {
  retryAction.execute({ message: 'Hello from retry demo' })
}

// ── Timeout ──
const timeoutAction = useAction(slowEndpoint, {
  timeout: 1000,
})

function handleTimeout() {
  timeoutAction.execute({ delayMs: 3000, label: 'slow-request' })
}

// ── Static Headers ──
const staticHeaderAction = useAction(echoHeaders, {
  headers: { 'X-Custom-Token': 'my-static-token-123' },
})

function handleStaticHeaders() {
  staticHeaderAction.execute({ ping: 'static' })
}

// ── Dynamic Headers ──
const dynamicHeaderAction = useAction(echoHeaders, {
  headers: () => ({
    'X-Request-Id': `req-${Date.now()}`,
  }),
})

function handleDynamicHeaders() {
  dynamicHeaderAction.execute({ ping: 'dynamic' })
}

// ── Dedupe: cancel ──
const cancelAction = useAction(slowEndpoint, {
  dedupe: 'cancel',
})

let cancelCounter = 0
function handleDedupeCancel() {
  cancelCounter++
  cancelAction.execute({ delayMs: 1000, label: `cancel-${cancelCounter}` })
}

// ── Dedupe: defer ──
const deferAction = useAction(slowEndpoint, {
  dedupe: 'defer',
})

let deferCounter = 0
function handleDedupeDefer() {
  deferCounter++
  deferAction.execute({ delayMs: 1000, label: `defer-${deferCounter}` })
}

// ── Throttle ──
const clickCount = ref(0)
const throttleAction = useAction(throttleCounter, {
  throttle: 1000,
})

function handleThrottle() {
  clickCount.value++
  throttleAction.execute({ increment: 1 })
}

// ── Output Validation ──
const userName = ref('John')
const userRole = ref<'admin' | 'user' | 'guest'>('user')
const outputAction = useAction(validatedOutput)

function handleOutput() {
  outputAction.execute({ name: userName.value, role: userRole.value })
}

// ── executeAsync ──
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
