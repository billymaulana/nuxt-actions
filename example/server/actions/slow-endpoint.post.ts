import { z } from 'zod'

/**
 * Simulates a slow endpoint for testing timeout and dedupe behavior.
 * Configurable delay via input.
 */
export default defineAction({
  input: z.object({
    delayMs: z.number().min(0).max(30000).default(3000),
    label: z.string().optional(),
  }),
  handler: async ({ input }) => {
    await new Promise(r => setTimeout(r, input.delayMs))

    return {
      label: input.label ?? 'done',
      delayMs: input.delayMs,
      completedAt: new Date().toISOString(),
    }
  },
})
