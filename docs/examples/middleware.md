---
title: Middleware & Auth
description: A login action with two chained middleware, Zod validation, and a typed 401, plus two small actions that show what happens when middleware skips next().
---

# Middleware & Auth

Middleware runs between input validation and the handler, and adds values to `ctx` for the handler to read. The login action chains two middleware, validates the email and password, and throws a typed `INVALID_CREDENTIALS` error on a bad login. Two smaller actions show the chain when every middleware calls `next()`, and when one of them does not.

The form is prefilled with the demo credentials, `admin@example.com` and `password123`.

<ExampleSource page="pages/middleware.vue" />

## Server actions

::: code-group

```ts [server/actions/login.post.ts]
import { z } from 'zod'

const authMiddleware = defineMiddleware(async ({ event, next }) => {
  console.log(`[Auth] ${event.method} ${event.path}`)
  return next({ ctx: { requestTime: Date.now() } })
})

const rateLimitInfoMiddleware = defineMiddleware(async ({ next }) => {
  return next({ ctx: { rateLimitRemaining: 99 } })
})

export default defineAction({
  input: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
  middleware: [authMiddleware, rateLimitInfoMiddleware],
  handler: async ({ input, ctx }) => {
    await new Promise(r => setTimeout(r, 300))

    if (input.email === 'admin@example.com' && input.password === 'password123') {
      return {
        user: { id: 1, email: input.email, name: 'Admin' },
        token: 'demo-jwt-token',
        meta: { requestTime: (ctx as Record<string, unknown>).requestTime },
      }
    }

    throw createActionError({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
      statusCode: 401,
    })
  },
})
```

```ts [server/actions/middleware-chain.post.ts]
import { z } from 'zod'

const mw1 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw1: true } })
})

const mw2 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw2: true } })
})

const mw3 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw3: true } })
})

export default defineAction({
  input: z.object({ label: z.string().optional() }),
  middleware: [mw1, mw2, mw3],
  handler: async ({ ctx }) => {
    const context = ctx as Record<string, unknown>
    return {
      middlewareRan: {
        mw1: !!context.mw1,
        mw2: !!context.mw2,
        mw3: !!context.mw3,
      },
      handlerRan: true,
    }
  },
})
```

```ts [server/actions/middleware-chain-skip.post.ts]
import { z } from 'zod'

const mw1 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw1: true } })
})

const mw2Skip = defineMiddleware(async () => {})

const mw3 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw3: true } })
})

export default defineAction({
  input: z.object({ label: z.string().optional() }),
  middleware: [mw1, mw2Skip, mw3],
  handler: async ({ ctx }) => {
    const context = ctx as Record<string, unknown>
    return {
      middlewareRan: {
        mw1: !!context.mw1,
        mw2: false,
        mw3: !!context.mw3,
      },
      handlerRan: true,
    }
  },
})
```

:::

::: tip Nitro v3
`login.post.ts` reads `event.method` and `event.path`, which exist on the Nitro v2 event. On Nitro v3, use `event.req.method` and `getRequestURL(event)` instead. See [Server Runtimes](/guide/server-runtimes).
:::

## Page

```vue [pages/middleware.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { login, middlewareChain, middlewareChainSkip } from '#actions'

const email = ref('admin@example.com')
const password = ref('password123')

const loginAction = useAction(login)

async function handleLogin() {
  await loginAction.execute({ email: email.value, password: password.value })
}

const chainComplete = useAction(middlewareChain)
const chainSkip = useAction(middlewareChainSkip)
</script>

<template>
  <div>
    <section>
      <form @submit.prevent="handleLogin">
        <input v-model="email" type="email" autocomplete="username" placeholder="admin@example.com">
        <input v-model="password" type="password" autocomplete="current-password" placeholder="password123">
        <button type="submit" :disabled="loginAction.isExecuting.value">
          {{ loginAction.isExecuting.value ? 'Logging in...' : 'Login' }}
        </button>
      </form>

      <div v-if="loginAction.error.value" class="error">
        {{ loginAction.error.value.message }}
        <pre v-if="loginAction.error.value.fieldErrors">{{
          JSON.stringify(loginAction.error.value.fieldErrors, null, 2)
        }}</pre>
      </div>

      <div v-if="loginAction.hasSucceeded.value && loginAction.data.value" class="success">
        <p>Welcome, {{ loginAction.data.value.user.name }}!</p>
        <p>Token: {{ loginAction.data.value.token }}</p>
      </div>
    </section>

    <section>
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

      <div v-if="chainComplete.hasSucceeded.value" class="success">
        <strong>Complete chain:</strong>
        <pre>{{ JSON.stringify(chainComplete.data.value, null, 2) }}</pre>
      </div>
      <div v-if="chainSkip.hasSucceeded.value" class="success">
        <strong>Chain break (mw2 skipped next()):</strong>
        <pre>{{ JSON.stringify(chainSkip.data.value, null, 2) }}</pre>
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- The input is validated before any middleware runs. A malformed email or a short password comes back as `fieldErrors`, and neither middleware nor handler is called.
- `middleware: [authMiddleware, rateLimitInfoMiddleware]` runs in array order. Each one merges values into `ctx` through `next({ ctx })`, and the handler reads `requestTime` from it.
- `next()` merges the context and returns right away; it does not wait for the handler. The `console.log` in `authMiddleware` therefore runs before the handler starts, and the time it prints covers the middleware only.
- The local `rateLimitInfoMiddleware` is a stand-in that only adds a value to `ctx`. It is not the built-in limiter from the [Security Middleware](/examples/security) example.
- Wrong credentials throw `createActionError` with `INVALID_CREDENTIALS` and status 401, and the page shows `error.message`.
- `mw2Skip` returns without calling `next()`. The rest of the chain is skipped, so `mw3` never runs, but the handler still runs with the `ctx` that `mw1` built.

## Related

- Guide: [Middleware](/guide/middleware), [Error Handling](/guide/error-handling)
- API: [defineMiddleware](/api/define-middleware), [createActionError](/api/create-action-error)
