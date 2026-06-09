import type { H3Event } from 'h3'
import type { ActionMiddleware, AuthMiddlewareOptions } from '../../types'
import { createActionError } from './defineAction'

/**
 * Auth middleware preset. Resolves the current user and adds it to `ctx.user`,
 * or rejects with a 401 when no user is found and `optional` is not set.
 *
 * @example
 * ```ts
 * import { getUserSession } from '#imports'
 * const authed = createActionClient()
 *   .use(defineAuthMiddleware(e => getUserSession(e).then(s => s.user ?? null)))
 * ```
 */
export function defineAuthMiddleware<TUser>(
  resolve: (event: H3Event) => TUser | null | undefined | Promise<TUser | null | undefined>,
  opts: AuthMiddlewareOptions = {},
): ActionMiddleware {
  return async ({ event, next }) => {
    const user = await resolve(event)
    if (!user && !opts.optional) {
      throw createActionError({
        code: 'UNAUTHORIZED',
        message: opts.message ?? 'Authentication required',
        statusCode: 401,
      })
    }
    return next({ ctx: { user: user ?? null } })
  }
}
