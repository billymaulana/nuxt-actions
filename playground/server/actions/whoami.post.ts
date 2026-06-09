import { getHeader } from 'h3'

export default createActionClient()
  .use(defineAuthMiddleware((event) => {
    const id = getHeader(event, 'x-user-id')
    return id ? { id, name: `User ${id}` } : null
  }))
  .action(async ({ ctx }) => {
    return { user: (ctx as { user: unknown }).user }
  })
