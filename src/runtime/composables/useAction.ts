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
import { buildFetchOptions, createDebouncedFn, createThrottledFn } from './_utils'

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

  // Dedupe tracking
  let currentController: AbortController | null = null
  let currentPromise: Promise<ActionResult<unknown>> | null = null

  async function execute(input: unknown): Promise<ActionResult<unknown>> {
    // Dedupe: 'defer' returns the existing in-flight promise
    if (currentPromise && options.dedupe === 'defer') {
      return currentPromise
    }

    // Dedupe: 'cancel' aborts previous in-flight request
    if (currentController && options.dedupe === 'cancel') {
      currentController.abort()
    }

    const controller = new AbortController()
    currentController = controller

    const promise = _doExecute(input, controller)
    currentPromise = promise

    try {
      return await promise
    }
    finally {
      // Clean up if this was the latest request
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
        status.value = 'success'
        options.onSuccess?.(result.data)
        options.onSettled?.(result)
        return result
      }
      else {
        error.value = result.error
        status.value = 'error'
        options.onError?.(result.error)
        options.onSettled?.(result)
        return result
      }
    }
    catch (err: unknown) {
      // Handle aborted requests (dedupe cancel or manual reset)
      if (err instanceof DOMException && err.name === 'AbortError') {
        status.value = 'idle'
        const abortResult: ActionResult<unknown> = {
          success: false,
          error: { code: 'ABORT_ERROR', message: 'Request was aborted', statusCode: 0 },
        }
        options.onSettled?.(abortResult)
        return abortResult
      }

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

      return result
    }
  }

  function reset() {
    // Abort any in-flight request
    if (currentController) {
      currentController.abort()
      currentController = null
      currentPromise = null
    }
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
      currentPromise = null
    }
  })

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
