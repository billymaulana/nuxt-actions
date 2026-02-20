# Changelog

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
