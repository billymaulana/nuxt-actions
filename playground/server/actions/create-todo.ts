import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return {
      id: Date.now(),
      title: input.title,
      done: false,
    }
  },
})
