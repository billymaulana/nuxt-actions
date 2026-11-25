<template>
  <div>
    <h1>Security Middleware</h1>
    <h2>Built-in rateLimitMiddleware, originMiddleware, and csrfMiddleware</h2>

    <section>
      <h3 style="margin-bottom: 8px;">
        Rate Limiting
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        This action allows 5 requests per 10 seconds for each client. Click quickly to go over the limit.
        The server then says how long to wait, in <code>retryAfter</code> and in the <code>Retry-After</code> header.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button
          :disabled="rateLimitAction.isExecuting.value"
          @click="handleRateLimit"
        >
          {{ rateLimitAction.isExecuting.value ? 'Sending...' : 'Send request' }}
        </button>
        <button
          :disabled="waitingAction.isExecuting.value"
          @click="handleWaitingRequest"
        >
          {{ waitingAction.isExecuting.value ? 'Waiting for the limit...' : 'Send, waiting for Retry-After' }}
        </button>
        <button @click="inspectHeaders">
          Inspect headers
        </button>
        <span style="font-size: 13px; color: #a3a3a3;">
          Sent: {{ requestCount }}
        </span>
      </div>

      <div
        v-if="rateLimitAction.hasSucceeded.value && rateLimitAction.data.value"
        class="success"
      >
        Echo: {{ rateLimitAction.data.value.echo }} ({{ new Date(rateLimitAction.data.value.timestamp).toLocaleTimeString() }})
      </div>

      <div
        v-if="rateLimitAction.hasErrored.value"
        class="error"
      >
        {{ rateLimitAction.error.value?.statusCode }} {{ rateLimitAction.error.value?.code }}: {{ rateLimitAction.error.value?.message }}
      </div>

      <div
        v-if="resetCountdown > 0"
        style="margin-top: 8px; font-size: 13px; color: #fb923c;"
      >
        The server asked to wait {{ resetCountdown }}s before the next request
      </div>

      <div
        v-if="waitingAction.hasSucceeded.value && waitingAction.data.value"
        class="success"
      >
        Waited and retried: {{ waitingAction.data.value.echo }}
      </div>

      <div
        v-if="waitingAction.hasErrored.value"
        class="error"
      >
        {{ waitingAction.error.value?.statusCode }} {{ waitingAction.error.value?.code }}: {{ waitingAction.error.value?.message }}
      </div>

      <div
        v-if="limitHeaders"
        style="margin-top: 8px; display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px;"
      >
        <code
          v-for="(value, name) in limitHeaders"
          :key="name"
        >{{ name }}: {{ value }}</code>
      </div>

      <pre>// server/actions/rate-limited-action.post.ts
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

// client: wait as long as the server asks, then retry once
const waitingAction = useAction(rateLimitedAction, {
  retry: { count: 1, respectRetryAfter: true, maxDelay: 10_000 },
})</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Origin Check
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        <code>originMiddleware</code> rejects mutations that come from another site, from the
        <code>Sec-Fetch-Site</code> and <code>Origin</code> headers the browser sends, with no token to pass around.
        This page is on the same origin, so its request passes.
      </p>
      <button
        :disabled="originNote.isExecuting.value"
        @click="originNote.execute({ note: 'Saved from this page' })"
      >
        Save from this page
      </button>

      <div
        v-if="originNote.hasSucceeded.value && originNote.data.value"
        class="success"
      >
        Saved "{{ originNote.data.value.saved }}"
      </div>

      <div
        v-if="originNote.hasErrored.value"
        class="error"
      >
        {{ originNote.error.value?.statusCode }} {{ originNote.error.value?.code }}: {{ originNote.error.value?.message }}
      </div>

      <p style="color: #a3a3a3; font-size: 13px; margin: 12px 0 8px;">
        The same request from another site is rejected:
      </p>
      <pre>curl -X POST {{ origin }}/api/_actions/origin-protected \
  -H 'content-type: application/json' \
  -H 'sec-fetch-site: cross-site' \
  -H 'origin: https://evil.example' \
  -d '{"note":"forged"}'

{
  "success": false,
  "error": {
    "code": "CSRF_ERROR",
    "message": "Cross-origin request rejected",
    "statusCode": 403
  }
}</pre>

      <pre>// server/actions/origin-protected.post.ts
export default defineAction({
  input: z.object({ note: z.string() }),
  middleware: [originMiddleware()],
  handler: async ({ input }) => ({ saved: input.note, at: Date.now() }),
})</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        CSRF Protection
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        The csrfMiddleware generates a token cookie on safe requests and validates it on mutations.
        The client reads the cookie and sends the token in the <code>x-csrf-token</code> header.
      </p>

      <div style="background: #111; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px;">
          <span style="color: #a3a3a3;">Flow:</span>
          <span style="color: #e5e5e5;">1. Server sets <code style="color: #60a5fa;">_csrf</code> cookie with a random token</span>
          <span />
          <span style="color: #e5e5e5;">2. Client reads cookie value</span>
          <span />
          <span style="color: #e5e5e5;">3. Client sends token in <code style="color: #60a5fa;">x-csrf-token</code> header</span>
          <span />
          <span style="color: #e5e5e5;">4. Server compares cookie vs header (timing-safe)</span>
        </div>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
        <button
          :disabled="issueToken.isExecuting.value"
          @click="handleIssueToken"
        >
          Get CSRF token
        </button>
        <button
          :disabled="saveNote.isExecuting.value"
          @click="handleSaveNote(true)"
        >
          Save with token
        </button>
        <button
          :disabled="saveNote.isExecuting.value"
          @click="handleSaveNote(false)"
        >
          Save without token
        </button>
      </div>

      <p style="color: #a3a3a3; font-size: 13px; margin-bottom: 8px;">
        Token from <code>document.cookie</code>: <code>{{ csrfToken ? `${csrfToken.slice(0, 12)}...` : 'none yet' }}</code>
      </p>

      <p
        v-if="cookieBlocked"
        style="color: #fb923c; font-size: 13px; margin-bottom: 8px;"
      >
        The browser did not keep the token cookie. The cookie is Secure, so it needs HTTPS, and Safari refuses it even on localhost. Start the example with <code>pnpm dev --https</code>.
      </p>

      <div
        v-if="saveNote.hasSucceeded.value"
        class="success"
        style="margin-bottom: 12px;"
      >
        Saved "{{ saveNote.data.value?.saved }}"
      </div>
      <div
        v-if="saveNote.hasErrored.value"
        class="error"
        style="margin-bottom: 12px;"
      >
        {{ saveNote.error.value?.statusCode }} {{ saveNote.error.value?.code }}: {{ saveNote.error.value?.message }}
      </div>

      <pre>// Usage in an action
export default defineAction({
  input: z.object({ title: z.string() }),
  middleware: [
    csrfMiddleware({
      cookieName: '_csrf',        // default
      headerName: 'x-csrf-token', // default
      tokenLength: 32,            // default
    }),
  ],
  handler: async ({ input }) => {
    return db.createPost(input)
  },
})</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Composing Middleware
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Middleware can be chained — apply rate limiting AND CSRF protection together.
      </p>
      <pre>export default defineAction({
  input: z.object({ amount: z.number() }),
  middleware: [
    rateLimitMiddleware({ limit: 10, window: 60000 }),
    csrfMiddleware(),
  ],
  handler: async ({ input }) => {
    return payments.charge(input.amount)
  },
})</pre>
    </section>
  </div>
</template>

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
