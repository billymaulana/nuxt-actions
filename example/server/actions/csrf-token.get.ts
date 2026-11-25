export default defineAction({
  middleware: [csrfMiddleware()],
  handler: async () => ({ issued: true }),
})
