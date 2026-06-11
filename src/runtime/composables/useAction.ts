import type { Ref } from 'vue'
import { ref, computed, readonly, onScopeDispose } from 'vue'
import { useNuxtApp } from '#app'
import type {
  ActionStatus,
  ActionError,
  ActionResult,
  UseActionOptions,
  UseActionReturn,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
} from '../types'
import { buildFetchOptions, createDebouncedFn, createThrottledFn, emitActionHook, isAbortRejection, abortResult, raceAbort } from './_utils'

/**
 * Composable to call a server action with reactive state management.
 *
 * Supports two calling styles:
 * 1. **Typed reference** (E2E inference, no manual generics):
 *    ```ts
 *    import { createTodo } from '#actions'
 *    const { execute, data } = useAction(createTodo)
 *    ```
 *
 * 2. **String path** (backward compatible):
 *    ```ts
 *    const { execute, data } = useAction<{ title: string }, Todo>('/api/todos')
 *    ```
 */

// Overload 1: typed reference (E2E inference, no manual generics)
export function useAction<T extends TypedActionReference>(
  action: T,
  options?: UseActionOptions<InferActionInput<T>, InferActionOutput<T>>,
): UseActionReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: string path (backward compatible)
export function useAction<TInput = void, TOutput = unknown>(
  path: string,
  options?: UseActionOptions<TInput, TOutput>,
): UseActionReturn<TInput, TOutput>

