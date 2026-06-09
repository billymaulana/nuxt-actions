import { expectTypeOf, describe, it } from 'vitest'
import type {
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseActionMutationOptions,
  UseActionReturn,
} from '../../src/runtime/types'

type Create = TypedActionReference<{ title: string }, { id: number }>

describe('useActionMutation type contract', () => {
  it('invalidates accepts both references and tag strings', () => {
    type Opts = UseActionMutationOptions<InferActionInput<Create>, InferActionOutput<Create>>
    expectTypeOf<Opts['invalidates']>().toEqualTypeOf<Array<TypedActionReference | string> | undefined>()
  })

  it('return execute input is inferred from the reference', () => {
    type Return = UseActionReturn<InferActionInput<Create>, InferActionOutput<Create>>
    expectTypeOf<Parameters<Return['execute']>[0]>().toEqualTypeOf<{ title: string }>()
  })

  it('return data output is inferred from the reference', () => {
    type Return = UseActionReturn<InferActionInput<Create>, InferActionOutput<Create>>
    expectTypeOf<Return['data']['value']>().toEqualTypeOf<{ id: number } | null>()
  })
})
