import type { ActionMiddleware } from '../../types'

/**
 * Define a reusable middleware for actions.
 *
 * @example
 * ```ts
 * export const authMiddleware = defineMiddleware(async ({ event, ctx, next }) => {
 *   const session = await getUserSession(event)
 *   if (!session) {
 *     throw createActionError({
 *       code: 'UNAUTHORIZED',
 *       message: 'Authentication required',
 *       statusCode: 401,
 *     })
 *   }
 *   return next({ ctx: { user: session.user } })
 * })
 * ```
 */
export function defineMiddleware<
  TCtxIn extends Record<string, unknown> = Record<string, unknown>,
  TCtxOut extends Record<string, unknown> = TCtxIn,
>(fn: ActionMiddleware<TCtxIn, TCtxOut>): ActionMiddleware<TCtxIn, TCtxOut> {
  return fn
}

/**
 * Create a standalone, publishable middleware for actions.
 * Identical to `defineMiddleware` but signals intent for npm-publishable middleware.
 *
 * @example
 * ```ts
 * // Published as a separate npm package
 * export const rateLimitMiddleware = createMiddleware(async ({ event, next }) => {
 *   await checkRateLimit(event)
 *   return next()
 * })
 * ```
 */
export const createMiddleware = defineMiddleware
