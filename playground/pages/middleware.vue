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
import { login } from '#actions'

const email = ref('admin@example.com')
const password = ref('password123')

const loginAction = useAction(login)

async function handleLogin() {
  await loginAction.execute({ email: email.value, password: password.value })
}
</script>
