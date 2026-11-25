import { z } from 'zod'

export default defineAction({
  input: z.object({ path: z.string(), key: z.string().optional() }),
  handler: async ({ input }) => {
    await invalidateActionCache(input.path, input.key === undefined ? {} : { key: input.key })
    return { ok: true }
  },
})
