# Changelog

## v1.0.1 (2026-02-20)

### Fixes

- Widen `@nuxt/kit` dependency range to `^3.7.0 || ^4.0.0` for Nuxt 3.x compatibility
- Update module compatibility declaration to `^3.7.0 || ^4.0.0`
- Add `continue-on-error` to release workflow npm publish step

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
