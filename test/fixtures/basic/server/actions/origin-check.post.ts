export default defineAction({
  middleware: [originMiddleware({ allowedOrigins: ['https://trusted.example'] })],
  handler: async () => ({ ok: true }),
})
