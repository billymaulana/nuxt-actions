export const limited = defineAction({
  middleware: [rateLimitMiddleware({ limit: 1, headers: true })],
  handler: async () => 'ok',
})

export const csrfProtected = defineAction({
  middleware: [csrfMiddleware()],
  handler: async ({ ctx }) => ({ token: ctx.csrfToken }),
})

export const charge = defineAction({
  idempotency: {},
  handler: async () => 'charged',
})

export const refund = defineAction({
  idempotency: {},
  handler: async () => 'refunded',
})

export const originChecked = defineAction({
  middleware: [originMiddleware()],
  handler: async () => 'ok',
})
