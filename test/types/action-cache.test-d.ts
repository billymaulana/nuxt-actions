import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { invalidateActionCache, setActionCacheStore } from '../../src/runtime/server/utils/actionCache'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { defineAction } from '../../src/runtime/server/utils/defineAction'
import { defineMiddleware } from '../../src/runtime/server/utils/defineMiddleware'

describe('cache option types', () => {
  it('types the key arguments from the schema in defineAction', () => {
    const check = () => defineAction({
      input: z.object({ page: z.coerce.number() }),
      cache: {
        maxAge: 60,
        key: ({ input }) => {
          expectTypeOf(input).toEqualTypeOf<{ page: number }>()
          return String(input.page)
        },
      },
      handler: async ({ input }) => input.page,
    })
    expectTypeOf(check).toBeFunction()
  })

  it('types the key arguments from the schema and the context in the builder', () => {
    const withUser = defineMiddleware<Record<string, unknown>, { userId: number }>(async ({ next }) => next({ ctx: { userId: 1 } }))
    const check = () => createActionClient()
      .use(withUser)
      .schema(z.object({ page: z.number() }))
      .cache({
        maxAge: 60,
        key: async ({ input, ctx }) => {
          expectTypeOf(input).toEqualTypeOf<{ page: number }>()
          expectTypeOf(ctx.userId).toEqualTypeOf<number>()
          return String(ctx.userId)
        },
      })
      .action(async ({ input }) => input.page)
    expectTypeOf(check).toBeFunction()
  })

  it('requires maxAge and a string key', () => {
    const check = () => {
      // @ts-expect-error maxAge is required
      defineAction({ cache: {}, handler: async () => 1 })
      // @ts-expect-error the key must be a string
      defineAction({ cache: { maxAge: 60, key: () => 42 }, handler: async () => 1 })
      // @ts-expect-error swr is a boolean
      createActionClient().cache({ maxAge: 60, swr: 'yes' })
    }
    expectTypeOf(check).toBeFunction()
  })

  it('types the store and invalidation helpers', () => {
    expectTypeOf(invalidateActionCache).returns.toEqualTypeOf<Promise<void>>()
    const check = () => {
      invalidateActionCache('todos/list', { key: '42', input: { page: 1 } })
      // @ts-expect-error the key is a string
      invalidateActionCache('todos/list', { key: 42 })
      // @ts-expect-error a store needs get, set, delete, and clear
      setActionCacheStore({ get: () => undefined })
    }
    expectTypeOf(check).toBeFunction()
  })
})
