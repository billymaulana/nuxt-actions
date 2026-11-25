export default defineAction({
  middleware: [rateLimitMiddleware({ limit: 2, window: 60_000 })],
  handler: async () => ({ ok: true }),
})
