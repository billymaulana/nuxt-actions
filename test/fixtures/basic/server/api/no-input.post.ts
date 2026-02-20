// Action without input schema
export default defineAction({
  handler: async () => {
    return { message: 'no input required' }
  },
})
