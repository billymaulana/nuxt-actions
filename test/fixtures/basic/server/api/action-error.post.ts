// Action that throws a createActionError
export default defineAction({
  handler: async () => {
    throw createActionError({
      code: 'NOT_FOUND',
      message: 'Resource not found',
      statusCode: 404,
    })
  },
})
