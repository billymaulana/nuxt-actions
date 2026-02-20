import { z } from 'zod'

// PUT action to test non-POST methods with body
export default defineAction({
  input: z.object({
    id: z.number(),
    name: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return { id: input.id, name: input.name, updated: true }
  },
})
