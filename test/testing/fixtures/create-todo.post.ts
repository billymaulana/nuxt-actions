import { z } from 'zod'

const requireUser = defineMiddleware(async ({ event, next }) => {
  const auth = event.context.auth as { userId: number } | undefined
  if (!auth) {
    throw createActionError({ code: 'UNAUTHORIZED', message: 'Sign in first', statusCode: 401 })
  }
  return next({ ctx: { userId: auth.userId } })
})

export default defineAction({
  input: z.object({ title: z.string().min(1) }),
  middleware: [requireUser],
  handler: async ({ input, ctx, event }) => {
    setResponseHeader(event, 'x-request-id', getHeader(event, 'x-request-id') ?? 'none')
    setCookie(event, 'last-todo', input.title, { httpOnly: true })
    return { title: input.title, userId: ctx.userId, locale: getCookie(event, 'locale') ?? 'en' }
  },
})
