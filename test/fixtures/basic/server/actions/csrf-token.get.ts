export default defineAction({
  middleware: [csrfMiddleware(), csrfMiddleware({ cookieName: '_csrf_second' })],
  handler: async () => ({ issued: true }),
})
