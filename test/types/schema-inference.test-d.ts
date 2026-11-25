import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { InferInput, InferOutput } from '../../src/runtime/types'

function inferTypes<TSchema>(_schema: TSchema) {
  return {
    input: expectTypeOf<InferInput<TSchema>>(),
    output: expectTypeOf<InferOutput<TSchema>>(),
  }
}

describe('Standard Schema input and output inference', () => {
  it('uses the pre-transform type for client input and the transformed type for the handler', () => {
    const types = inferTypes(z.object({ mobile: z.string().regex(/^\d{10}$/).transform(Number) }))
    types.input.toEqualTypeOf<{ mobile: string }>()
    types.output.toEqualTypeOf<{ mobile: number }>()
  })

  it('types coerced input as unknown, as the schema declares it', () => {
    const types = inferTypes(z.object({ mobile: z.coerce.string().transform(Number) }))
    types.input.toEqualTypeOf<{ mobile: unknown }>()
    types.output.toEqualTypeOf<{ mobile: number }>()
  })

  it('narrows coerced input when the schema states its input type', () => {
    const types = inferTypes(z.object({ mobile: z.coerce.string<string>().transform(Number) }))
    types.input.toEqualTypeOf<{ mobile: string }>()
    types.output.toEqualTypeOf<{ mobile: number }>()
  })
})
