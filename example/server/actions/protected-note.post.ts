import { z } from 'zod'

export default defineAction({
  input: z.object({
    note: z.string().min(1, 'Note is required'),
  }),
  middleware: [csrfMiddleware()],
  handler: async ({ input }) => ({
    saved: input.note,
    savedAt: new Date().toISOString(),
  }),
})
