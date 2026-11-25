import { describe, expectTypeOf, it } from 'vitest'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { csrfMiddleware } from '../../src/runtime/server/utils/csrfMiddleware'
import { defineMiddleware } from '../../src/runtime/server/utils/defineMiddleware'
import { originMiddleware } from '../../src/runtime/server/utils/originMiddleware'
import { rateLimitMiddleware } from '../../src/runtime/server/utils/rateLimitMiddleware'

describe('middleware chains', () => {
  it('accepts more middleware after csrfMiddleware', () => {
    const client = createActionClient()
      .use(rateLimitMiddleware({ limit: 20, window: 60_000 }))
      .use(csrfMiddleware())
      .use(defineMiddleware(async ({ next }) => next({ ctx: { userId: 1 } })))
      .use(rateLimitMiddleware({ limit: 5 }))

    expectTypeOf(client.use).toBeFunction()
  })

  it('keeps the accumulated context type when originMiddleware follows a typed middleware', () => {
    const withUser = defineMiddleware<Record<string, unknown>, { userId: number }>(async ({ next }) => next({ ctx: { userId: 1 } }))
    const client = createActionClient()
      .use(withUser)
      .use(originMiddleware({ allowedOrigins: ['https://admin.example.com'] }))
      .use(rateLimitMiddleware({ limit: 5, headers: true, store: { hit: () => ({ count: 1, resetAt: 0 }) } }))

    const action = client.action(async ({ ctx }) => {
      expectTypeOf(ctx.userId).toEqualTypeOf<number>()
      return ctx.userId
    })
    expectTypeOf(action._types.output).toEqualTypeOf<number>()
  })

  it('accepts csrfMiddleware and rateLimitMiddleware after a typed middleware', () => {
    const withUser = defineMiddleware<Record<string, unknown>, { userId: number }>(async ({ next }) => next({ ctx: { userId: 1 } }))
    const client = createActionClient()
      .use(withUser)
      .use(csrfMiddleware())
      .use(rateLimitMiddleware({ limit: 5 }))

    client.action(async ({ ctx }) => {
      expectTypeOf(ctx.userId).toEqualTypeOf<number>()
    })
  })
})
