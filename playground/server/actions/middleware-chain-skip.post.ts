import { z } from 'zod'

/**
 * Demonstrates middleware chain break — mw2 does NOT call next().
 * Chain breaks at mw2: mw3 never runs, but handler still executes.
 * Handler only has ctx from mw1.
 */
const mw1 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw1: true } })
})

const mw2Skip = defineMiddleware(async () => {
  // Does NOT call next() — chain breaks here
  // mw3 will NOT execute, but handler still runs
})

const mw3 = defineMiddleware(async ({ next }) => {
  return next({ ctx: { mw3: true } })
})

export default defineAction({
  input: z.object({ label: z.string().optional() }),
  middleware: [mw1, mw2Skip, mw3],
  handler: async ({ ctx }) => {
    const context = ctx as Record<string, unknown>
    return {
      middlewareRan: {
        mw1: !!context.mw1,
        mw2: false,
        mw3: !!context.mw3,
      },
      handlerRan: true,
    }
  },
})
