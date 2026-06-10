# Observability

Per-call callbacks (`onSuccess`, `onError`) are great for component logic, but analytics, toasts, and monitoring want **one** place that sees every action. The global hooks fire for every `useAction` and `useOptimisticAction` call in the app.

## The Hooks

| Hook | Fires | Payload |
|------|-------|---------|
| `action:start` | request begins | `{ path, method, input }` |
| `action:success` | success envelope received | `{ path, method, input, data, durationMs }` |
| `action:error` | error envelope or network failure | `{ path, method, input, error, durationMs }` |
| `action:settled` | always, including aborts | `{ path, method, input, result, durationMs }` |

Aborted requests (`cancel()`, `cancelPrevious`, `reset()`) emit only `action:settled` — an intentional cancellation is not an error.

## Wiring Analytics in a Plugin

```ts
// plugins/action-analytics.ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('action:success', ({ path, durationMs }) => {
    useTrackEvent('action', { path, durationMs })
  })

  nuxtApp.hook('action:error', ({ path, error, durationMs }) => {
    useLogError(`${path} failed with ${error.code}`, { durationMs })
  })
})
```

Hooks are fully typed — payload types come from the module's `RuntimeNuxtHooks` augmentation, so `error.code` autocompletes the built-in [`ActionErrorCode`](/api/types) union.

## Global Toast on Errors

```ts
// plugins/action-toasts.ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('action:error', ({ error }) => {
    if (error.code === 'VALIDATION_ERROR') return /* forms render these inline */
    useToast().error(error.message)
  })
})
```

## Guarantees

- Hooks are **fire-and-forget**: a slow or throwing hook handler never delays or breaks `execute()`.
- Hook failures are swallowed silently — observability must not become a source of outages.
- Emission order per call: `start` → (`success` | `error`) → `settled`.

## Scope

Hooks cover the imperative action composables: `useAction`, `useActionMutation`, `useFormAction`, and `useOptimisticAction`. Query composables (`useActionQuery`, `useInfiniteActionQuery`) ride Nuxt's `useAsyncData` lifecycle, and streaming has its own chunk-level callbacks.

## Next Steps

- [useAction](/guide/use-action) -- Per-call callbacks for component-level logic
- [Error Handling](/guide/error-handling) -- The error envelope these hooks receive
- [Type Reference](/api/types) -- Hook payload interfaces
