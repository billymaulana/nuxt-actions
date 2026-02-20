import { z } from 'zod'

/**
 * Echoes back request headers for testing custom header passing.
 */
export default defineAction({
  input: z.object({
    ping: z.string().optional(),
  }),
  handler: async ({ input, event }) => {
    const headers = getHeaders(event)

    return {
      ping: input.ping ?? 'pong',
      receivedHeaders: {
        'x-custom-token': headers['x-custom-token'] ?? null,
        'x-request-id': headers['x-request-id'] ?? null,
        'content-type': headers['content-type'] ?? null,
      },
    }
  },
})
