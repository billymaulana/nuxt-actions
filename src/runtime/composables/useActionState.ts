import { ref, computed, readonly } from 'vue'
import type {
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseActionStateOptions,
  UseActionStateReturn,
} from '../types'
import { useAction } from './useAction'

/**
 * Composable for progressive enhancement with HTML forms.
 *
 * Wraps `useAction` internally and provides a `formAction` handler that
 * converts `FormData` to a plain object before executing the action.
 * Also exposes `formProps` for native `<form>` fallback when JavaScript
 * is unavailable.
 *
 * @example Basic usage with @submit.prevent:
 * ```ts
 * import { createTodo } from '#actions'
 * const { state, error, pending, formAction } = useActionState(createTodo)
 *
 * // In template:
 * // <form @submit.prevent="formAction(new FormData($event.target))">
 * //   <input name="title" />
 * //   <button :disabled="pending">Create</button>
 * // </form>
 * ```
 *
 * @example Progressive enhancement with native form fallback:
 * ```ts
 * import { createTodo } from '#actions'
 * const { formProps, formAction, state } = useActionState(createTodo)
 *
 * // In template:
 * // <form v-bind="formProps" @submit.prevent="formAction(new FormData($event.target))">
 * //   <input name="title" />
 * //   <button>Create</button>
 * // </form>
 * ```
 *
 * @example With initial state:
 * ```ts
 * const { state } = useActionState(createTodo, { initialState: { id: 0, title: '' } })
 * ```
 */

// Overload 1: typed reference (full inference)
export function useActionState<T extends TypedActionReference>(
  action: T,
  options?: UseActionStateOptions<InferActionOutput<T>>,
): UseActionStateReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: string path (manual generics)
export function useActionState<TInput = void, TOutput = unknown>(
  path: string,
  options?: UseActionStateOptions<TOutput>,
): UseActionStateReturn<TInput, TOutput>

// Implementation
export function useActionState(
  pathOrAction: string | TypedActionReference,
  options: UseActionStateOptions<unknown> = {},
): UseActionStateReturn<unknown, unknown> {
  const state = ref<unknown>(options.initialState ?? null)

  // Resolve the action path for formProps (native <form> fallback)
  const actionPath = typeof pathOrAction === 'string'
    ? pathOrAction
    : `/api/_actions/${pathOrAction.__actionPath}`

  // Delegate to useAction — the implementation accepts both string and TypedActionReference
  const { execute, error, isExecuting } = useAction(
    pathOrAction as string,
    {
      onSuccess: (data: unknown) => {
        state.value = data
      },
    },
  )

  /**
   * Convert FormData to a plain object and execute the action.
   * Handles multi-value fields (e.g. checkboxes) as arrays.
   */
  async function formAction(formData: FormData): Promise<void> {
    const obj: Record<string, unknown> = {}
    formData.forEach((value, key) => {
      if (key in obj) {
        const existing = obj[key]
        if (Array.isArray(existing)) {
          existing.push(value)
        }
        else {
          obj[key] = [existing, value]
        }
      }
      else {
        obj[key] = value
      }
    })
    await execute(obj)
  }

  const formProps = computed(() => ({
    action: actionPath,
    method: 'post',
  }))

  return {
    state: readonly(state) as Readonly<globalThis.Ref<unknown>>,
    error,
    pending: readonly(computed(() => isExecuting.value)) as Readonly<globalThis.Ref<boolean>>,
    formAction,
    formProps,
  }
}
