# Changelog

## v1.3.0 (2026-06-10)

### Features

- **Idempotency** — `defineAction({ idempotency })` and `createActionClient().idempotency()` replay a stored result for duplicate `Idempotency-Key` requests (Stripe-style semantics): same key + same payload replays without re-running the handler, a different payload returns `422 IDEMPOTENCY_KEY_REUSE`, concurrent duplicates await the in-flight execution, and failures stay retryable. Keys are scopable per identity via `scope` (recommended: session user id, since replay skips middleware), storage is pluggable via `IdempotencyStore` (bounded in-memory default; `createMemoryIdempotencyStore` exported), and store outages degrade gracefully (best-effort persistence, binary inputs fingerprinted by digest).
- **Global action hooks** — `action:start`, `action:success`, `action:error`, and `action:settled` fire on `nuxtApp` for every `useAction`/`useOptimisticAction` call (and the composables built on them), with typed payloads including `durationMs`. Fire-and-forget: a slow or throwing hook never affects the action.
- **Retry backoff** — `retry: { backoff: 'exponential' | 'linear', maxDelay, jitter }` grows delays per attempt, caps them, and randomizes within [50%, 100%] to avoid thundering-herd retries. The default stays flat.
- **`cancelPrevious` + `cancel()`** — `cancelPrevious: true` on `useAction`/`useFormAction` is shorthand for `dedupe: 'cancel'` (type-ahead search), and the new `cancel()` method — available on `useAction`, `useOptimisticAction`, and `useFormAction` — aborts the in-flight request without clearing state (unlike `reset()`). `useOptimisticAction` always cancels the previous request. Abort detection now keys off the owned AbortController signal, and the `timeout` option is enforced client-side (`TIMEOUT_ERROR`, 408) since ofetch ignores its timeout when an external signal is set.
- **Typed error codes** — `ActionError.code` is now the open union `ActionErrorCode` (all built-in codes with autocomplete, custom codes still assignable), and `isActionError` is auto-imported client-side for narrowing unknown errors.
- **Grouped `actions` namespace** — `#actions` additionally exports one `actions` object mirroring the directory structure: `actions.auth.login` is the same typed reference as the flat `authLogin`. Collisions warn at build time and fall back to flat exports.

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
