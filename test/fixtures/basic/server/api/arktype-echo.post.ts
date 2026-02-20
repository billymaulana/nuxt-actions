import { type } from 'arktype'

export default defineAction({
  input: type({
    message: 'string > 0',
  }),
  handler: async ({ input }) => {
    return { echo: input.message, schema: 'arktype' }
  },
})
