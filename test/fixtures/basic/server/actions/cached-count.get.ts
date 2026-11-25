import { z } from 'zod'

let calls = 0

export default defineAction({
  input: z.object({}),
  cache: { maxAge: 60 },
  handler: async () => ({ call: ++calls }),
})
