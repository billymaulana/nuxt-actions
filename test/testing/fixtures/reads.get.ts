import { z } from 'zod'

let calls = 0

export const missingTodo = defineAction({
  handler: async () => {
    throw createError({ statusCode: 404, statusMessage: 'Todo not found' })
  },
})

export const siteName = defineAction({
  handler: async () => useRuntimeConfig().public.siteName,
})

export const cachedTodos = createActionClient()
  .use(defineMiddleware(async ({ event, next }) => next({ ctx: { userId: event.context.userId } })))
  .schema(z.object({}).optional())
  .cache({ maxAge: 60, key: ({ ctx }) => String(ctx.userId) })
  .action(async ({ ctx }) => ({ userId: ctx.userId, call: ++calls }))
