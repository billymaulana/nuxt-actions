import { z } from 'zod'

export default defineAction({
  input: z.object({ value: z.number() }),
  handler: async ({ input }) => ({ doubled: input.value * 2 }),
})
