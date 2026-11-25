import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { callAction } from '../../src/runtime/server/utils/callAction'
import { defineAction } from '../../src/runtime/server/utils/defineAction'
import { defineStreamAction } from '../../src/runtime/server/utils/defineStreamAction'
import { runAction } from '../../src/runtime/testing'
import type { ActionResult, ServerEvent } from '../../src/runtime/types'

declare const event: ServerEvent
declare const partialInput: Partial<{ value: number }>

describe('callAction types', () => {
  it('infers the input and output from the action', () => {
    const double = defineAction({
      input: z.object({ value: z.number() }),
      handler: async ({ input }) => ({ doubled: input.value * 2 }),
    })
    const check = () => {
      expectTypeOf(callAction(event, double, { value: 2 })).toEqualTypeOf<Promise<ActionResult<{ doubled: number }>>>()
      // @ts-expect-error value must be a number
      callAction(event, double, { value: 'two' })
      // @ts-expect-error the input is required
      callAction(event, double)
      // @ts-expect-error a required field is missing
      callAction(event, double, {})
      // @ts-expect-error a required field may be missing
      callAction(event, double, partialInput)
    }
    expectTypeOf(check).toBeFunction()
  })

  it('lets an action without input be called without one', () => {
    const ping = defineAction({ handler: async () => 'pong' })
    const check = () => {
      expectTypeOf(callAction(event, ping)).toEqualTypeOf<Promise<ActionResult<string>>>()
    }
    expectTypeOf(check).toBeFunction()
  })

  it('types runAction from the action', () => {
    const double = defineAction({
      input: z.object({ value: z.number() }),
      handler: async ({ input }) => ({ doubled: input.value * 2 }),
    })
    const check = async () => {
      const { result, headers, cookies } = await runAction(double, { input: { value: 2 }, context: { userId: 1 } })
      expectTypeOf(result).toEqualTypeOf<ActionResult<{ doubled: number }>>()
      expectTypeOf(headers).toEqualTypeOf<Record<string, string>>()
      expectTypeOf(cookies).toEqualTypeOf<Record<string, string>>()
      // @ts-expect-error value must be a number
      await runAction(double, { input: { value: 'two' } })
      // @ts-expect-error runAction needs an action
      await runAction({ handler: () => 1 })
    }
    expectTypeOf(check).toBeFunction()
  })

  it('rejects a stream action', () => {
    const stream = defineStreamAction({ handler: async () => {} })
    const check = () => {
      // @ts-expect-error stream actions cannot be called with callAction
      callAction(event, stream)
    }
    expectTypeOf(check).toBeFunction()
  })
})
