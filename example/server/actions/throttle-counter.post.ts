import { z } from 'zod'

/**
 * Simple counter for testing throttle behavior.
 * Returns a server-side counter that increments each call.
 */
let counter = 0

export default defineAction({
  input: z.object({
    increment: z.number().default(1),
  }),
  handler: async ({ input }) => {
    counter += input.increment
    return {
      counter,
      timestamp: new Date().toISOString(),
    }
  },
})
