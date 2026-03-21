import { createActionError } from './defineAction'

/**
 * Throw structured validation errors from an action handler.
 *
 * The thrown error is recognized by `defineAction`'s error handling and
 * returned to the client as `{ success: false, error: { code: 'VALIDATION_ERROR', ... } }`.
 *
 * @param fieldErrors - A record mapping field names to arrays of error messages.
 * @param message - Optional top-level error message. Defaults to `'Validation failed'`.
 * @throws An `ActionError`-compatible object with code `VALIDATION_ERROR` and status 422.
 *
 * @example
 * ```ts
 * export default defineAction({
 *   input: z.object({ email: z.string().email() }),
 *   handler: async ({ input }) => {
 *     const existing = await db.findUser(input.email)
 *     if (existing) {
 *       returnValidationErrors({ email: ['Email already taken'] })
 *     }
 *     return db.createUser(input)
 *   },
 * })
 * ```
 *
 * @example
 * ```ts
 * // Multiple field errors with custom message
 * returnValidationErrors(
 *   {
 *     username: ['Username is reserved'],
 *     email: ['Email domain not allowed', 'Must use a corporate email'],
 *   },
 *   'Registration failed',
 * )
 * ```
 */
export function returnValidationErrors(
  fieldErrors: Record<string, string[]>,
  message?: string,
): never {
  throw createActionError({
    code: 'VALIDATION_ERROR',
    message: message ?? 'Validation failed',
    statusCode: 422,
    fieldErrors,
  })
}
