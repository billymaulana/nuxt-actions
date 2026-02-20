import { reactive, ref, computed, watch, toRaw } from 'vue'
import type {
  ActionResult,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseFormActionOptions,
  UseFormActionReturn,
} from '../types'
import { useAction } from './useAction'

// ── Overloads ───────────────────────────────────────────────────

// Overload 1: typed reference
export function useFormAction<T extends TypedActionReference>(
  action: T,
  options: UseFormActionOptions<InferActionInput<T>, InferActionOutput<T>>,
): UseFormActionReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: string path
export function useFormAction<TInput = void, TOutput = unknown>(
  path: string,
  options: UseFormActionOptions<TInput, TOutput>,
): UseFormActionReturn<TInput, TOutput>

// ── Implementation ──────────────────────────────────────────────

export function useFormAction(
  pathOrAction: string | TypedActionReference,
  options: UseFormActionOptions<unknown, unknown>,
): UseFormActionReturn<unknown, unknown> {
  // Deep clone initial values to prevent mutation
  const initialSnapshot = JSON.parse(JSON.stringify(options.initialValues))
  const fields = reactive(JSON.parse(JSON.stringify(initialSnapshot)))

  // Wrap the underlying useAction
  const { execute, data, error, status, reset: resetAction, isExecuting } = useAction(
    pathOrAction as string,
    {
      method: options.method,
      headers: options.headers,
      retry: options.retry,
      timeout: options.timeout,
      dedupe: options.dedupe,
      debounce: options.debounce,
      throttle: options.throttle,
      onSuccess: options.onSuccess as (data: unknown) => void,
      onError: options.onError,
      onSettled: options.onSettled as (result: ActionResult<unknown>) => void,
    },
  )

  // Extract field-level errors from VALIDATION_ERROR responses
  const fieldErrors = computed<Record<string, string[]>>(() => {
    if (error.value?.code === 'VALIDATION_ERROR' && error.value.fieldErrors) {
      return error.value.fieldErrors
    }
    return {}
  })

  // Track dirty state with a watch-based flag for better performance.
  // Only runs JSON comparison when a field actually changes, not on every read.
  const dirtyFlag = ref(false)
  watch(() => fields, () => {
    dirtyFlag.value = JSON.stringify(toRaw(fields)) !== JSON.stringify(initialSnapshot)
  }, { deep: true, flush: 'sync' })
  const isDirty = computed(() => dirtyFlag.value)

  const isSubmitting = computed(() => isExecuting.value)

  async function submit(): Promise<ActionResult<unknown>> {
    return execute(JSON.parse(JSON.stringify(toRaw(fields))))
  }

  function reset() {
    // Restore fields to initial values
    const fresh = JSON.parse(JSON.stringify(initialSnapshot))
    for (const key of Object.keys(fields as Record<string, unknown>)) {
      if (!(key in fresh)) {
        Reflect.deleteProperty(fields as Record<string, unknown>, key)
      }
    }
    Object.assign(fields, fresh)
    dirtyFlag.value = false

    // Reset underlying action state
    resetAction()
  }

  return {
    fields,
    submit,
    fieldErrors,
    isDirty,
    reset,
    status,
    error,
    data,
    isSubmitting,
  }
}
