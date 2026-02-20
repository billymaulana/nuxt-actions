// Middleware that throws an action error (e.g., auth check)
const authMiddleware = defineMiddleware(async ({ next }) => {
  throw createActionError({
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
    statusCode: 401,
  })
  // next() is never reached
  return next()
})

export default defineAction({
  middleware: [authMiddleware],
  handler: async () => {
    return { secret: 'data' }
  },
})
