---
title: Security Middleware
description: Rate limit an action with rateLimitMiddleware and Retry-After, reject cross-site posts with originMiddleware, and protect a mutation with csrfMiddleware from the browser.
---

# Security Middleware

nuxt-actions ships `rateLimitMiddleware`, `originMiddleware`, and `csrfMiddleware` as regular action middleware. This example runs all three. The rate-limited action accepts five requests per ten seconds from a client; after that the server says how long to wait, and one button waits for it and retries. The origin check accepts the page's own request with no token involved. The CSRF part issues a token cookie, reads it with `document.cookie`, and sends it back in the `x-csrf-token` header, so you can watch a save succeed with the token and fail with a 403 without it.

<ExampleSource page="pages/security.vue" :embed="false" />

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
      headers: true,
      message: 'Too many requests, wait 10 seconds',
    }),
  ],
  handler: async ({ input }) => {
    return { echo: input.message, timestamp: Date.now() }
  },
})
```

```ts [server/actions/origin-protected.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({ note: z.string() }),
  middleware: [originMiddleware()],
  handler: async ({ input }) => ({ saved: input.note, at: Date.now() }),
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
import { csrfToken as csrfTokenAction, originProtected, protectedNote, rateLimitedAction } from '#actions'

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

function startCountdown(seconds: number) {
  if (countdownTimer) clearInterval(countdownTimer)
  resetCountdown.value = seconds
  const timer = setInterval(() => {
    resetCountdown.value--
    if (resetCountdown.value <= 0) {
      clearInterval(timer)
      countdownTimer = null
    }
  }, 1000)
  countdownTimer = timer
}

const rateLimitAction = useAction(rateLimitedAction, {
  onError(error) {
    if (error.code === 'RATE_LIMIT' && error.retryAfter) startCountdown(error.retryAfter)
  },
})

const waitingAction = useAction(rateLimitedAction, {
  retry: { count: 1, respectRetryAfter: true, maxDelay: 10_000 },
})

function handleRateLimit() {
  requestCount.value++
  rateLimitAction.execute({ message: `Request #${requestCount.value}` })
}

function handleWaitingRequest() {
  requestCount.value++
  waitingAction.execute({ message: `Request #${requestCount.value}` })
}

const limitHeaders = ref<Record<string, string> | null>(null)

async function inspectHeaders() {
  requestCount.value++
  const response = await $fetch.raw('/api/_actions/rate-limited-action', {
    method: 'POST',
    body: { message: `Request #${requestCount.value}` },
  })
  limitHeaders.value = Object.fromEntries(
    ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'retry-after']
      .map(name => [name, response.headers.get(name)])
      .filter((entry): entry is [string, string] => entry[1] !== null),
  )
}

const origin = useRequestURL().origin
const originNote = useAction(originProtected)

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
        {{ rateLimitAction.isExecuting.value ? 'Sending...' : 'Send request' }}
      </button>
      <button :disabled="waitingAction.isExecuting.value" @click="handleWaitingRequest">
        {{ waitingAction.isExecuting.value ? 'Waiting for the limit...' : 'Send, waiting for Retry-After' }}
      </button>
      <button @click="inspectHeaders">
        Inspect headers
      </button>
      <span>Sent: {{ requestCount }}</span>

      <div v-if="rateLimitAction.hasErrored.value" class="error">
        {{ rateLimitAction.error.value?.statusCode }} {{ rateLimitAction.error.value?.code }}:
        {{ rateLimitAction.error.value?.message }}
      </div>
      <div v-if="resetCountdown > 0">
        The server asked to wait {{ resetCountdown }}s before the next request
      </div>
      <div v-if="waitingAction.hasSucceeded.value && waitingAction.data.value" class="success">
        Waited and retried: {{ waitingAction.data.value.echo }}
      </div>
      <div v-if="limitHeaders">
        <code v-for="(value, name) in limitHeaders" :key="name">{{ name }}: {{ value }}</code>
      </div>
    </section>

    <section>
      <button :disabled="originNote.isExecuting.value" @click="originNote.execute({ note: 'Saved from this page' })">
        Save from this page
      </button>
      <div v-if="originNote.hasSucceeded.value && originNote.data.value" class="success">
        Saved "{{ originNote.data.value.saved }}"
      </div>
      <pre>curl -X POST {{ origin }}/api/_actions/origin-protected \
  -H 'content-type: application/json' \
  -H 'sec-fetch-site: cross-site' \
  -H 'origin: https://evil.example' \
  -d '{"note":"forged"}'</pre>
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

- `rateLimitMiddleware({ limit: 5, window: 10000, headers: true })` counts requests per client key in a ten-second window. The sixth request fails with code `RATE_LIMIT`, status 429, the custom `message`, and `retryAfter`, the seconds until the window ends. The countdown on the page starts from that value.
- "Send, waiting for Retry-After" uses `retry: { count: 1, respectRetryAfter: true }`. When the server rejects it, the composable waits the `retryAfter` seconds and sends it once more, so the button stays busy and then succeeds.
- `headers: true` adds `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` to every response, and a rejected request also carries `Retry-After`. `useAction` returns the result, not the response, so "Inspect headers" sends the request with `$fetch.raw` to show them.
- The limiter keeps its counters in server memory, so they reset when the server restarts and are not shared between server instances. A shared `store` fixes both.
- `originMiddleware()` accepts the page's save because the browser marks it `Sec-Fetch-Site: same-origin`. The `curl` command claims to come from another site, which the middleware rejects with `CSRF_ERROR` and status 403. A real cross-site page cannot change those headers.
- "Get CSRF token" calls a GET action that uses `csrfMiddleware()`. The middleware sets the `_csrf` cookie and keeps the same token on later safe requests.
- The cookie is readable from JavaScript on purpose: a page on another site can make the browser send it, but cannot read it to fill the `x-csrf-token` header. The `headers` function reads it on every call.
- The token cookie is `Secure`. Safari does not store it on `http://localhost`, and no browser stores it on another plain-HTTP host, so the page explains this when the cookie is missing after "Get CSRF token".
- "Save without token" sends the cookie but no header, so `csrfMiddleware()` rejects the request with `CSRF_ERROR` and status 403 before the handler runs.

## Related

- Guide: [Security](/guide/security)
- API: [rateLimitMiddleware](/api/rate-limit-middleware), [originMiddleware](/api/origin-middleware), [csrfMiddleware](/api/csrf-middleware), [useAction retry](/api/use-action#retry)
