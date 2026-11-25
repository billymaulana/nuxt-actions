interface UploadedFile {
  filename: string
  type: string
  data: Uint8Array
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return typeof value === 'object' && value !== null && 'filename' in value && 'data' in value
}

function summarize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(summarize)
  if (isUploadedFile(value)) {
    return {
      filename: value.filename,
      type: value.type,
      size: value.data.length,
      text: Buffer.from(value.data).toString('utf-8'),
    }
  }
  return value
}

export default defineAction({
  handler: async ({ input }) => {
    const fields = input as Record<string, unknown>
    return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, summarize(value)]))
  },
})
