let txCounter = 0

export default defineAction({
  idempotency: { ttl: 60_000 },
  handler: async ({ input }) => {
    txCounter++
    const amount = (input as { amount?: number }).amount ?? 0
    return { txId: txCounter, amount }
  },
})
