import { ref, computed, readonly } from 'vue'
import { useNuxtApp } from '#app'
import type {
  ActionError,
  ActionResult,
  TypedActionReference,
  UseActionsOptions,
} from '../types'

/**
 * Composable for batch / parallel execution of multiple server actions.
 *
 * Accepts an array of action references and returns an `execute` function
 * that runs all actions with corresponding inputs. Supports both parallel
 * (default, `Promise.allSettled`) and sequential execution modes.
 *
 * @example Parallel execution:
 * ```ts
 * import { createTodo, listTodos } from '#actions'
 * const { execute, pending, results, errors } = useActions([createTodo, listTodos])
 * const res = await execute([{ title: 'New' }, {}])
 * ```
 *
 * @example Sequential execution:
 * ```ts
 * const { execute } = useActions([step1, step2, step3], { mode: 'sequential' })
 * await execute([inputA, inputB, inputC])
 * ```
 */
export function useActions(
  actions: (TypedActionReference | string)[],
  options: UseActionsOptions = {},
) {
  const nuxtApp = useNuxtApp()

  // Nuxt 3 exposes $fetch on nuxtApp; Nuxt 4 removed it — fall back to global $fetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appFetch: typeof $fetch = (nuxtApp as any).$fetch ?? $fetch

  const pending = ref(false)
  const results = ref<(ActionResult<unknown> | null)[]>(actions.map(() => null))
  const errors = ref<(ActionError | null)[]>(actions.map(() => null))

  const hasErrors = computed(() => errors.value.some(Boolean))

  function resolveAction(action: TypedActionReference | string) {
    if (typeof action === 'string') {
      return { path: action, method: 'POST' }
    }
    return {
      path: `/api/_actions/${action.__actionPath}`,
      method: action.__actionMethod,
    }
  }

  function buildFetchOpts(method: string, input: unknown): Record<string, unknown> {
    const isBody = method === 'POST' || method === 'PUT' || method === 'PATCH'
    const opts: Record<string, unknown> = { method }
    if (isBody) {
      opts.body = input ?? {}
    }
    else {
      opts.query = input ?? {}
    }
    return opts
  }

  async function executeSingle(
    action: TypedActionReference | string,
    input: unknown,
  ): Promise<ActionResult<unknown>> {
    const { path, method } = resolveAction(action)
    try {
      return await appFetch<ActionResult<unknown>>(path, buildFetchOpts(method, input))
    }
    catch (err: unknown) {
      const actionError: ActionError = {
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Failed to execute action',
        statusCode: 0,
      }
      return { success: false, error: actionError }
    }
  }

  async function execute(inputs: unknown[]): Promise<ActionResult<unknown>[]> {
    pending.value = true
    errors.value = actions.map(() => null)
    results.value = actions.map(() => null)

    let settled: ActionResult<unknown>[]

    if (options.mode === 'sequential') {
      settled = []
      for (let i = 0; i < actions.length; i++) {
        const result = await executeSingle(actions[i], inputs[i])
        settled.push(result)
      }
    }
    else {
      const outcomes = await Promise.allSettled(
        actions.map((action, i) => executeSingle(action, inputs[i])),
      )
      settled = outcomes.map((outcome) => {
        if (outcome.status === 'fulfilled') return outcome.value
        const actionError: ActionError = {
          code: 'FETCH_ERROR',
          message: outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error',
          statusCode: 0,
        }
        return { success: false as const, error: actionError }
      })
    }

    results.value = settled
    errors.value = settled.map(r => r.success ? null : r.error)
    pending.value = false

    return settled
  }

  return {
    execute,
    pending: readonly(pending) as Readonly<globalThis.Ref<boolean>>,
    results: readonly(results) as Readonly<globalThis.Ref<(ActionResult<unknown> | null)[]>>,
    errors: readonly(errors) as Readonly<globalThis.Ref<(ActionError | null)[]>>,
    hasErrors,
  }
}
