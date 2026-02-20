import { z } from 'zod'

// GET action (parses query params)
export default defineAction({
  input: z.object({
    limit: z.coerce.number().optional().default(5),
  }),
  handler: async ({ input }) => {
    const items = Array.from({ length: input.limit }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
    }))
    return { items, total: input.limit }
  },
})
