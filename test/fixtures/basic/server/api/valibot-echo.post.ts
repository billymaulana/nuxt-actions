import * as v from 'valibot'

export default defineAction({
  input: v.object({
    message: v.pipe(v.string(), v.minLength(1)),
  }),
  handler: async ({ input }) => {
    return { echo: input.message, schema: 'valibot' }
  },
})
