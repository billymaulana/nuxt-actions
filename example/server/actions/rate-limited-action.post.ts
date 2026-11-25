import { z } from 'zod'

export default defineAction({
  input: z.object({ message: z.string() }),
  middleware: [rateLimitMiddleware({ limit: 5, window: 10000, headers: true, message: 'Too many requests, wait 10 seconds' })],
  handler: async ({ input }) => {
    return { echo: input.message, timestamp: Date.now() }
  },
})
