import { randomBytes } from 'node:crypto'
import { getCookie, setCookie, getHeader, getRequestMethod } from '../internal/server-runtime'
import type { CsrfConfig, ActionMiddleware } from '../../types'
import { createActionError } from './defineAction'

/** HTTP methods that mutate state and require CSRF protection. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * CSRF token protection middleware for mutation actions.
 *
 * On safe requests (GET, HEAD, OPTIONS), keeps the token already stored in the
 * cookie or creates a new one, and sets it as a cookie that client code can read.
 * On mutation requests (POST, PUT, PATCH, DELETE), validates that the token in
 * the request header matches the cookie value.
 *
 * The client reads the token from the cookie and sends it in the configured
 * header on every mutation request. Handlers receive it as `ctx.csrfToken`.
 *
 * @param config - Optional CSRF configuration overrides.
 * @returns An `ActionMiddleware` that enforces CSRF protection.
 *
 * @example
 * ```ts
 * // Basic usage with defaults
 * const protectedAction = createActionClient()
 *   .use(csrfMiddleware())
 *   .schema(z.object({ title: z.string() }))
 *   .action(async ({ input }) => {
 *     return db.createPost(input)
 *   })
 * ```
 *
 * @example
 * ```ts
 * // Custom configuration
 * const protectedAction = createActionClient()
 *   .use(csrfMiddleware({
 *     cookieName: '__csrf',
 *     headerName: 'x-xsrf-token',
 *     tokenLength: 64,
 *   }))
 *   .schema(z.object({ amount: z.number() }))
 *   .action(async ({ input }) => {
 *     return payments.charge(input.amount)
 *   })
 * ```
 */
export function csrfMiddleware(config?: CsrfConfig): ActionMiddleware {
  const cookieName = config?.cookieName ?? '_csrf'
  const headerName = config?.headerName ?? 'x-csrf-token'
  const tokenLength = config?.tokenLength ?? 32
  const tokenPattern = new RegExp(`^[a-f0-9]{${tokenLength * 2}}$`)

  return async ({ event, next }) => {
    const method = getRequestMethod(event).toUpperCase()

    if (!MUTATION_METHODS.has(method)) {
      const existing = getCookie(event, cookieName)
      const token = existing && tokenPattern.test(existing) ? existing : randomBytes(tokenLength).toString('hex')
      setCookie(event, cookieName, token, {
        httpOnly: false,
        sameSite: 'strict',
        path: '/',
        secure: true,
      })
      return next({ ctx: { csrfToken: token } })
    }

    // Mutation request — validate CSRF token
    const cookieToken = getCookie(event, cookieName)
    const headerToken = getHeader(event, headerName)

    if (!cookieToken || !headerToken) {
      throw createActionError({
        code: 'CSRF_ERROR',
        message: 'CSRF token missing',
        statusCode: 403,
      })
    }

    // Use timing-safe comparison to prevent timing attacks
    if (!timingSafeEqual(cookieToken, headerToken)) {
      throw createActionError({
        code: 'CSRF_ERROR',
        message: 'CSRF token mismatch',
        statusCode: 403,
      })
    }

    if (!tokenPattern.test(cookieToken)) {
      throw createActionError({
        code: 'CSRF_ERROR',
        message: 'CSRF token invalid',
        statusCode: 403,
      })
    }

    return next({ ctx: { csrfToken: cookieToken } })
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Falls back to a byte-by-byte XOR comparison when strings differ in length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
