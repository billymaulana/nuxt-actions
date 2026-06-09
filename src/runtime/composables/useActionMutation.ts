import type {
  ActionResult,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseActionMutationOptions,
  UseActionReturn,
} from '../types'
import { useAction } from './useAction'
import { invalidateActions, invalidateTags } from './invalidateActions'

/**
 * Composable to call a write action and automatically invalidate the queries it
 * affects on success. Targets in `invalidates` are typed action references
 * (objects) and/or tag strings.
 *
 * @example
 * ```ts
 * import { createTodo, listTodos } from '#actions'
 * const { execute } = useActionMutation(createTodo, { invalidates: [listTodos, 'todos'] })
 * await execute({ title: 'Buy milk' })
 * ```
 */

// Overload 1: typed reference (E2E inference)
export function useActionMutation<T extends TypedActionReference>(
  action: T,
  options?: UseActionMutationOptions<InferActionInput<T>, InferActionOutput<T>>,
): UseActionReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: string path
export function useActionMutation<TInput = void, TOutput = unknown>(
  path: string,
  options?: UseActionMutationOptions<TInput, TOutput>,
): UseActionReturn<TInput, TOutput>

// Implementation
export function useActionMutation(
  pathOrAction: string | TypedActionReference,
  options: UseActionMutationOptions<unknown, unknown> = {},
): UseActionReturn<unknown, unknown> {
  const base = useAction(pathOrAction as never, options as never) as UseActionReturn<unknown, unknown>

  const targets = options.invalidates ?? []
  const refs = targets.filter((t): t is TypedActionReference => typeof t === 'object')
  const tags = targets.filter((t): t is string => typeof t === 'string')
  const awaitInvalidation = options.awaitInvalidation ?? true

  async function runInvalidation(): Promise<void> {
    const tasks: Array<Promise<void>> = []
    if (refs.length > 0) tasks.push(invalidateActions(refs))
    if (tags.length > 0) tasks.push(invalidateTags(tags))
    if (tasks.length === 0) return
    if (awaitInvalidation) await Promise.all(tasks)
  }

  async function execute(input: unknown): Promise<ActionResult<unknown>> {
    const result = await base.execute(input)
    if (result.success) await runInvalidation()
    return result
  }

  async function executeAsync(input: unknown): Promise<unknown> {
    const result = await execute(input)
    if (result.success) return result.data
    throw result.error
  }

  return { ...base, execute, executeAsync }
}
