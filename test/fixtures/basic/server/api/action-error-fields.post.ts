// Action that throws createActionError with fieldErrors
export default defineAction({
  handler: async () => {
    throw createActionError({
      code: 'CUSTOM_VALIDATION',
      message: 'Custom validation failed',
      statusCode: 422,
      fieldErrors: {
        email: ['Email is already taken'],
        username: ['Username too short', 'Username contains invalid characters'],
      },
    })
  },
})
