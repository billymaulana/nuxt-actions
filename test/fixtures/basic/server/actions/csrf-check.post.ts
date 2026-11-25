export default defineAction({
  middleware: [csrfMiddleware()],
  handler: async () => ({ ok: true }),
})
