---
title: Auth Preset
description: Protect an action with defineAuthMiddleware in the builder. It resolves the session into ctx.user, or rejects the call with a typed 401 UNAUTHORIZED.
---

# Auth Preset

`defineAuthMiddleware` is a ready-made middleware for `createActionClient`. You give it a function that turns the request into a user, or into `null` for an anonymous request. With a user, the handler receives it as `ctx.user`; without one, the action returns a 401 before the handler runs. In this example a request header stands in for a real session cookie.

<ExampleSource page="pages/auth.vue" />

## Server action

```ts [server/actions/account.post.ts]
import { getHeader } from 'h3'

interface SessionUser {
  id: string
  name: string
  plan: 'free' | 'pro'
}

export default createActionClient()
  .use(defineAuthMiddleware((event): SessionUser | null => {
    const session = getHeader(event, 'x-demo-session')
    if (!session) return null
    return { id: session, name: `User ${session}`, plan: 'pro' }
  }))
  .action(async ({ ctx }) => {
    const user = (ctx as { user: SessionUser }).user
    return {
      user,
      message: `Welcome back, ${user.name}`,
      serverTime: new Date().toISOString(),
    }
  })
```

::: tip Nitro v3
The resolver reads the header with h3's `getHeader`, which works on Nitro v2. On Nitro v3, use `getRequestHeader` from `nuxt/server` instead. See [Server Runtimes](/guide/server-runtimes).
:::

## Page

```vue [pages/auth.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { account as accountAction } from '#actions'

const signedIn = ref(false)

const account = useAction(accountAction, {
  headers: (): Record<string, string> => (signedIn.value ? { 'x-demo-session': 'u_42' } : {}),
})
</script>

<template>
  <div>
    <section>
      <span class="badge">{{ signedIn ? 'Signed in' : 'Signed out' }}</span>
      <button @click="signedIn = !signedIn">
        {{ signedIn ? 'Sign out' : 'Sign in' }}
      </button>
      <button @click="account.execute(undefined as never)">
        Load account
      </button>
    </section>

    <section>
      <div v-if="account.error.value" class="error">
        {{ account.error.value.code }}: {{ account.error.value.message }}
      </div>
      <div v-if="account.data.value" class="success">
        {{ account.data.value.message }} — plan: {{ account.data.value.user.plan }}
        <pre>{{ JSON.stringify(account.data.value.user, null, 2) }}</pre>
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- The resolver returns a `SessionUser` when the `x-demo-session` header is present, and `null` when it is not.
- A `null` user rejects the call with code `UNAUTHORIZED` and status 401. The handler never runs, and the page shows the code and the message.
- `headers` is a function, so it is evaluated on every call. The header is only sent while the page is in the signed-in state.
- On success the handler reads the resolved user from `ctx` and returns it with a greeting and the server time.
- Load the account signed out, sign in, and load it again to see both paths.

## Related

- Guide: [Authentication](/guide/auth), [Builder Pattern](/guide/builder-pattern)
- API: [defineAuthMiddleware](/api/auth-middleware), [createActionClient](/api/create-action-client)
