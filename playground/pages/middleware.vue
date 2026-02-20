<template>
  <div>
    <h1>Middleware & Auth</h1>
    <h2>Chained middleware with validation and error handling</h2>

    <section>
      <form @submit.prevent="handleLogin">
        <div style="display: grid; gap: 8px;">
          <input
            v-model="email"
            type="email"
            placeholder="admin@example.com"
          >
          <input
            v-model="password"
            type="password"
            placeholder="password123"
          >
          <button
            type="submit"
            :disabled="loginAction.isExecuting.value"
          >
            {{ loginAction.isExecuting.value ? 'Logging in...' : 'Login' }}
          </button>
        </div>
      </form>

      <div
        v-if="loginAction.error.value"
        class="error"
      >
        {{ loginAction.error.value.message }}
        <pre v-if="loginAction.error.value.fieldErrors">{{ JSON.stringify(loginAction.error.value.fieldErrors, null, 2) }}</pre>
      </div>

      <div
        v-if="loginAction.hasSucceeded.value"
        class="success"
      >
        <p>Welcome, {{ loginAction.data.value.user.name }}!</p>
        <p style="font-size: 13px; color: #4ade80; opacity: 0.7; margin-top: 4px;">
          Token: {{ loginAction.data.value.token }}
        </p>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Test credentials
      </h3>
      <div style="background: #111; padding: 12px; border-radius: 6px; font-size: 13px; color: #a3a3a3;">
        <p>Email: <code>admin@example.com</code></p>
        <p>Password: <code>password123</code></p>
        <p style="margin-top: 8px; color: #666;">
          Try wrong credentials to see error handling.
        </p>
      </div>
    </section>

    <!-- Chain Break Demo -->
    <section>
      <h3 style="margin-bottom: 8px;">
        Chain Break Behavior
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        When middleware does not call <code>next()</code>, the chain breaks — remaining middleware is skipped, but the handler still runs with whatever context was accumulated so far.
      </p>
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <button
          :disabled="chainComplete.isExecuting.value"
          @click="chainComplete.execute({ label: 'complete' })"
        >
          Complete Chain (all next())
        </button>
        <button
          :disabled="chainSkip.isExecuting.value"
          @click="chainSkip.execute({ label: 'skip' })"
        >
          Break Chain (mw2 skips next())
        </button>
      </div>
      <div
        v-if="chainComplete.hasSucceeded.value"
        class="success"
      >
        <strong>Complete chain:</strong>
        <pre>{{ JSON.stringify(chainComplete.data.value, null, 2) }}</pre>
      </div>
      <div
        v-if="chainSkip.hasSucceeded.value"
        class="success"
      >
        <strong>Chain break (mw2 skipped next()):</strong>
        <pre>{{ JSON.stringify(chainSkip.data.value, null, 2) }}</pre>
      </div>
      <pre>// mw2 does NOT call next()
const mw2Skip = defineMiddleware(async () => {
  // chain breaks here — mw3 never runs
  // handler still executes with ctx from mw1 only
})

middleware: [mw1, mw2Skip, mw3]
// Result: mw1 ✓, mw2 skipped, mw3 ✗, handler ✓</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>// server/actions/login.post.ts
const authMiddleware = defineMiddleware(async ({ next }) => {
  const start = Date.now()
  const result = await next({ ctx: { requestTime: start } })
  console.log(`Took ${Date.now() - start}ms`)
  return result
})

export default defineAction({
  input: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
  middleware: [authMiddleware, rateLimitMiddleware],
  handler: async ({ input, ctx }) => { ... },
})</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { login, middlewareChain, middlewareChainSkip } from '#actions'

const email = ref('admin@example.com')
const password = ref('password123')

const loginAction = useAction(login)

async function handleLogin() {
  await loginAction.execute({ email: email.value, password: password.value })
}

// Chain break demo
const chainComplete = useAction(middlewareChain)
const chainSkip = useAction(middlewareChainSkip)
</script>
