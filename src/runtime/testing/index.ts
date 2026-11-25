import type { ActionResult } from '../types'
import { createTestEvent, getTestResponse, settleTestEvent } from './runtime'
import type { TestEvent, TestEventOptions, TestResponse } from './runtime'

export { nuxtActionsTesting } from './plugin'
export type { NuxtActionsTestingPlugin } from './plugin'
export { createTestEvent, getTestResponse } from './runtime'
export type { TestEvent, TestEventOptions, TestResponse } from './runtime'

export interface RunActionOptions<TInput = unknown> extends TestEventOptions {
  /** The input, as the client would send it. */
  input?: TInput
  /**
   * The action path, such as `todos/list`. It sets the request URL and turns
   * on the server cache, which is keyed by it.
   */
  path?: string
}

export interface RunActionResult<TOutput> extends TestResponse {
  result: ActionResult<TOutput>
  event: TestEvent
}

const actionUrls = new WeakMap<object, string>()
let lastActionId = 0

/** A URL per action, the same on every run, so idempotency keys of different actions stay apart as on a server. */
function urlOf(action: object): string {
  let url = actionUrls.get(action)
  if (url === undefined) {
    url = `/api/_actions/test-${++lastActionId}`
    actionUrls.set(action, url)
  }
  return url
}

interface RunnableAction<TInput, TOutput> {
  _execute: (rawInput: unknown, event: never, route?: { path: string }) => Promise<ActionResult<TOutput>>
  _types: { readonly input: TInput, readonly output: TOutput }
}

/**
 * Run an action the way its route would, on a test event: input validation,
 * middleware, idempotency, the handler, and output validation. Resolves with
 * the result plus the status, headers, and cookies the action set, once the
 * work handed to `event.waitUntil` is done.
 *
 * @example
 * ```ts
 * import { runAction } from 'nuxt-actions/testing'
 * import createTodo from '../server/actions/create-todo.post'
 *
 * const { result } = await runAction(createTodo, {
 *   input: { title: 'Buy milk' },
 *   context: { auth: { userId: 1 } },
 * })
 * ```
 */
export async function runAction<TInput, TOutput>(
  action: RunnableAction<TInput, TOutput>,
  options: RunActionOptions<TInput> = {},
): Promise<RunActionResult<TOutput>> {
  if (typeof (action as Partial<RunnableAction<TInput, TOutput>> | null)?._execute !== 'function') {
    throw new TypeError('[nuxt-actions] runAction expects an action created with defineAction or createActionClient.')
  }

  const { input, path, ...eventOptions } = options
  const route = path === undefined ? undefined : { path }
  const event = createTestEvent({ ...eventOptions, url: eventOptions.url ?? (route ? `/api/_actions/${route.path}` : urlOf(action)) })
  const result = await action._execute(input, event as never, route)
  await settleTestEvent(event)
  return { result, ...getTestResponse(event), event }
}
