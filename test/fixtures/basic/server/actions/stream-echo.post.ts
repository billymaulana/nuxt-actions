import { z } from 'zod'

export default defineStreamAction({
  input: z.object({
    prompt: z.string().min(1),
  }),
  handler: async ({ input, stream }) => {
    for (const word of input.prompt.split(' ')) {
      await stream.send({ word })
    }
    await stream.close()
  },
})
