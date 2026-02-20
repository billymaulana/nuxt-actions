import { z } from 'zod'

/**
 * Demonstrates a complete middleware chain — all 3 call next().
 * Handler receives ctx from all middleware.
 */
const mw1 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw1: true } })
})

const mw2 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw2: true } })
})

const mw3 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw3: true } })
})

export default defineAction({
  input: z.object({ label: z.string().optional() }),
  middleware: [mw1, mw2, mw3],
  handler: async ({ ctx }) => {
    const context = ctx as Record<string, unknown>
    return {
      middlewareRan: {
        mw1: !!context.mw1,
        mw2: !!context.mw2,
        mw3: !!context.mw3,
      },
      handlerRan: true,
    }
  },
})
