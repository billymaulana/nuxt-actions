export default defineAction({
  middleware: [rateLimitMiddleware({ limit: 1, window: 60_000, headers: true })],
  handler: async () => ({ ok: true }),
})
