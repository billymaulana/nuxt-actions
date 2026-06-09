import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string(),
    file: z.any(),
  }),
  handler: async ({ input }) => {
    const file = input.file as { filename: string, data: { length: number } } | undefined
    return {
      title: input.title,
      filename: file?.filename ?? null,
      size: file?.data?.length ?? 0,
    }
  },
})
