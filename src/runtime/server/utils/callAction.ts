import type { ServerEvent } from '../internal/server-runtime'
import type { ActionInputArgs, ActionResult, ServerAction } from '../../types'

/**
 * Run an action from server code, such as an API route, server middleware,
 * or another action, without an HTTP round trip.
 *
 * The input is validated, the action's middleware runs with `event`, and the
 * output is validated, exactly as for a request to the action's route. Body
 * parsing, idempotency replay, and the response cache are skipped, since
 * they belong to the HTTP request. Failures come back as an `ActionResult`
 * instead of being thrown.
 *
 * Middleware checks the outer request: CSRF and origin checks only run for
 * mutations, so call a mutation from a POST, PUT, PATCH, or DELETE route.
 *
 * @example
 * ```ts
 * // server/api/reports.post.ts
 * import createReport from '~~/server/actions/reports/create.post'
 *
 * export default defineEventHandler(async (event) => {
 *   const result = await callAction(event, createReport, await readBody(event))
 *   if (!result.success) throw createError({ statusCode: result.error.statusCode })
 *   return result.data
 * })
 * ```
 */
export function callAction<TAction extends ServerAction>(
  event: ServerEvent,
  action: TAction,
  ...args: ActionInputArgs<TAction['_types']['input']>
): Promise<ActionResult<TAction['_types']['output']>> {
  if (typeof (action as Partial<ServerAction> | null)?._run !== 'function') {
    throw new TypeError('[nuxt-actions] callAction expects an action created with defineAction or createActionClient.')
  }
  return action._run(args[0], event) as Promise<ActionResult<TAction['_types']['output']>>
}
