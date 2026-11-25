import { z } from 'zod'

export default defineStreamAction({
  input: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
  }),
  handler: async ({ input, stream }) => {
    const words = `Here is a response to "${input.prompt}": The quick brown fox jumps over the lazy dog. This demonstrates streaming server actions with real-time text generation.`.split(' ')

    for (const word of words) {
      await stream.send({ text: word + ' ' })
      await new Promise(r => setTimeout(r, 80))
    }

    await stream.close()
  },
})
