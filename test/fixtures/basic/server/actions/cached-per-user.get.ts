import { getRequestHeader } from 'nuxt/server'
import { z } from 'zod'

let calls = 0

const withUser = defineMiddleware(async ({ event, next }) => {
  return next({ ctx: { user: getRequestHeader(event, 'x-user') ?? 'anonymous' } })
})

export default defineAction({
  input: z.object({}),
  middleware: [withUser],
  cache: { maxAge: 60, key: ({ ctx }) => ctx.user as string },
  handler: async ({ ctx }) => ({ user: ctx.user, call: ++calls }),
})
