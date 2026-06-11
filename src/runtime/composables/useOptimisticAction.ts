import type { Ref } from 'vue'
import { ref, computed, readonly, toValue, onScopeDispose } from 'vue'
import { useNuxtApp } from '#app'
import type {
  ActionStatus,
  ActionError,
  ActionResult,
  UseOptimisticActionOptions,
  UseOptimisticActionReturn,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
} from '../types'
import { buildFetchOptions, createDebouncedFn, createThrottledFn, emitActionHook, isAbortRejection, abortResult, raceAbort } from './_utils'

/**
 * Composable for optimistic updates with automatic rollback on error.
 *
 * Supports two calling styles:
 * 1. **Typed reference** (E2E inference):
 *    ```ts
 *    import { toggleTodo } from '#actions'
 *    const { execute, optimisticData } = useOptimisticAction(toggleTodo, { ... })
 *    ```
 *
 * 2. **String path** (backward compatible):
 *    ```ts
 *    const { execute, optimisticData } = useOptimisticAction('/api/todos/toggle', { ... })
 *    ```
 */

// Overload 1: typed reference
export function useOptimisticAction<T extends TypedActionReference, TData = InferActionOutput<T>>(
  action: T,
  options: UseOptimisticActionOptions<InferActionInput<T>, InferActionOutput<T>, TData>,
): UseOptimisticActionReturn<InferActionInput<T>, InferActionOutput<T>, TData>

// Overload 2: string path (backward compatible)
export function useOptimisticAction<TInput = void, TOutput = unknown, TData = TOutput>(
  path: string,
  options: UseOptimisticActionOptions<TInput, TOutput, TData>,
): UseOptimisticActionReturn<TInput, TOutput, TData>

// Implementation
export function useOptimisticAction(
  pathOrAction: string | TypedActionReference,
  options: UseOptimisticActionOptions<unknown, unknown, unknown>,
): UseOptimisticActionReturn<unknown, unknown, unknown> {
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

  const optimisticData = ref<unknown>(toValue(options.currentData))
  const data = ref<unknown>(null)
  const error = ref<ActionError | null>(null)
  const status = ref<ActionStatus>('idle')

  const isIdle = computed(() => status.value === 'idle')
  const isExecuting = computed(() => status.value === 'executing')
  const hasSucceeded = computed(() => status.value === 'success')
  const hasErrored = computed(() => status.value === 'error')

  // Track concurrent calls to prevent stale rollbacks
  let callCounter = 0
  let currentController: AbortController | null = null
  /* All in-flight controllers, so cancel()/reset() abort stragglers too. */
  const live = new Set<AbortController>()

  async function execute(input: unknown): Promise<ActionResult<unknown>> {
    // Abort previous in-flight request
    currentController?.abort()
    const controller = new AbortController()
    currentController = controller
    live.add(controller)

    const thisCallId = ++callCounter
    const isLatest = () => callCounter === thisCallId

    // Save snapshot for rollback — deep clone to prevent nested mutation from corrupting the snapshot.
    // Uses JSON round-trip instead of structuredClone because Vue reactive proxies are not cloneable,
    // and optimistic data is always JSON-serializable (it round-trips through HTTP).
    const snapshot = JSON.parse(JSON.stringify(optimisticData.value))

    // Apply optimistic update from latest optimistic state (not currentData)
    // to correctly chain rapid successive calls
    optimisticData.value = options.updateFn(input, optimisticData.value)

    options.onExecute?.(input)
    const startedAt = Date.now()
    emitActionHook(nuxtApp, 'action:start', { path, method, input })

    status.value = 'executing'
    error.value = null

    /*
     * ofetch ignores its timeout option when an external signal is provided,
     * so the deadline is enforced here. Aborting with no reason yields a real
     * AbortError that stops ofetch's retry loop. `timedOut` distinguishes a
     * timeout from a manual cancel.
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
      const result = await raceAbort(fetchPromise, controller.signal)

      const durationMs = Date.now() - startedAt
      /*
       * Only the latest call writes shared state. A superseded call is usually
       * aborted first, but if its fetch had already settled when the newer call
       * fired, raceAbort resolves with the stale result (the resolve microtask
       * was queued before the abort) — so it can still reach these branches.
       */
      if (result.success) {
        const transformed = options.transform ? options.transform(result.data as never) : result.data
        if (isLatest()) {
          data.value = transformed
          optimisticData.value = transformed
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
          optimisticData.value = snapshot
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
       * Abort detection keys off the owned signal — ofetch wraps the native
       * AbortError in a FetchError. A timeout rolls back; an intentional
       * cancel does NOT roll back the optimistic data.
       */
      if (timedOut || isAbortRejection(err, controller.signal)) {
        if (timedOut) {
          /*
           * A timeout means THIS call's own timer fired. A superseded call is
           * aborted by the newer execute(), which clears this timer, so a timed-
           * out call is always still the latest — no isLatest guard needed.
           */
          const timeoutError: ActionError = {
            code: 'TIMEOUT_ERROR',
            message: `Request timed out after ${options.timeout}ms`,
            statusCode: 408,
          }
          optimisticData.value = snapshot
          error.value = timeoutError
          status.value = 'error'
          const result: ActionResult<unknown> = { success: false, error: timeoutError }
          options.onError?.(timeoutError)
          options.onSettled?.(result)
          emitActionHook(nuxtApp, 'action:error', { path, method, input, error: timeoutError, durationMs })
          emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })
          return result
        }

        // A superseded (aborted) call must not reset the newer call's state.
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
        optimisticData.value = snapshot
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
      live.delete(controller)
      // Swallow the loser of the race (ofetch may reject later after retries)
      fetchPromise.catch(() => {})
    }
  }

  function abortAll() {
    for (const controller of live) controller.abort()
    live.clear()
    currentController = null
  }

  function reset() {
    abortAll()
    optimisticData.value = toValue(options.currentData)
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
    abortAll()
    // Explicit cancel returns to idle without rolling back optimistic data.
    if (status.value === 'executing') status.value = 'idle'
  }

  // Clean up timers and in-flight requests on scope dispose
  if (wrappedExecute !== execute && 'cancel' in wrappedExecute) {
    onScopeDispose(() => (wrappedExecute as { cancel: () => void }).cancel())
  }
  onScopeDispose(abortAll)

  return {
    execute: wrappedExecute,
    optimisticData: readonly(optimisticData) as Readonly<Ref<unknown>>,
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
