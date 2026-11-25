---
description: "Unit test actions with plain Vitest: run them with input, headers, cookies, and context, and check the result and the headers and cookies they set."
---

# Testing

`nuxt-actions/testing` runs action files in plain Vitest, without starting Nuxt. Action files rely on auto-imports and on a server runtime chosen when Nuxt builds; a Vitest plugin provides both.

## Setup

```bash
pnpm add -D vitest
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { nuxtActionsTesting } from 'nuxt-actions/testing'

export default defineConfig({
  plugins: [nuxtActionsTesting()],
})
```

The plugin points the server runtime at an in-memory one, and installs the nuxt-actions server utils (`defineAction`, `createActionClient`, the middleware, `callAction`, and the rest) and the common h3 helpers as globals, the way Nitro auto-imports them.

## Running an Action

```ts
// test/create-todo.test.ts
import { expect, it } from 'vitest'
import { runAction } from 'nuxt-actions/testing'
import createTodo from '../server/actions/todos/create.post'

it('creates a todo for the signed-in user', async () => {
  const { result } = await runAction(createTodo, {
    input: { title: 'Buy milk' },
    context: { auth: { userId: 1 } },
  })

  expect(result).toEqual({ success: true, data: { title: 'Buy milk', userId: 1 } })
})

it('rejects an empty title', async () => {
  const { result } = await runAction(createTodo, { input: { title: '' }, context: { auth: { userId: 1 } } })

  expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } })
})
```

`runAction` runs the action as its route would: input validation, middleware, idempotency, the handler, and output validation. The type of `input` comes from the action.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `input` | - | The input, as the client would send it |
| `method` | `'POST'` | Request method |
| `headers` | `{}` | Request headers |
| `cookies` | `{}` | Request cookies |
| `ip` | `'127.0.0.1'` | Client IP address |
| `context` | `{}` | `event.context`, for values server middleware would set, such as the signed-in user |
| `path` | - | The action path, such as `'todos/list'`. Sets the request URL and turns on the [server cache](/guide/caching). |
| `url` | a URL per action | Request path with an optional query string. Each action gets its own default, so idempotency keys of different actions stay apart as on a server. |
| `query` | `{}` | Query parameters, merged over those in `url` |
| `body` | - | What `readBody()` returns; a `FormData` body is read as multipart |

### Result

| Field | Description |
|-------|-------------|
| `result` | The `ActionResult`, as the client would receive it |
| `status` | The status set with `setResponseStatus`, or `200` |
| `headers` | Response headers set by the action or its middleware, with lower-case names |
| `cookies` | Cookies set, by name; a deleted cookie has an empty value |
| `event` | The test event |

`runAction` resolves once the work handed to `event.waitUntil()` is done, so a background cache refresh has finished by then.

## Security Middleware

```ts
it('limits each client to one request a minute', async () => {
  await runAction(sendCode, { ip: '203.0.113.1' })
  const second = await runAction(sendCode, { ip: '203.0.113.1' })

  expect(second.result).toMatchObject({ success: false, error: { code: 'RATE_LIMIT', retryAfter: 60 } })
  expect(second.headers['retry-after']).toBe('60')
})

it('accepts the CSRF token from the cookie in the header', async () => {
  const { cookies } = await runAction(updateProfile, { method: 'GET' })
  const token = cookies._csrf!

  const { result } = await runAction(updateProfile, {
    input: { name: 'Ada' },
    cookies: { _csrf: token },
    headers: { 'x-csrf-token': token },
  })

  expect(result.success).toBe(true)
})

it('rejects a cross-site post', async () => {
  const { result } = await runAction(deleteTodo, {
    input: { id: 1 },
    headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://evil.example' },
  })

  expect(result).toMatchObject({ success: false, error: { code: 'CSRF_ERROR' } })
})
```

Rate limit counts and cached results stay in memory for the whole test file, as they would on a running server. Give each test its own `ip`, and reset the cache with `setActionCacheStore(createMemoryActionCacheStore())` in a `beforeEach` when tests should not share it.

## Other Auto-Imports

The plugin provides nuxt-actions and the common h3 helpers. Stub anything else an action uses, such as `useRuntimeConfig`, `useStorage`, or `getUserSession` from nuxt-auth-utils:

```ts
import { vi } from 'vitest'

vi.stubGlobal('useRuntimeConfig', () => ({ apiSecret: 'test' }))
vi.stubGlobal('getUserSession', async () => ({ user: { id: 1 } }))
```

## The Route Handler

The default export of an action file is also its route handler. Called with a test event, it parses the body as the route would, including `FormData` uploads:

```ts
import { createTestEvent } from 'nuxt-actions/testing'

const form = new FormData()
form.append('title', 'Report')
form.append('file', new Blob(['%PDF-1.7']), 'report.pdf')

const result = await upload(createTestEvent({ body: form }) as never)
```

## Middleware on Its Own

```ts
import { createTestEvent, getTestResponse } from 'nuxt-actions/testing'

it('sends rate limit headers', async () => {
  const event = createTestEvent({ ip: '198.51.100.9' })
  const middleware = rateLimitMiddleware({ limit: 5, headers: true })

  await middleware({ event: event as never, ctx: {}, metadata: {}, next: async () => ({}) })

  expect(getTestResponse(event).headers['ratelimit-remaining']).toBe('4')
})
```

`createTestEvent` takes the same options as `runAction`, except `input` and `path`. The `as never` is needed where a function is typed for the h3 event: the test event implements what nuxt-actions and the helpers below use, not the whole h3 event.

## Globals

Besides every nuxt-actions server util, the setup installs these helpers, bound to test events: `getHeader`, `getHeaders`, `getRequestHeader`, `getRequestHeaders`, `getCookie`, `parseCookies`, `setCookie`, `deleteCookie`, `getQuery`, `readBody`, `getRequestIP`, `getRequestHost`, `getRequestURL`, `setHeader`, `setResponseHeader`, `setResponseStatus`, and `createError`.

## Limits

- Code that reads `event.node.req` or `event.req` directly is not supported.
- An action file that imports helpers from `h3` or `nuxt/server` gets the real ones, which do not accept a test event. Use the auto-imported helpers in action files.
- For tests against the running app, use [@nuxt/test-utils](https://nuxt.com/docs/getting-started/testing).
