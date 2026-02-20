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
import { buildFetchOptions, createDebouncedFn, createThrottledFn } from './_utils'

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
export function useOptimisticAction<T extends TypedActionReference>(
  action: T,
  options: UseOptimisticActionOptions<InferActionInput<T>, InferActionOutput<T>>,
): UseOptimisticActionReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: string path (backward compatible)
export function useOptimisticAction<TInput = void, TOutput = unknown>(
  path: string,
  options: UseOptimisticActionOptions<TInput, TOutput>,
): UseOptimisticActionReturn<TInput, TOutput>

// Implementation
export function useOptimisticAction(
  pathOrAction: string | TypedActionReference,
  options: UseOptimisticActionOptions<unknown, unknown>,
): UseOptimisticActionReturn<unknown, unknown> {
  const nuxtApp = useNuxtApp()

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

    status.value = 'executing'
    error.value = null

    try {
      const fetchOptions = buildFetchOptions({
        method,
        input,
        headers: options.headers,
        retry: options.retry,
        timeout: options.timeout,
        signal: controller.signal,
      })

      const result = await (nuxtApp.$fetch as typeof $fetch)<ActionResult<unknown>>(
        path,
        fetchOptions,
      )

      if (result.success) {
        data.value = result.data
        // Update optimisticData with server truth
        optimisticData.value = result.data
        status.value = 'success'
        options.onSuccess?.(result.data)
        options.onSettled?.(result)
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
        return result
      }
    }
    catch (err: unknown) {
      // Handle aborted requests — do NOT rollback optimistic data on intentional cancellation
      if (err instanceof DOMException && err.name === 'AbortError') {
        status.value = 'idle'
        const abortResult: ActionResult<unknown> = {
          success: false,
          error: { code: 'ABORT_ERROR', message: 'Request was aborted', statusCode: 0 },
        }
        options.onSettled?.(abortResult)
        return abortResult
      }

      // Only rollback if no newer call has superseded this one
      if (callCounter === thisCallId) {
        optimisticData.value = snapshot
      }

      const actionError: ActionError = {
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Failed to execute action',
        statusCode: 500,
      }

      error.value = actionError
      status.value = 'error'

      const result: ActionResult<unknown> = { success: false, error: actionError }
      options.onError?.(actionError)
      options.onSettled?.(result)

      return result
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
    wrappedExecute = createDebouncedFn(execute, options.debounce) as typeof execute
  }
  else if (options.throttle && options.throttle > 0) {
    wrappedExecute = createThrottledFn(execute, options.throttle) as typeof execute
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
    optimisticData: readonly(optimisticData) as Readonly<globalThis.Ref<unknown>>,
    data: readonly(data) as Readonly<globalThis.Ref<unknown>>,
    error: readonly(error) as Readonly<globalThis.Ref<ActionError | null>>,
    status: readonly(status) as Readonly<globalThis.Ref<ActionStatus>>,
    isIdle,
    isExecuting,
    hasSucceeded,
    hasErrored,
    reset,
  }
}
