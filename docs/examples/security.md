---
title: Security Middleware
description: Rate limit an action with rateLimitMiddleware and protect a mutation with csrfMiddleware, with the browser reading the token cookie and sending it back as a header.
---

# Security Middleware

nuxt-actions ships `rateLimitMiddleware` and `csrfMiddleware` as regular action middleware. This example runs both live: the rate-limited action accepts five requests per ten seconds from a client, and the sixth gets a 429 with the configured message. The CSRF part issues a token cookie, reads it with `document.cookie`, and sends it back in the `x-csrf-token` header, so you can watch a save succeed with the token and fail with a 403 without it.

<ExampleSource page="pages/security.vue" />

## Server actions

::: code-group

```ts [server/actions/rate-limited-action.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({ message: z.string() }),
  middleware: [
    rateLimitMiddleware({
      limit: 5,
      window: 10000,
      message: 'Too many requests, wait 10 seconds',
    }),
  ],
  handler: async ({ input }) => {
    return { echo: input.message, timestamp: Date.now() }
  },
})
```

```ts [server/actions/csrf-token.get.ts]
export default defineAction({
  middleware: [csrfMiddleware()],
  handler: async () => ({ issued: true }),
})
```

```ts [server/actions/protected-note.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    note: z.string().min(1, 'Note is required'),
  }),
  middleware: [csrfMiddleware()],
  handler: async ({ input }) => ({
    saved: input.note,
    savedAt: new Date().toISOString(),
  }),
})
```

:::

## Page

```vue [pages/security.vue]
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { csrfToken as csrfTokenAction, protectedNote, rateLimitedAction } from '#actions'

const csrfToken = ref('')
const cookieBlocked = ref(false)
let sendWithToken = true

function readCsrfCookie(): string {
  return document.cookie.split('; ').find(row => row.startsWith('_csrf='))?.split('=')[1] ?? ''
}

const issueToken = useAction(csrfTokenAction, {
  onSuccess() {
    csrfToken.value = readCsrfCookie()
    cookieBlocked.value = !csrfToken.value
    saveNote.reset()
  },
})

const saveNote = useAction(protectedNote, {
  headers: (): Record<string, string> => (sendWithToken ? { 'x-csrf-token': readCsrfCookie() } : {}),
})

function handleIssueToken() {
  issueToken.execute()
}

function handleSaveNote(withToken: boolean) {
  sendWithToken = withToken
  saveNote.execute({ note: 'Hello from the browser' })
}

onMounted(() => {
  csrfToken.value = readCsrfCookie()
})

const requestCount = ref(0)
const resetCountdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null
let windowStart = 0

const rateLimitAction = useAction(rateLimitedAction, {
  onError() {
    if (!countdownTimer) {
      const elapsed = Date.now() - windowStart
      const remaining = Math.ceil((10000 - elapsed) / 1000)
      resetCountdown.value = Math.max(remaining, 1)
      countdownTimer = setInterval(() => {
        resetCountdown.value--
        if (resetCountdown.value <= 0) {
          clearInterval(countdownTimer!)
          countdownTimer = null
          requestCount.value = 0
        }
      }, 1000)
    }
  },
})

function handleRateLimit() {
  if (requestCount.value === 0) {
    windowStart = Date.now()
  }
  requestCount.value++
  rateLimitAction.execute({ message: `Request #${requestCount.value}` })
}

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})
</script>

<template>
  <div>
    <section>
      <button :disabled="rateLimitAction.isExecuting.value" @click="handleRateLimit">
        {{ rateLimitAction.isExecuting.value ? 'Sending...' : 'Send Request' }}
      </button>
      <span>Sent: {{ requestCount }} | Remaining: {{ Math.max(0, 5 - requestCount) }}</span>

      <div v-if="rateLimitAction.hasSucceeded.value" class="success">
        Echo: {{ rateLimitAction.data.value.echo }}
        ({{ new Date(rateLimitAction.data.value.timestamp).toLocaleTimeString() }})
      </div>

      <div v-if="rateLimitAction.hasErrored.value" class="error">
        {{ rateLimitAction.error.value?.statusCode }} —
        {{ rateLimitAction.error.value?.message }}
      </div>

      <div v-if="resetCountdown > 0">
        Window resets in {{ resetCountdown }}s
      </div>
    </section>

    <section>
      <button :disabled="issueToken.isExecuting.value" @click="handleIssueToken">
        Get CSRF token
      </button>
      <button :disabled="saveNote.isExecuting.value" @click="handleSaveNote(true)">
        Save with token
      </button>
      <button :disabled="saveNote.isExecuting.value" @click="handleSaveNote(false)">
        Save without token
      </button>

      <p>Token from <code>document.cookie</code>: <code>{{ csrfToken ? `${csrfToken.slice(0, 12)}...` : 'none yet' }}</code></p>
      <p v-if="cookieBlocked">
        The browser did not keep the token cookie. The cookie is Secure, so it needs HTTPS, and Safari refuses it even on localhost.
        Start the example with <code>pnpm dev --https</code>.
      </p>

      <div v-if="saveNote.hasSucceeded.value" class="success">
        Saved "{{ saveNote.data.value?.saved }}"
      </div>
      <div v-if="saveNote.hasErrored.value" class="error">
        {{ saveNote.error.value?.statusCode }} {{ saveNote.error.value?.code }}: {{ saveNote.error.value?.message }}
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability, without the written walkthroughs of the original page. The full page is linked above.

## How it works

- `rateLimitMiddleware({ limit: 5, window: 10000 })` counts requests per client key in a ten-second window. The sixth request fails with code `RATE_LIMIT`, status 429, and the custom `message`.
- The limiter keeps its counters in server memory, so they reset when the server restarts and are not shared between server instances.
- The "Remaining" counter on the page is a client-side estimate. The server alone decides when a request is rejected, and `onError` starts the countdown.
- "Get CSRF token" calls a GET action that uses `csrfMiddleware()`. The middleware sets the `_csrf` cookie and keeps the same token on later safe requests.
- The cookie is readable from JavaScript on purpose: a page on another site can make the browser send it, but cannot read it to fill the `x-csrf-token` header. The `headers` function reads it on every call.
- The token cookie is `Secure`. Safari does not store it on `http://localhost`, and no browser stores it on another plain-HTTP host, so the page explains this when the cookie is missing after "Get CSRF token".
- "Save without token" sends the cookie but no header, so `csrfMiddleware()` rejects the request with `CSRF_ERROR` and status 403 before the handler runs.

## Related

- Guide: [Security](/guide/security)
- API: [rateLimitMiddleware](/api/rate-limit-middleware), [csrfMiddleware](/api/csrf-middleware)
