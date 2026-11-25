import { z } from 'zod'

export default defineAction({
  input: z.object({
    label: z.string().min(1, 'Label is required'),
    avatar: z.any().optional(),
  }),
  handler: async ({ input }) => {
    const file = input.avatar as { filename?: string, type?: string, data?: { length: number } } | undefined

    if (!file?.filename) {
      throw createActionError({
        code: 'NO_FILE',
        message: 'No file was uploaded',
        statusCode: 400,
      })
    }

    const size = file.data?.length ?? 0
    return {
      label: input.label,
      filename: file.filename,
      type: file.type ?? 'application/octet-stream',
      size,
      humanSize: size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`,
    }
  },
})
