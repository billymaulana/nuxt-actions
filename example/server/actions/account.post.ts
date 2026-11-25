import { getHeader } from 'h3'

interface SessionUser {
  id: string
  name: string
  plan: 'free' | 'pro'
}

export default createActionClient()
  .use(defineAuthMiddleware((event): SessionUser | null => {
    const session = getHeader(event, 'x-demo-session')
    if (!session) return null
    return { id: session, name: `User ${session}`, plan: 'pro' }
  }))
  .action(async ({ ctx }) => {
    const user = (ctx as { user: SessionUser }).user
    return {
      user,
      message: `Welcome back, ${user.name}`,
      serverTime: new Date().toISOString(),
    }
  })
