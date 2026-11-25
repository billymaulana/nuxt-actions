# Changelog

## v1.5.0 (2026-11-26)

### Features

- **Server cache for GET actions** — `defineAction({ cache: { maxAge } })` and `createActionClient().cache()` keep successful `GET` and `HEAD` results on the server, for actions in `server/actions/` and for `defineAction` routes in `server/api/`. The cache sits after input validation and middleware, so authentication and rate limits still run on every request, and a hit skips the handler. A cached action needs an input schema, and entries are keyed by the validated input, so query parameters the schema drops cannot create new entries. `key` keeps results apart per user, `swr` with `staleMaxAge` serves a stale result while one refresh runs in the background through `event.waitUntil()`, and concurrent misses share one handler run. `invalidateActionCache(path, { key, input })` drops results from the action that changed the data, and `setActionCacheStore()` replaces the bounded in-memory store with a shared one. See the [Caching](https://billymaulana.github.io/nuxt-actions/guide/caching) guide.
- **`nuxt-actions/testing`** — the `nuxtActionsTesting()` Vitest plugin lets plain Vitest import action files, with the nuxt-actions server utils and the common h3 helpers installed as globals. `runAction(action, { input, headers, cookies, ip, context })` runs an action as its route would and returns the result with the status, headers, and cookies it set. `createTestEvent()` and `getTestResponse()` test a middleware on its own. See the [Testing](https://billymaulana.github.io/nuxt-actions/guide/testing) guide.
- **`originMiddleware()`** — CSRF protection without a token. Mutations from another site are rejected from the `Sec-Fetch-Site` header, with an `Origin` fallback for browsers that do not send it. `allowedOrigins` trusts other sites, and `requireOrigin` rejects requests that carry neither header.
- **`callAction(event, action, input)`** — runs an action from an API route, server middleware, or another action, with input validation, middleware, and output validation, and no HTTP round trip. Input and output are typed from the action.
- **Rate limit stores** — `rateLimitMiddleware({ store })` keeps counts in a shared store, such as Redis, so a limit holds across instances. `createMemoryRateLimitStore()` is the default. A failing store rejects with `503 RATE_LIMIT_STORE_ERROR`, or lets requests through with `passOnStoreError: true`.
- **Retry-After** — a rate-limited action fails with `retryAfter`, the seconds until the window ends, and the response carries a `Retry-After` header. `headers: true` adds `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. On the client, `retry: { respectRetryAfter: true }` waits as long as the server asks before it retries a `RATE_LIMIT` result or an HTTP error, and gives up when the wait is longer than `maxDelay` (30 seconds by default).
- **Upload progress** — `useAction(action, { uploadProgress: true })`, or `onUploadProgress`, reports how much of a `FormData` body has been sent in the `uploadProgress` ref. In the browser the request goes through `XMLHttpRequest`, and `$fetch` options, retry, timeout, and `cancel()` keep working.
- **Nitro v3 support** — on Nuxt 4.7+, apps that build with Nitro v3 (add `nitro` to your dependencies) get a server runtime written against `nuxt/server`, picked through `resolveServerVariant()` from `@nuxt/kit`. It works with and without `nitroLegacy` and with `future.compatibilityVersion: 5`. Apps on Nitro v2 keep the h3 runtime, unchanged. The module declares `compatibility.server: 'nuxt'`, so Nuxt never routes its server code through the Nitro v2 compatibility shims.
- **`ServerEvent` type** — exported from `nuxt-actions/types`. It resolves to h3's `H3Event` on Nitro v2 and to the portable `RequestEvent` on Nitro v3.
- **Streaming backpressure on Nitro v3** — stream actions write into a web `ReadableStream` with a 64 KiB buffer. `stream.send()` waits while a slow client catches up, and a client disconnect aborts `stream.signal`.
- **`reconcile` option for `useOptimisticAction`** — merges a server response of a different shape, such as one updated item, into the optimistic state. The types already allowed `currentData` to differ from the action output, but a successful call always replaced `optimisticData` with the response, so a list turned into a single item and the next update threw. Without `reconcile` the behavior is unchanged.

### Bug Fixes

- **Built-in middleware after typed context** — `rateLimitMiddleware()`, `csrfMiddleware()`, `originMiddleware()`, and other middleware that add no typed context failed to type-check in `.use()` after a middleware that did. They now keep the context collected so far.
- **Actions without input** — `execute()` and `executeAsync()` of `useAction`, `useOptimisticAction`, and the stream composables can be called without an argument when the action takes no input.
- **`useActionQuery` transform types** — `transform` can return another type than the action does, and `data` and `default` follow it.
- **Stream actions no longer hang on errors** — in `defineStreamAction`, a validation error, a middleware rejection, or an unexpected setup error left the request open forever on Nitro v2: the error frame was pushed before anything read the stream, and h3's event stream waits for a reader. The stream is now sent first, so the error frame is delivered and the response ends.
- Scanned actions and `defineAction` routes share one input parser. On Nitro v3 the body is read with h3 v1's media type rules, so JSON, urlencoded, text, and query input parse the same way on every runtime. Multipart bodies differ only for parts without a `Content-Type` and for malformed bodies; the [Server Runtimes](https://billymaulana.github.io/nuxt-actions/guide/server-runtimes) guide lists both.
- Idempotency keys are built from the request path without its query string on every runtime.
- **`csrfMiddleware` works from the browser** — the token cookie was `httpOnly`, so client code could never read it to send the matching header, and every safe request replaced the token. The cookie is now readable (the double-submit cookie pattern), a well-formed existing token is kept across safe requests, and handlers receive it as `ctx.csrfToken`. Mutations also reject a matching token that is not well formed (`CSRF token invalid`).
- **`optimisticData` follows `currentData` (behavior change)** — `useOptimisticAction` read `currentData` once, so a replaced value, such as a refetched list or a list with a newly created item, never reached `optimisticData` until `reset()`. It now follows `currentData` whenever no call is running, and still keeps the optimistic value while a call is in flight. If you never write confirmed results back to `currentData`, a later change to `currentData` now replaces them in `optimisticData`; sync `currentData` in `onSuccess`, as the guide recommends.
- **Optimistic calls settle onto the latest `currentData`** — a `currentData` change that arrives while a call is running is applied when the call settles: a failed call rolls back to the new value instead of the snapshot taken before the call, and a successful call with `reconcile` runs `updateFn` on the new value again before merging the response. `cancel()` still keeps the optimistic update, unless `currentData` changed during the call. A change made in the same tick right before `execute()` is the base of the optimistic update, and `status` is now `'executing'` by the time `onExecute` runs.
- **Error responses no longer carry the internal marker** — `createActionError` used to add `__isActionError: true` as a regular property, so it showed up in every error sent to the client. It is now non-enumerable and stays on the server.
- **`ActionFile` is auto-imported in server code** — the file uploads guide typed upload fields as `ActionFile`, but the type was never registered, so following the guide failed with `Cannot find name 'ActionFile'`.

### Compatibility

- Supports Nuxt 3.7+ and every Nuxt 4 release, on Nitro v2, and on Nitro v3 with and without `nitroLegacy`.
- The packed release was verified in fresh projects on Nuxt 3.7.4, 3.21.11, 4.5.2, 4.6.4, and 4.7.0, and on Nuxt 4.7.0 with Nitro v3, with and without `nitroLegacy`.
- See the [Server Runtimes](https://billymaulana.github.io/nuxt-actions/guide/server-runtimes) guide for the event shape on each runtime and how to move action code to Nitro v3.

### Examples and Docs

- The example app now lives in the repository under `example/`. CI lints, type-checks, and tests it against the module source, and it runs as a [live demo](https://nuxt-actions-demo.vercel.app). Example pages in the docs can run it in place.
- New pages for caching, testing, `originMiddleware`, and `callAction`, and an updated `rateLimitMiddleware` reference.

### Maintenance

- The module now depends on `destr`, the JSON parser h3 v1 uses, so request bodies parse the same way on Nitro v2 and Nitro v3.
- Development toolchain moved to Nuxt 4.7, Vitest 5, @nuxt/test-utils 4.4, pnpm 12, and the current GitHub Actions releases. pnpm settings now live in `pnpm-workspace.yaml`, because pnpm 12 ignores the `pnpm` field in `package.json` and pnpm settings in `.npmrc`.
- CI runs on Node.js 22, 24, and 26. It type-checks the playground and the example, runs the example and testing helper suites, and runs the end-to-end suite on Nitro v2, Nitro v3, Nitro v3 without `nitroLegacy`, and a Nuxt 5 preview, plus stream abort handling on the Nitro v3 dev server.
- Line endings are normalized to LF through `.gitattributes`, so Windows checkouts no longer break the CLI shebang.

## v1.3.0 (2026-06-11)

### Features

- **Idempotency** — `defineAction({ idempotency })` and `createActionClient().idempotency()` replay a stored result for duplicate `Idempotency-Key` requests (Stripe-style semantics): same key + same payload replays without re-running the handler, a different payload returns `422 IDEMPOTENCY_KEY_REUSE`, concurrent duplicates await the in-flight execution, and failures stay retryable. Keys are scopable per identity via `scope` (recommended: session user id, since replay skips middleware), storage is pluggable via `IdempotencyStore` (bounded in-memory default; `createMemoryIdempotencyStore` exported), and store outages degrade gracefully (best-effort persistence, binary inputs fingerprinted by digest).
- **Global action hooks** — `action:start`, `action:success`, `action:error`, and `action:settled` fire on `nuxtApp` for every `useAction`/`useOptimisticAction` call (and the composables built on them), with typed payloads including `durationMs`. Fire-and-forget: a slow or throwing hook never affects the action.
- **Retry backoff** — `retry: { backoff: 'exponential' | 'linear', maxDelay, jitter }` grows delays per attempt, caps them, and randomizes within [50%, 100%] to avoid thundering-herd retries. The default stays flat.
- **`cancelPrevious` + `cancel()`** — `cancelPrevious: true` on `useAction`/`useFormAction` is shorthand for `dedupe: 'cancel'` (type-ahead search), and the new `cancel()` method — available on `useAction`, `useOptimisticAction`, and `useFormAction` — aborts the in-flight request without clearing state (unlike `reset()`). `useOptimisticAction` always cancels the previous request. Abort detection now keys off the owned AbortController signal, and the `timeout` option is enforced client-side (`TIMEOUT_ERROR`, 408) since ofetch ignores its timeout when an external signal is set.
- **Typed error codes** — `ActionError.code` is now the open union `ActionErrorCode` (all built-in codes with autocomplete, custom codes still assignable), and `isActionError` is auto-imported client-side for narrowing unknown errors.
- **Grouped `actions` namespace** — `#actions` additionally exports one `actions` object mirroring the directory structure: `actions.auth.login` is the same typed reference as the flat `authLogin`. Collisions warn at build time and fall back to flat exports.

### Hardening (production-readiness audit)

- **SSR polling leak fixed** — `useActionQuery({ refetchInterval })` no longer starts its interval on the server, where the effect scope is never disposed (it leaked one timer per request and re-invoked the action forever).
- **No hydration mismatch in infinite queries** — `useInfiniteActionQuery` now derives the first page from `useAsyncData` at render time instead of via an immediate watcher Vue stops during SSR, so the first page renders in the server HTML. `hasNextPage`/`nextPageParam` are now reactively derived.
- **Stale responses never clobber newer state** — overlapping `useAction` calls (default concurrent) only let the latest call write `data`/`error`/`status`; `cancel()`/`reset()` now abort every in-flight request, not just the most recent.
- **Timeout settles immediately** — the `timeout` deadline now races the request, so it settles at the deadline instead of waiting out an in-progress retry-backoff sleep; the abort also stops ofetch's retry loop.
- **`cancel()` never throws** — cancelling a debounced/throttled call now settles pending callers with an `ABORT_ERROR` result instead of rejecting, keeping the documented "never throws" contract.
- **Idempotency races closed** — the in-flight claim is registered before the async store read (no double-run with shared/async stores), store keys are composed injectively (a client key can't collide across `scope`s), and fingerprints are stored as a constant-size SHA-256 digest.
- **Rate limiter is flood-resistant** — the per-request full-store prune is amortized to once per window (O(1) amortized) and the store is size-capped, removing an unauthenticated CPU/memory-exhaustion vector under spoofed-key floods.
- **Streaming detects disconnect** — `defineStreamAction` handlers receive `stream.signal`, which aborts when the client disconnects, so long-running handlers can stop instead of running to completion for a gone client.
- **Smart-cache lookup is O(matching keys)** — the tag registry is indexed tag → keys, so a mutation resolves affected queries without scanning every registered key.
- **OpenAPI document is built once** and cached per process; colocated action HMR no longer force-restarts the dev server every change.

## v1.2.0 (2026-06-10)

### Bug Fixes

- Generated `#actions` module no longer imports `nuxt-actions/dist/runtime/types` (an unexported subpath that broke consumer typechecking under modern module resolution); `TypedActionReference` is now inlined into the generated file, making it self-contained.
- `invalidateActions()` now resolves matching query keys and passes them to `refreshNuxtData` as an array — the previous predicate form was a no-op because `refreshNuxtData` only accepts `string | string[]`.
- Internal types now import `Ref`/`ComputedRef` from `vue` instead of relying on the ambient `globalThis.Ref`, so the package typechecks standalone.
- `useActionQuery`/`useInfiniteActionQuery` omit the `watch` option when no input is given instead of passing the invalid `watch: false`.
- Various internal type-soundness fixes across `defineAction`, `useAction`, `useActions`, `useActionState`, `useStreamActionQuery`, and the DevTools tab registration.

### Features

- **Smart cache invalidation** — `useActionMutation` auto-refetches affected queries after a successful mutation, targeting typed action references and/or string tags. Adds `invalidateTags()`, array support in `invalidateActions()`, and a `tags` option on `useActionQuery`.
- **CLI scaffolding** — `npx nuxt-actions add <name>` generates a typed action file (`--method`, `--dir`, `--schema`).
- **DevTools** — the actions tab lists each endpoint with a ready-to-copy curl snippet and an "Open docs" link.
- **OpenAPI** — generate an OpenAPI 3.1 document (and optional Swagger UI) from your actions via the `openapi` module option. Precise bodies for arktype and Zod 4; graceful fallback otherwise.
- **File uploads** — `multipart/form-data` requests are parsed into typed `ActionFile` fields.
- **Auth preset** — `defineAuthMiddleware` resolves the current user into `ctx.user` or rejects with 401.
- `useOptimisticAction` accepts a distinct `TData` for `currentData`/`updateFn`/`optimisticData`, so the optimistic source can be a collection different from the action output (e.g. optimistically updating a list).
- `ActionMiddleware` may return `void` (for the chain-skip pattern where a middleware does not call `next()`).

## v1.1.0 (2026-03-21)

### Bug Fixes

- Fix `nuxtApp.$fetch` undefined in Nuxt 4 — composables now fall back to global `$fetch` (#6)

### Features

- `useActionQuery`: add `refetchInterval` option for auto-polling at configurable intervals
- `useActionQuery`: add `refetchOnFocus` to refetch when browser tab regains focus
- `useActionQuery`: add `refetchOnReconnect` to refetch when network reconnects
- `useActionQuery`: add `enabled` option for conditional fetching (supports reactive refs)
- `useActionQuery`: add `transform` option to transform response data before storing
- `useAction` / `useOptimisticAction`: add `transform` option for response data transformation
- New composable `useInfiniteActionQuery` for infinite scroll and cursor-based pagination
- New composable `useActions` for batch/parallel execution of multiple actions
- New composable `useActionState` for progressive enhancement with HTML forms
- New composable `useStreamActionQuery` — streaming with automatic cache persistence
- New utility `prefetchAction` to pre-warm cache for action queries (e.g. on hover)
- New server utility `returnValidationErrors` for cleaner field-level validation in handlers
- New server middleware `rateLimitMiddleware` — in-memory rate limiting per action
- New server middleware `csrfMiddleware` — CSRF token protection for mutation actions
- Action file colocation with pages via `colocate: true` module option

## v1.0.3 (2026-02-21)

### Fixes

- Fix unhandled promise rejection in debounce/throttle when the wrapped function throws
- Fix middleware chain continuing when `next()` is not called — now breaks the chain instead
- Fix `useActionQuery` key compatibility with Nuxt 3.7–3.13 (evaluate key eagerly as string)
- Fix stream reader resource leak in `useStreamAction` (add `releaseLock()` in finally block)
- Fix TextDecoder incomplete flush after stream loop ends

### Security

- Prototype pollution protection in `formatStandardIssues` (null-prototype object)
- Error message sanitization for H3 errors (never leak `statusMessage` to client)
- `isActionError` uses `hasOwnProperty` to prevent prototype chain spoofing

### Docs

- Update middleware docs: clarify `next()` skip behavior (chain breaks, handler still runs)

## v1.0.2 (2026-02-20)

### Fixes

- Replace `AbortSignal.any()` with setTimeout+flag for Safari <17.4 / Node <20.3 compatibility
- Add structural `isActionError` detection for plain error objects (code+message+statusCode)
- Correct false CSRF protection claim in security docs
- Disable Dependabot auto-PRs (keep security alerts only)

## v1.0.1 (2026-02-20)

### Fixes

- Widen `@nuxt/kit` dependency range to `^3.7.0 || ^4.0.0` for Nuxt 3.x compatibility
- Update module compatibility declaration to `^3.7.0 || ^4.0.0`
- Switch release workflow to OIDC trusted publishing (no token rotation needed)

## v1.0.0 (2026-02-19)

Initial stable release.

### Features

- **Standard Schema** - Works with Zod, Valibot, ArkType, and any Standard Schema compliant library
- **`defineAction`** - Type-safe server actions with input and output schema validation
- **`createActionClient`** - Builder pattern for composing actions with middleware, schemas, and metadata
- **`useAction`** - Reactive Vue composable with status tracking, `executeAsync`, retry/backoff, and request deduplication
- **`useOptimisticAction`** - Optimistic updates with automatic rollback and AbortController support
- **`useActionQuery`** - SSR-capable GET action queries via `useAsyncData` with caching and reactive re-fetching
- **`defineStreamAction` + `useStreamAction`** - Server-side streaming actions using SSE for real-time AI/streaming use cases
- **`defineMiddleware` / `createMiddleware`** - Reusable middleware with typed context accumulation
- **`createActionError`** - Typed error creation with field-level details
- **`invalidateActions` / `clearActionCache`** - Cache management utilities for action queries
- **E2E Type Inference** - Auto-inferred types via `#actions` virtual module with zero manual generics
- **HMR Type Updates** - Action file changes regenerate types without dev server restart
- **DevTools Integration** - Nuxt DevTools tab showing registered actions
- **Security Hardened** - Prototype pollution protection, error sanitization, double `next()` prevention, malformed JSON detection
- **Output Validation** - Validate server responses, not just inputs
- **Retry/Backoff** - Native ofetch retry with `retry: true | number | { count, delay, statusCodes }`
- **Request Deduplication** - `dedupe: 'cancel' | 'defer'` to prevent duplicate requests
- **Custom Headers** - Per-request auth tokens via static headers or function
- **Debounce/Throttle** - Built-in debounce and throttle with cleanup on scope dispose
- **Zero Config** - Auto-imported server utilities and client composables
- **Comprehensive Tests** - Full test suite with unit, type, and integration coverage
