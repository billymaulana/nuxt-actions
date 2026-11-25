import double from './double.post'

export default defineAction({
  handler: async ({ input, event }) => callAction(event, double, input as { value: number }),
})
