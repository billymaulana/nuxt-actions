// Action that throws createActionError with default statusCode
export default defineAction({
  handler: async () => {
    throw createActionError({
      code: 'BAD_REQUEST',
      message: 'Something was wrong with the request',
    })
  },
})
