import { z } from 'zod'

export default defineAction({
  input: z.object({
    id: z.number(),
    done: z.boolean(),
  }),
  handler: async ({ input }) => {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 500))

    return {
      id: input.id,
      done: input.done,
      updatedAt: new Date().toISOString(),
    }
  },
})
