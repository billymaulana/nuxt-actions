import { z } from 'zod'

let txCounter = 1000

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
      txId: `TX-${txCounter}`,
      amount: input.amount,
      recipient: input.recipient,
      chargedAt: new Date().toISOString(),
    }
  },
})
