import { z } from 'zod'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default defineAction({
  input: z.object({}).optional(),
  cache: { maxAge: 30 },
  handler: async () => {
    const startedAt = Date.now()
    await delay(800)
    return { generatedAt: new Date().toISOString(), tookMs: Date.now() - startedAt }
  },
})
