---
description: How nuxt-actions runs on Nitro v2 and Nitro v3, what the event object looks like on each, and how to move your action code to Nitro v3.
---

# Server Runtimes

`nuxt-actions` runs on both Nitro v2, the default server for Nuxt 3 and Nuxt 4, and Nitro v3, which Nuxt 4.7 can build with today and Nuxt 5 uses by default. You do not configure anything: the module asks Nuxt which server API the build runs and loads the matching runtime.

## How the runtime is chosen

| Your app | Runtime used by nuxt-actions | `event` in handlers and middleware |
| --- | --- | --- |
| Nuxt 3.7+ or Nuxt 4.0 to 4.5 | h3 v1 | h3 `H3Event` |
| Nuxt 4.6+ on Nitro v2 (default) | h3 v1 | h3 `H3Event` |
| Nuxt 4.7+ on Nitro v3 | `nuxt/server` | portable `RequestEvent` |

On Nuxt 4.6 and later the choice comes from `resolveServerVariant()` in `@nuxt/kit`, the same mechanism Nuxt's own server integrations use. Older Nuxt versions do not have it and always get the h3 v1 runtime, which is what every release before 1.4.0 used.

The same end-to-end suite runs in CI on Nitro v2, Nitro v3, Nitro v3 with `nitroLegacy: false`, and a Nuxt 5 preview (`future.compatibilityVersion: 5`).

## Trying Nitro v3

Nuxt 4.7 builds with Nitro v3 when `nitro` is listed in your `package.json`:

::: code-group

```bash [pnpm]
pnpm add nitro
```

```bash [npm]
npm install nitro
```

:::

Remove the dependency to go back to Nitro v2. Nuxt marks Nitro v3 support as experimental on Nuxt 4, so try it on a branch first. See the [Nuxt upgrade guide](https://nuxt.com/docs/4.x/getting-started/upgrade#testing-nitro-v3) for the changes that apply to every app, such as wildcard route rules.

Nuxt 4 wraps Nitro v3 in a compatibility layer called `nitroLegacy`. nuxt-actions does not depend on it: its own server code is written against `nuxt/server`, and the module declares that through `compatibility.server`, so Nuxt never routes it through the legacy shims. Setting `nitroLegacy: false`, or `future.compatibilityVersion: 5`, works the same.

## The `event` object

Handlers and middleware receive the request event of the runtime in use. Its type is exported as `ServerEvent`:

```ts
import type { ServerEvent } from 'nuxt-actions/types'
```

On Nitro v3, `ServerEvent` is the web-standard `RequestEvent`:

```ts
event.req          // Request
event.url          // URL
event.res.headers  // Headers of the response
event.context      // per-request context
```

On Nitro v2 it is h3's `H3Event`, with `event.node`, `event.method`, `event.path`, and the h3 helpers you already know.

## Moving action code to Nitro v3

On Nitro v2, keep using the h3 helpers you know: they are typed for h3's event. On Nitro v3, read the request through `nuxt/server` (Nuxt 4.6+), whose helpers are typed for the portable event:

```ts [server/actions/whoami.post.ts]
import { getCookie, getRequestHeader, getRequestURL } from 'nuxt/server'

export default defineAction({
  handler: async ({ event }) => ({
    method: event.req.method,
    path: getRequestURL(event).pathname,
    agent: getRequestHeader(event, 'user-agent'),
    theme: getCookie(event, 'theme'),
  }),
})
```

| Nitro v2 (h3 v1) | Nitro v3 (`nuxt/server`) |
| --- | --- |
| `event.method` | `event.req.method` |
| `event.path` | `getRequestURL(event)` |
| `getHeader(event, name)` | `getRequestHeader(event, name)` |
| `getQuery`, `getCookie`, `setCookie`, `getRequestIP` | The same names |
| `readBody` | `readBody`, but read the action's `input` instead: on Nitro v3 the action has already consumed the request body, and a second read fails |
| `setResponseStatus`, `setResponseHeader` | `setResponseStatus`, `event.res.headers.set()` |

Nuxt backs the `nuxt/server` request helpers with h3 v1 on Nitro v2, so a file written for Nitro v3 also runs on Nitro v2 during a migration. TypeScript still reports h3's event as incompatible there, because the helpers are typed for the portable event, so switch your imports when you switch runtimes rather than mixing both.

Actions usually report failures through `createActionError` rather than HTTP status codes, so most handlers never touch the response at all.

::: warning Session helpers on Nitro v2
`useSession`, `getSession`, `updateSession`, `clearSession`, `readValidatedBody`, `getValidatedQuery`, and `handleCors` from `nuxt/server` require the portable event. On Nitro v2, actions receive h3's own event, and these helpers throw `NUXT_E8012`. Use them on Nitro v3, or keep using h3-based helpers such as [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) on Nitro v2.
:::

## Differences you may notice

- **`defineMiddleware` on Nitro v3.** h3 v2 ships its own `defineMiddleware`, and Nitro v3 auto-imports it. The nuxt-actions version takes precedence, and Nuxt prints a `Duplicated imports "defineMiddleware"` warning during the build. Both are identity functions, so nothing changes at runtime. For h3 server middleware in `server/middleware/`, import `defineMiddleware` from `nitro/h3` explicitly, or use `createMiddleware`, the nuxt-actions alias, for action middleware.
- **Multipart parts without a content type.** A file part sent with no `Content-Type` header is reported as `text/plain` on Nitro v3, following the Fetch specification, and as `application/octet-stream` on Nitro v2. Browsers and `curl -F` send a content type for files, but some clients leave it out, for example Python's `requests` with `files=` and .NET's `StreamContent`. Check the file name or content rather than `type` if those clients upload to you.
- **Malformed multipart bodies.** A multipart request without a boundary or with a broken body fails with `PARSE_ERROR` (400) on Nitro v3. On Nitro v2 it reaches validation as an empty object.
- **Request bodies.** Both runtimes parse bodies with the same media type rules as h3 v1: `application/json` is parsed strictly, `text/*` stays a string, urlencoded forms become objects, and anything else is parsed as JSON when it looks like JSON and kept as text otherwise.
- **Streaming backpressure.** On Nitro v3, stream actions write to a web `ReadableStream` that buffers up to 64 KiB. Once the buffer is full, `stream.send()` waits for the client to read, so a slow client cannot make the server hold an unbounded backlog.
- **Imports from `h3`.** With `nitroLegacy: false`, `import ... from 'h3'` in your server code resolves to h3 v2, or fails with `NUXT_B9009` if your project pins h3 v1. Prefer `nuxt/server`.

## Not supported

The experimental `@nuxt/vite-server` builder is not supported yet: nuxt-actions registers its routes through Nitro.
