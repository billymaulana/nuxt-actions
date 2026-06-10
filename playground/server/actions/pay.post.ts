import { z } from 'zod'

let txCounter = 0

export default defineAction({
  input: z.object({
    amount: z.number().positive(),
    recipient: z.string().min(1),
  }),
  idempotency: { ttl: 60_000 },
  handler: async ({ input }) => {
    await new Promise(resolve => setTimeout(resolve, 600))
    txCounter++
    return {
      txId: `TX-${String(txCounter).padStart(4, '0')}`,
      amount: input.amount,
      recipient: input.recipient,
      processedAt: new Date().toISOString(),
    }
  },
})
