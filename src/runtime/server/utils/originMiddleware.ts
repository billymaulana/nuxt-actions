import { getHeader, getRequestHost, getRequestMethod } from '../internal/server-runtime'
import type { ActionMiddleware, OriginConfig } from '../../types'
import { createActionError } from './defineAction'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '')
}

function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host
  }
  catch {
    return undefined
  }
}

/**
 * Cookie-free CSRF protection for mutations.
 *
 * Browsers send `Sec-Fetch-Site` and `Origin` with every POST, so a request
 * from another site can be told apart without a token. Same-origin requests
 * and requests the user started directly pass. An `Origin` listed in
 * `allowedOrigins` passes. Older browsers without `Sec-Fetch-Site` pass when
 * the `Origin` host matches the request host. Requests with neither header
 * come from tools rather than browsers and pass unless `requireOrigin` is set.
 * Everything else is rejected with `CSRF_ERROR` and HTTP status 403.
 *
 * Each check is constant time, and the middleware keeps no state between requests.
 *
 * @example
 * ```ts
 * export default defineAction({
 *   middleware: [originMiddleware()],
 *   handler: async ({ input }) => db.notes.create(input),
 * })
 * ```
 */
export function originMiddleware(config: OriginConfig = {}): ActionMiddleware {
  const allowedOrigins = new Set((config.allowedOrigins ?? []).map(normalizeOrigin))
  const message = config.message ?? 'Cross-origin request rejected'
  const reject = () => createActionError({ code: 'CSRF_ERROR', message, statusCode: 403 })

  return async ({ event, next }) => {
    if (!MUTATION_METHODS.has(getRequestMethod(event).toUpperCase())) return next()

    const site = getHeader(event, 'sec-fetch-site')?.toLowerCase()
    if (site === 'same-origin' || site === 'none') return next()

    const origin = getHeader(event, 'origin')
    if (origin && origin !== 'null') {
      const normalized = normalizeOrigin(origin)
      if (allowedOrigins.has(normalized)) return next()
      if (!site && hostOf(normalized) === getRequestHost(event).toLowerCase()) return next()
      throw reject()
    }

    if (origin === 'null' || site || config.requireOrigin) throw reject()
    return next()
  }
}
