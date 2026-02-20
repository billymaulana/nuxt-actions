// Action that throws a regular Error
export default defineAction({
  handler: async () => {
    throw new Error('Something went wrong')
  },
})
