import { z } from 'zod'

export default defineAction({
  input: z.object({
    message: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return { echo: input.message }
  },
})
