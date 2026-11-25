export default defineAction({
  middleware: [csrfMiddleware()],
  handler: async ({ ctx }) => ({ token: ctx.csrfToken }),
})
