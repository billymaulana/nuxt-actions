import { z } from 'zod'

export default defineAction({
  input: z.object({ note: z.string() }),
  middleware: [originMiddleware()],
  handler: async ({ input }) => ({ saved: input.note, at: Date.now() }),
})
