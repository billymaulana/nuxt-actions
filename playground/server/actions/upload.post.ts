import { z } from 'zod'

const fileSchema = z.custom<ActionFile>(
  value => typeof value === 'object' && value !== null && 'filename' in value && 'data' in value,
  'Expected a file',
)

export default defineAction({
  input: z.object({
    title: z.string(),
    file: fileSchema.optional(),
  }),
  handler: async ({ input }) => {
    return {
      title: input.title,
      filename: input.file?.filename ?? null,
      size: input.file?.data.length ?? 0,
    }
  },
})
