<template>
  <div>
    <h1>Auth Preset</h1>
    <h2>defineAuthMiddleware — protect actions, resolve ctx.user, reject with 401</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        <strong style="color: #e5e5e5;">The problem:</strong> an account endpoint must only run for
        signed-in users, and the handler wants the current user without re-reading the session every time.
      </p>
      <p style="color: #a3a3a3; font-size: 14px; margin-top: 8px;">
        <strong style="color: #e5e5e5;">The fix:</strong> wrap the action with
        <code>defineAuthMiddleware</code>. It resolves the session into <code>ctx.user</code> or throws a
        typed 401. Here a demo session header stands in for a real cookie/session.
      </p>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Session
      </h3>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span
          class="badge"
          :style="signedIn
            ? { background: '#0a2c0a', color: '#4ade80' }
            : { background: '#2c1010', color: '#f87171' }"
        >
          {{ signedIn ? 'Signed in' : 'Signed out' }}
        </span>
        <button @click="signedIn = !signedIn">
          {{ signedIn ? 'Sign out' : 'Sign in' }}
        </button>
        <button @click="account.execute(undefined as never)">
          Load account
        </button>
      </div>
      <p style="color: #666; font-size: 12px; margin-top: 8px;">
        When signed in, the request carries <code>x-demo-session</code>. When signed out, it does not —
        the middleware rejects it.
      </p>
    </section>

    <section>
      <div
        v-if="account.error.value"
        class="error"
      >
        {{ account.error.value.code }}: {{ account.error.value.message }}
      </div>
      <div
        v-if="account.data.value"
        class="success"
      >
        {{ account.data.value.message }} — plan: {{ account.data.value.user.plan }}
        <pre>{{ JSON.stringify(account.data.value.user, null, 2) }}</pre>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>// server/actions/account.post.ts
export default createActionClient()
  .use(defineAuthMiddleware((event) => {
    const session = getHeader(event, 'x-demo-session')
    return session ? { id: session, name: `User ${session}`, plan: 'pro' } : null
  }))
  .action(async ({ ctx }) => ({ user: ctx.user }))

// client — send the session header only when signed in
useAction(account, {
  headers: () => signedIn.value ? { 'x-demo-session': 'u_42' } : {},
})</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { account as accountAction } from '#actions'

const signedIn = ref(false)

const account = useAction(accountAction, {
  headers: (): Record<string, string> => (signedIn.value ? { 'x-demo-session': 'u_42' } : {}),
})
</script>
