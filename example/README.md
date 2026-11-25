# nuxt-actions Example

Real-world examples for [nuxt-actions](https://github.com/billymaulana/nuxt-actions) v1.5.0 — type-safe server actions for Nuxt.

<p>
  <a href="https://npmjs.com/package/nuxt-actions"><img src="https://img.shields.io/npm/v/nuxt-actions/latest.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm version"></a>
  <a href="https://npmjs.com/package/nuxt-actions"><img src="https://img.shields.io/npm/l/nuxt-actions.svg?style=flat&colorA=020420&colorB=00DC82" alt="License"></a>
  <a href="https://nuxt.com"><img src="https://img.shields.io/badge/Nuxt-020420?logo=nuxt" alt="Nuxt"></a>
</p>

<p>
  <a href="https://billymaulana.github.io/nuxt-actions/">Documentation</a> |
  <a href="https://nuxt-actions-demo.vercel.app">Live demo</a> |
  <a href="https://github.com/billymaulana/nuxt-actions">Source</a>
</p>

## Demos

| Page | Feature | Composable / Utility |
|------|---------|----------------------|
| `/actions` | CRUD with E2E typed action refs | `useAction` |
| `/forms` | Field-level errors, dirty tracking, reset | `useFormAction` |
| `/optimistic` | Instant UI + automatic rollback | `useOptimisticAction` |
| `/mutations` | Smart cache — a write auto-refetches every tagged query | `useActionMutation` |
| `/uploads` | multipart/form-data parsed into typed file fields, with an upload progress bar | `useAction`, `ActionFile`, `uploadProgress` |
| `/auth` | Protect actions, resolve `ctx.user`, reject with 401 | `defineAuthMiddleware` |
| `/openapi` | Generate an OpenAPI 3.1 doc + Swagger UI from actions | `openapi` module option |
| `/payments` | Double-click-safe payments — duplicates replay, not re-charge | `idempotency` option |
| `/observability` | Global action hooks for analytics + grouped `actions.admin.metrics` | `action:*` hooks |
| `/resilience` | Exponential retry backoff, `cancelPrevious` search, `cancel()` | `useAction` |
| `/streaming` | SSE text streaming with stop control | `useStreamAction` |
| `/queries` | SSR queries + debounced search + transform | `useActionQuery` |
| `/caching` | A slow GET action cached on the server, invalidated after a write | `cache` option, `invalidateActionCache` |
| `/middleware` | Auth chain, skip behavior, typed context | `defineMiddleware` |
| `/advanced` | Retry, timeout, headers, dedupe, throttle, output validation | `useAction` |
| `/polling` | Auto-refetch, focus/reconnect refetch, enabled toggle, transform | `useActionQuery` |
| `/infinite` | Cursor-based infinite scroll | `useInfiniteActionQuery` |
| `/batch` | Parallel/sequential batch execution | `useActions` |
| `/security` | Rate limiting with Retry-After, origin checks, CSRF protection | `rateLimitMiddleware`, `originMiddleware`, `csrfMiddleware` |
| `/progressive` | Forms with/without JS | `useActionState` |
| `/real-world` | Auth + CRUD + optimistic + validation | `useAction`, `useOptimisticAction` |
| `/prefetch` | Pre-warm cache on hover, stream cache | `prefetchAction`, `useStreamActionQuery` |

## Setup

The example lives in the nuxt-actions repository and uses the local module, so changes to the module show up here right away. It requires Node.js 22 or later and pnpm 12.

```bash
git clone https://github.com/billymaulana/nuxt-actions
cd nuxt-actions
pnpm install
pnpm dev:prepare
pnpm --filter nuxt-actions-example dev
```

Open [http://localhost:3000](http://localhost:3000).

The tests run against the built module, the way the package is installed from npm. From the repository root, `pnpm test:example` builds the module and runs them.

## All Available Composables & Utilities

### Client Composables

| Composable | Description |
|------------|-------------|
| `useAction` | Core composable — reactive state, retry, dedupe, debounce, throttle, transform |
| `useActionMutation` | Write action that auto-refetches affected queries (typed refs and/or tags) |
| `useFormAction` | Form-aware — field-level errors, dirty tracking, v-model support |
| `useOptimisticAction` | Instant UI updates with automatic rollback on server error |
| `useActionQuery` | SSR queries via `useAsyncData` — polling, focus/reconnect refetch, transform |
| `useStreamAction` | SSE streaming with chunk accumulation and stop control |
| `useStreamActionQuery` | Streaming with persistent cache across navigations |
| `useInfiniteActionQuery` | Cursor-based pagination — `fetchNextPage`, `hasNextPage` |
| `useActions` | Batch execution — parallel (`Promise.allSettled`) or sequential |
| `useActionState` | Progressive enhancement — native HTML form fallback |
| `prefetchAction` | Pre-warm Nuxt data cache on hover, route prefetch, or idle |
| `invalidateActions` | Refetch cached data for specific or all action queries |
| `clearActionCache` | Clear cached data without refetching |

### Server Utilities

| Utility | Description |
|---------|-------------|
| `defineAction` | Type-safe server actions with Standard Schema validation |
| `defineStreamAction` | Streaming server actions via SSE |
| `createActionClient` | Builder pattern — chain middleware, schema, metadata |
| `defineMiddleware` | Reusable middleware with typed context accumulation |
| `defineAuthMiddleware` | Auth preset — resolve `ctx.user` or reject with a typed 401 |
| `createMiddleware` | Alias for publishable middleware (npm packages) |
| `createActionError` | Typed error creation with field-level details |
| `returnValidationErrors` | Throw structured validation errors from handlers |
| `rateLimitMiddleware` | Rate limiting per client, with `RateLimit-*` and `Retry-After` headers and pluggable stores |
| `originMiddleware` | CSRF protection from `Sec-Fetch-Site` and `Origin`, with no token |
| `csrfMiddleware` | CSRF token protection with timing-safe comparison |
| `callAction` | Run an action from server code without an HTTP round trip |
| `invalidateActionCache` / `setActionCacheStore` | Drop cached GET results, or move the cache to a shared store |
| `invalidateActions` / `invalidateTags` | Refetch action queries by reference, path, or tag |

## What's New in v1.5.0

- **Server cache for GET actions** — `cache: { maxAge }` keeps the result of a slow GET action on the server, after its middleware, and `invalidateActionCache` drops it after a write. See `/caching` and the [Caching guide](https://billymaulana.github.io/nuxt-actions/guide/caching).
- **Unit tests with plain Vitest** — `test/actions.unit.test.ts` imports action files and runs them with `runAction` from `nuxt-actions/testing`, without starting Nuxt. See the [Testing guide](https://billymaulana.github.io/nuxt-actions/guide/testing).
- **`originMiddleware`** — rejects cross-site posts from the `Sec-Fetch-Site` and `Origin` headers, with no token. See `/security`.
- **Retry-After** — the rate-limited action sends `retryAfter` and the `RateLimit-*` headers, and one button waits for the limit with `retry: { respectRetryAfter: true }`. See `/security`.
- **Upload progress** — `uploadProgress: true` drives a progress bar while the avatar uploads. See `/uploads`.
- **`callAction`** — run an action from an API route or another action, with its validation and middleware.
- **Nitro v3 support** — the example runs unchanged on Nitro v2 and on Nitro v3 (add `nitro` to the dependencies), and request bodies parse the same way on both. See the [Server Runtimes guide](https://billymaulana.github.io/nuxt-actions/guide/server-runtimes).
- **CSRF from the browser** — `csrfMiddleware` sets a cookie that client code can read, keeps the token across safe requests, and passes it to handlers as `ctx.csrfToken`. See the live demo on `/security`.
- **`reconcile` for optimistic updates** — merge a partial server response, such as one updated todo, into the optimistic list. See `/optimistic`.
- **`optimisticData` follows `currentData`** — refetched or newly added items show up without calling `reset()`.
- **Streaming fixes** — stream actions no longer hang on validation errors, and slow clients get backpressure on Nitro v3. See `/streaming`.

## What's New in v1.3.0

- **Idempotency** — `idempotency` option replays duplicate `Idempotency-Key` requests instead of re-running the handler (double-charge protection). See `/payments`.
- **Global action hooks** — `action:start/success/error/settled` on `nuxtApp` for analytics, toasts, and monitoring. See `/observability`.
- **Retry backoff** — `retry: { backoff: 'exponential' | 'linear', maxDelay, jitter }`. See `/resilience`.
- **`cancelPrevious` + `cancel()`** — abort the previous/in-flight request for stale-free type-ahead search. See `/resilience`.
- **Typed error codes** — `ActionErrorCode` union + client-side `isActionError`.
- **Grouped namespace** — `actions.admin.metrics` mirrors the directory structure alongside flat exports.

## What's New in v1.2.0

- **Smart Cache Invalidation** — `useActionMutation` auto-refetches the queries a write affects, targeting typed action references and/or string tags. Adds `invalidateTags()` and a `tags` option on `useActionQuery`. See `/mutations`.
- **File Uploads** — `multipart/form-data` requests are parsed into typed `{ filename, type, data }` file fields. See `/uploads`.
- **Auth Preset** — `defineAuthMiddleware` resolves the current user into `ctx.user` or rejects with a typed 401. See `/auth`.
- **OpenAPI & Swagger UI** — generate an OpenAPI 3.1 document (and optional Swagger UI) from your actions via the `openapi` module option. See `/openapi`.
- **CLI Scaffolding** — `npx nuxt-actions add <name>` generates a typed action file.
- **DevTools** — the actions tab lists each endpoint with a ready-to-copy curl snippet.

This example runs on **Nuxt 4.7** with Zod 4.

## What's New in v1.1.0+

- **Nuxt 4 Compatibility** — Full support for Nuxt 4 module structure
- **useActionQuery Enhancements** — `refetchInterval`, `refetchOnFocus`, `refetchOnReconnect`, `enabled` toggle, and `transform`
- **useInfiniteActionQuery** — Cursor-based pagination with `fetchNextPage` / `hasNextPage`
- **useActions** — Batch execution of multiple actions (parallel or sequential)
- **useActionState** — Progressive enhancement for forms that work with and without JavaScript
- **prefetchAction** — Pre-warm the Nuxt data cache ahead of time (hover, route prefetch, idle)
- **useStreamActionQuery** — Streaming with persistent cache (restore chunks on remount)
- **rateLimitMiddleware** — In-memory rate limiting per IP with configurable window and limit
- **csrfMiddleware** — CSRF token protection with cookie/header matching and timing-safe comparison
- **returnValidationErrors** — Throw structured field-level validation errors from handlers
- **Action Colocation** — Define actions alongside pages or in any `server/actions/` subdirectory

## What This Demonstrates

- **E2E Type Inference** — Import typed action refs from `#actions` with zero generics
- **Standard Schema** — Zod validation with automatic field-level error formatting
- **Form Actions** — `useFormAction` with dirty tracking, field errors, and reset
- **Optimistic Updates** — Instant UI with automatic rollback on server error
- **SSR Queries** — Server-rendered data with reactive re-fetching and transform
- **Streaming** — Real-time SSE chunks with `stop()` control and persistent cache
- **Middleware Chain** — Reusable auth/rate-limit middleware with typed context accumulation
- **Retry & Timeout** — Configurable retry with status code matching and request timeout
- **Dedupe & Throttle** — Cancel/defer duplicate requests and throttle rapid calls
- **Output Validation** — Server validates both input AND output schemas
- **Custom Headers** — Static and dynamic header passing per-request
- **executeAsync** — Throw-on-error alternative to `execute()`
- **Security Middleware** — Rate limiting and CSRF protection out of the box
- **Progressive Enhancement** — Native HTML form fallback with `useActionState`
- **Prefetch & Cache** — Pre-warm queries on hover, cache streamed results across navigations
- **Cache Management** — `invalidateActions` and `clearActionCache` for fine-grained cache control
- **Infinite Scroll** — Cursor-based pagination with SSR first page
- **Smart Cache Invalidation** — A mutation auto-refetches every query under a shared tag
- **File Uploads** — `multipart/form-data` parsed into typed file fields
- **Auth Preset** — `defineAuthMiddleware` for `ctx.user` resolution and 401 rejection
- **OpenAPI** — Generated OpenAPI 3.1 document and Swagger UI from your actions

## License

[MIT](./LICENSE)
