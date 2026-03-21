import { randomBytes } from 'node:crypto'
import { getCookie, setCookie, getHeader } from 'h3'
import type { CsrfConfig, ActionMiddleware } from '../../types'
import { createActionError } from './defineAction'

/** HTTP methods that mutate state and require CSRF protection. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * CSRF token protection middleware for mutation actions.
 *
 * On safe requests (GET, HEAD, OPTIONS), generates a cryptographic token and
 * sets it as an httpOnly cookie. On mutation requests (POST, PUT, PATCH, DELETE),
 * validates that the token in the request header matches the cookie value.
 *
 * The client must read the CSRF token from the cookie (or a dedicated endpoint)
 * and include it in the configured header on every mutation request.
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

  return async ({ event, next }) => {
    const method = event.method.toUpperCase()

    if (!MUTATION_METHODS.has(method)) {
      // Safe request — generate and set a CSRF token cookie
      const token = randomBytes(tokenLength).toString('hex')
      setCookie(event, cookieName, token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        secure: true,
      })
      return next()
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

    return next()
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
