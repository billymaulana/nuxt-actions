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
import { buildFetchOptions, createDebouncedFn, createThrottledFn, emitActionHook, isAbortRejection, isTimeoutAbort, TIMEOUT_ABORT_REASON } from './_utils'

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

  async function execute(input: unknown): Promise<ActionResult<unknown>> {
    // Abort previous in-flight request
    currentController?.abort()
    const controller = new AbortController()
    currentController = controller

    const thisCallId = ++callCounter

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
     * ofetch silently ignores its timeout option when an external signal is
     * provided, so the timeout is enforced here on the owned controller.
     */
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined
    if (options.timeout && options.timeout > 0) {
      timeoutTimer = setTimeout(() => controller.abort(TIMEOUT_ABORT_REASON), options.timeout)
    }

    try {
      const fetchOptions = buildFetchOptions({
        method,
        input,
        headers: options.headers,
        retry: options.retry,
        signal: controller.signal,
      })

      const result = await appFetch<ActionResult<unknown>>(
        path,
        fetchOptions,
      )

      const durationMs = Date.now() - startedAt
      if (result.success) {
        const transformed = options.transform ? options.transform(result.data as never) : result.data
        data.value = transformed
        // Update optimisticData with server truth
        optimisticData.value = transformed
        status.value = 'success'
        options.onSuccess?.(result.data)
        options.onSettled?.(result)
        emitActionHook(nuxtApp, 'action:success', { path, method, input, data: result.data, durationMs })
        emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })
        return result
      }
      else {
        // Only rollback if no newer call has superseded this one
        if (callCounter === thisCallId) {
          optimisticData.value = snapshot
        }
        error.value = result.error
        status.value = 'error'
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
       * AbortError in a FetchError. Intentional cancellation must NOT roll
       * back the optimistic data.
       */
      /*
       * A superseded call is always aborted first (execute/reset/dispose all
       * abort the previous controller), so reaching the timeout or generic
       * branches below implies this call is still the latest — rollback is
       * safe without a counter check.
       */
      if (isAbortRejection(err, controller.signal)) {
        if (isTimeoutAbort(controller.signal)) {
          optimisticData.value = snapshot
          const timeoutError: ActionError = {
            code: 'TIMEOUT_ERROR',
            message: `Request timed out after ${options.timeout}ms`,
            statusCode: 408,
          }
          error.value = timeoutError
          status.value = 'error'
          const result: ActionResult<unknown> = { success: false, error: timeoutError }
          options.onError?.(timeoutError)
          options.onSettled?.(result)
          emitActionHook(nuxtApp, 'action:error', { path, method, input, error: timeoutError, durationMs })
          emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })
          return result
        }

        if (currentController === controller) {
          status.value = 'idle'
        }
        const abortResult: ActionResult<unknown> = {
          success: false,
          error: { code: 'ABORT_ERROR', message: 'Request was aborted', statusCode: 0 },
        }
        options.onSettled?.(abortResult)
        emitActionHook(nuxtApp, 'action:settled', { path, method, input, result: abortResult, durationMs })
        return abortResult
      }

      optimisticData.value = snapshot

      const actionError: ActionError = {
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Failed to execute action',
        statusCode: 0,
      }

      error.value = actionError
      status.value = 'error'

      const result: ActionResult<unknown> = { success: false, error: actionError }
      options.onError?.(actionError)
      options.onSettled?.(result)
      emitActionHook(nuxtApp, 'action:error', { path, method, input, error: actionError, durationMs })
      emitActionHook(nuxtApp, 'action:settled', { path, method, input, result, durationMs })

      return result
    }
    finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }
  }

  function reset() {
    // Abort any in-flight request
    if (currentController) {
      currentController.abort()
      currentController = null
    }
    optimisticData.value = toValue(options.currentData)
    data.value = null
    error.value = null
    status.value = 'idle'
  }

  // Wrap execute with debounce or throttle if configured (debounce takes priority)
  let wrappedExecute = execute
  if (options.debounce && options.debounce > 0) {
    wrappedExecute = createDebouncedFn(execute, options.debounce) as unknown as typeof execute
  }
  else if (options.throttle && options.throttle > 0) {
    wrappedExecute = createThrottledFn(execute, options.throttle) as unknown as typeof execute
  }

  function cancel() {
    if (wrappedExecute !== execute && 'cancel' in wrappedExecute) {
      (wrappedExecute as { cancel: () => void }).cancel()
    }
    currentController?.abort()
  }

  // Clean up timers and in-flight requests on scope dispose
  if (wrappedExecute !== execute && 'cancel' in wrappedExecute) {
    onScopeDispose(() => (wrappedExecute as { cancel: () => void }).cancel())
  }
  onScopeDispose(() => {
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  })

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
