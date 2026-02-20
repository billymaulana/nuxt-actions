import { z } from 'zod'

// Middleware that adds requestId to context
const addRequestId = defineMiddleware(async ({ next }) => {
  return next({ ctx: { requestId: 'req-123' } })
})

// Middleware that adds timestamp
const addTimestamp = defineMiddleware(async ({ next }) => {
  return next({ ctx: { timestamp: 1000 } })
})

export default defineAction({
  input: z.object({
    data: z.string(),
  }),
  middleware: [addRequestId, addTimestamp],
  handler: async ({ input, ctx }) => {
    return {
      data: input.data,
      requestId: (ctx as Record<string, unknown>).requestId,
      timestamp: (ctx as Record<string, unknown>).timestamp,
    }
  },
})
