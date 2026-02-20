import { z } from 'zod'

export default defineAction({
  input: z.object({
    name: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return { id: Date.now(), name: input.name, created: true }
  },
})
