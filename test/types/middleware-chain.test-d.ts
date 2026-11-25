import { describe, expectTypeOf, it } from 'vitest'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { csrfMiddleware } from '../../src/runtime/server/utils/csrfMiddleware'
import { defineMiddleware } from '../../src/runtime/server/utils/defineMiddleware'
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
})