// Implementation
export function useAction(
  pathOrAction: string | TypedActionReference,
  options: UseActionOptions<unknown, unknown> = {},
): UseActionReturn<unknown, unknown> {
  const nuxtApp = useNuxtApp()

  // Nuxt 3 exposes $fetch on nuxtApp; Nuxt 4 removed it — fall back to global $fetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appFetch: typeof $fetch = (nuxtApp as any).$fetch ?? $fetch

  let path: string
  let method: string

  if (typeof pathOrAction === 'string') {
    path = pathOrAction
    method = options.method ?? 'POST'
  }
  else {
    path = `/api/_actions/${pathOrAction.__actionPath}`
    method = pathOrAction.__actionMethod
  }

  const data = ref<unknown>(null)
  const error = ref<ActionError | null>(null)
  const status = ref<ActionStatus>('idle')

  const isIdle = computed(() => status.value === 'idle')
  const isExecuting = computed(() => status.value === 'executing')
  const hasSucceeded = computed(() => status.value === 'success')
  const hasErrored = computed(() => status.value === 'error')

  // Dedupe / lifecycle tracking
  let currentController: AbortController | null = null
  let currentPromise: Promise<ActionResult<unknown>> | null = null
  /* Every in-flight request, so cancel()/reset() abort stragglers, not just the latest. */
  const live = new Set<AbortController>()

  // cancelPrevious is sugar for dedupe: 'cancel'; an explicit dedupe wins
  const dedupe = options.dedupe ?? (options.cancelPrevious ? 'cancel' : undefined)

  async function execute(input: unknown): Promise<ActionResult<unknown>> {
    // Dedupe: 'defer' returns the existing in-flight promise
    if (currentPromise && dedupe === 'defer') {
      return currentPromise
    }

    // Dedupe: 'cancel' aborts previous in-flight request
    if (currentController && dedupe === 'cancel') {
      currentController.abort()
    }

    const controller = new AbortController()
    currentController = controller
    live.add(controller)

    const promise = _doExecute(input, controller)
    currentPromise = promise

    try {
      return await promise
    }
    finally {
      live.delete(controller)
      // Clear "latest" tracking only if this was still the latest request
      if (currentPromise === promise) {
        currentPromise = null
        currentController = null
      }
    }
  }

  async function _doExecute(
    input: unknown,
    controller: AbortController,
  ): Promise<ActionResult<unknown>> {
    /* Only the latest call writes the shared reactive state; stragglers are observers. */
    const isLatest = () => currentController === controller
    options.onExecute?.(input)
    const startedAt = Date.now()
    emitActionHook(nuxtApp, 'action:start', { path, method, input })

    status.value = 'executing'
    error.value = null

    /*
     * ofetch ignores its timeout option when an external signal is provided,
     * so the deadline is enforced here. Aborting with no reason produces a
     * real AbortError that stops ofetch's retry loop (a string reason would
     * leave it spinning through every remaining backoff). `timedOut`
     * distinguishes a timeout from a manual cancel.
     */
    let timedOut = false
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined
    if (options.timeout && options.timeout > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, options.timeout)
    }

    const fetchOptions = buildFetchOptions({
      method,
      input,
      headers: options.headers,
      retry: options.retry,
      signal: controller.signal,
    })
    const fetchPromise = appFetch<ActionResult<unknown>>(path, fetchOptions)

    try {
      /*
       * Race the request against its own abort so execute() settles the
       * instant the signal fires, instead of waiting out an in-progress
       * retry backoff sleep inside ofetch.
       */
      const result = await raceAbort(fetchPromise, controller.signal)

      const durationMs = Date.now() - startedAt
      if (result.success) {
        if (isLatest()) {
          data.value = options.transform ? options.transform(result.data as never) : result.data
          status.value = 'success'
        }
        options.onSuccess?.(result.data)
        options.onSettled?.(result)
        emitActionHook(nuxtApp, 'action:success', { path, method, input, data: result.data, durationMs })
        emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })
        return result
      }
      else {
        if (isLatest()) {
          error.value = result.error
          status.value = 'error'
        }
        options.onError?.(result.error)
        options.onSettled?.(result)
        emitActionHook(nuxtApp, 'action:error', { path, method, input, error: result.error, durationMs })
        emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })
        return result
      }
    }
    catch (err: unknown) {
      const durationMs = Date.now() - startedAt

      /*
       * Abort detection keys off the owned signal: ofetch wraps the native
       * AbortError in a FetchError, so the thrown value's identity is not
       * reliable across runtimes.
       */
      if (timedOut || isAbortRejection(err, controller.signal)) {
        if (timedOut) {
          const timeoutError: ActionError = {
            code: 'TIMEOUT_ERROR',
            message: `Request timed out after ${options.timeout}ms`,
            statusCode: 408,
          }
          if (isLatest()) {
            error.value = timeoutError
            status.value = 'error'
          }
          const result: ActionResult<unknown> = { success: false, error: timeoutError }
          options.onError?.(timeoutError)
          options.onSettled?.(result)
          emitActionHook(nuxtApp, 'action:error', { path, method, input, error: timeoutError, durationMs })
          emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })
          return result
        }

        // A stale aborted request must not clobber a newer in-flight call.
        if (isLatest()) {
          status.value = 'idle'
        }
        const aborted = abortResult()
        options.onSettled?.(aborted)
        emitActionHook(nuxtApp, 'action:settled', { path, method, input, result: aborted, durationMs })
        return aborted
      }

      const actionError: ActionError = {
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Failed to execute action',
        statusCode: 0,
      }

      if (isLatest()) {
        error.value = actionError
        status.value = 'error'
      }

      const result: ActionResult<unknown> = { success: false, error: actionError }
      options.onError?.(actionError)
      options.onSettled?.(result)
      emitActionHook(nuxtApp, 'action:error', { path, method, input, error: actionError, durationMs })
      emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })

      return result
    }
    finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      // Swallow the loser of the race (ofetch may reject later after retries)
      fetchPromise.catch(() => {})
    }
  }

  function abortAll() {
    for (const controller of live) controller.abort()
    live.clear()
    currentController = null
    currentPromise = null
  }

  function reset() {
    abortAll()
    data.value = null
    error.value = null
    status.value = 'idle'
  }

  // Wrap execute with debounce or throttle if configured (debounce takes priority)
  let wrappedExecute = execute
  if (options.debounce && options.debounce > 0) {
    wrappedExecute = createDebouncedFn(execute, options.debounce, abortResult) as unknown as typeof execute
  }
  else if (options.throttle && options.throttle > 0) {
    wrappedExecute = createThrottledFn(execute, options.throttle, abortResult) as unknown as typeof execute
  }

  function cancel() {
    if (wrappedExecute !== execute && 'cancel' in wrappedExecute) {
      (wrappedExecute as { cancel: () => void }).cancel()
    }
    for (const controller of live) controller.abort()
    live.clear()
    currentController = null
    currentPromise = null
    // Explicit cancel returns to idle without clearing data/error.
    if (status.value === 'executing') status.value = 'idle'
  }

  // Clean up timers and in-flight requests on scope dispose
  if (wrappedExecute !== execute && 'cancel' in wrappedExecute) {
    onScopeDispose(() => (wrappedExecute as { cancel: () => void }).cancel())
  }
  onScopeDispose(abortAll)

  // Defined after wrappedExecute so debounce/throttle is respected
  async function executeAsync(input: unknown): Promise<unknown> {
    const result = await wrappedExecute(input)
    if (result.success) {
      return result.data
    }
    throw result.error
  }

  return {
    execute: wrappedExecute,
    executeAsync,
    data: readonly(data) as Readonly<Ref<unknown>>,
    error: readonly(error) as Readonly<Ref<ActionError | null>>,
    status: readonly(status) as Readonly<Ref<ActionStatus>>,
    isIdle,
    isExecuting,
    hasSucceeded,
    hasErrored,
    cancel,
    reset,
  }
}
