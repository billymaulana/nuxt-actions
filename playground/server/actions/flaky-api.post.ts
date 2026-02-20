import { z } from 'zod'

/**
 * Simulates a flaky API endpoint that fails intermittently.
 * Useful for testing retry configuration.
 */
let callCount = 0

export default defineAction({
  input: z.object({
    message: z.string().min(1),
  }),
  handler: async ({ input }) => {
    callCount++
    const attempt = callCount

    // Fail on the first 2 attempts, succeed on the 3rd
    if (attempt % 3 !== 0) {
      throw createActionError({
        code: 'TEMPORARY_FAILURE',
        message: `Flaky API failed (attempt ${attempt})`,
        statusCode: 503,
      })
    }

    return {
      message: input.message,
      attempt,
      timestamp: new Date().toISOString(),
    }
  },
})
