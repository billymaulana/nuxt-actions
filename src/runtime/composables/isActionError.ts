import type { ActionError } from '../types'

/**
 * Client-side type guard for the standardized ActionError envelope.
 * Mirrors the server-side guard so error values from `error.value`,
 * `executeAsync` rejections, or onError callbacks can be narrowed safely.
 *
 * @example
 * ```ts
 * try {
 *   await executeAsync({ id })
 * }
 * catch (err) {
 *   if (isActionError(err) && err.code === 'UNAUTHORIZED') navigateTo('/login')
 * }
 * ```
 */
export function isActionError(error: unknown): error is ActionError {
  if (error === null || typeof error !== 'object') return false

  if (
    Object.prototype.hasOwnProperty.call(error, '__isActionError')
    && (error as Record<string, unknown>).__isActionError === true
  ) {
    return true
  }

  /*
   * Structural detection requires all three envelope fields and excludes
   * native Error instances (which also carry code/message via subclasses).
   */
  const candidate = error as Record<string, unknown>
  return (
    typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.statusCode === 'number'
    && !('stack' in candidate)
  )
}
