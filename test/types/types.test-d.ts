import { expectTypeOf, describe, it } from 'vitest'
import type { ComputedRef } from 'vue'
import type {
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  ActionResult,
  ActionError,
  UseActionReturn,
  UseOptimisticActionReturn,
  UseFormActionReturn,
  UseActionOptions,
  UseOptimisticActionOptions,
  RetryConfig,
  ActionStatus,
} from '../../src/runtime/types'

describe('TypedActionReference inference', () => {
  it('InferActionInput extracts input type', () => {
    type Ref = TypedActionReference<{ title: string }, { id: number }>
    expectTypeOf<InferActionInput<Ref>>().toEqualTypeOf<{ title: string }>()
  })

  it('InferActionOutput extracts output type', () => {
    type Ref = TypedActionReference<{ title: string }, { id: number }>
    expectTypeOf<InferActionOutput<Ref>>().toEqualTypeOf<{ id: number }>()
  })

  it('InferActionInput returns never for non-reference', () => {
    expectTypeOf<InferActionInput<string>>().toEqualTypeOf<never>()
  })

  it('InferActionOutput returns never for non-reference', () => {
    expectTypeOf<InferActionOutput<string>>().toEqualTypeOf<never>()
  })

  it('TypedActionReference has required readonly fields', () => {
    type Ref = TypedActionReference<{ title: string }, { id: number }>
    expectTypeOf<Ref['__actionPath']>().toBeString()
    expectTypeOf<Ref['__actionMethod']>().toBeString()
  })
})

describe('ActionResult discriminated union', () => {
  it('narrows to success branch', () => {
    const result = {} as ActionResult<{ id: number }>
    if (result.success) {
      expectTypeOf(result.data).toEqualTypeOf<{ id: number }>()
    }
  })

  it('narrows to error branch', () => {
    const result = {} as ActionResult<{ id: number }>
    if (!result.success) {
      expectTypeOf(result.error).toEqualTypeOf<ActionError>()
    }
  })

  it('success result has data', () => {
    type SuccessResult = Extract<ActionResult<{ id: number }>, { success: true }>
    expectTypeOf<SuccessResult['data']>().toEqualTypeOf<{ id: number }>()
  })

  it('error result has ActionError', () => {
    type ErrorResult = Extract<ActionResult<{ id: number }>, { success: false }>
    expectTypeOf<ErrorResult['error']>().toEqualTypeOf<ActionError>()
  })
})

describe('ActionError structure', () => {
  it('has required fields', () => {
    expectTypeOf<ActionError['code']>().toBeString()
    expectTypeOf<ActionError['message']>().toBeString()
    expectTypeOf<ActionError['statusCode']>().toBeNumber()
  })

  it('has optional fieldErrors', () => {
    expectTypeOf<ActionError['fieldErrors']>().toEqualTypeOf<Record<string, string[]> | undefined>()
  })
})

describe('ActionStatus', () => {
  it('is a union of four states', () => {
    expectTypeOf<ActionStatus>().toEqualTypeOf<'idle' | 'executing' | 'success' | 'error'>()
  })
})

describe('RetryConfig', () => {
  it('has optional count', () => {
    expectTypeOf<RetryConfig['count']>().toEqualTypeOf<number | undefined>()
  })

  it('has optional delay', () => {
    expectTypeOf<RetryConfig['delay']>().toEqualTypeOf<number | undefined>()
  })

  it('has optional statusCodes', () => {
    expectTypeOf<RetryConfig['statusCodes']>().toEqualTypeOf<number[] | undefined>()
  })
})

describe('UseActionReturn types', () => {
  it('data ref has correct nullable type', () => {
    type Return = UseActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['data']['value']>().toEqualTypeOf<{ id: number } | null>()
  })

  it('error ref is ActionError | null', () => {
    type Return = UseActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['error']['value']>().toEqualTypeOf<ActionError | null>()
  })

  it('status ref is ActionStatus', () => {
    type Return = UseActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['status']['value']>().toEqualTypeOf<ActionStatus>()
  })

  it('execute accepts correct input and returns ActionResult', () => {
    type Return = UseActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['execute']>().toBeFunction()
    expectTypeOf<Parameters<Return['execute']>[0]>().toEqualTypeOf<{ title: string }>()
    expectTypeOf<ReturnType<Return['execute']>>().toEqualTypeOf<Promise<ActionResult<{ id: number }>>>()
  })

  it('executeAsync returns output directly', () => {
    type Return = UseActionReturn<{ title: string }, { id: number }>
    expectTypeOf<ReturnType<Return['executeAsync']>>().toEqualTypeOf<Promise<{ id: number }>>()
  })

  it('computed booleans are ComputedRef<boolean>', () => {
    type Return = UseActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['isIdle']>().toEqualTypeOf<ComputedRef<boolean>>()
    expectTypeOf<Return['isExecuting']>().toEqualTypeOf<ComputedRef<boolean>>()
    expectTypeOf<Return['hasSucceeded']>().toEqualTypeOf<ComputedRef<boolean>>()
    expectTypeOf<Return['hasErrored']>().toEqualTypeOf<ComputedRef<boolean>>()
  })
})

describe('UseOptimisticActionReturn types', () => {
  it('optimisticData ref has correct type (non-nullable)', () => {
    type Return = UseOptimisticActionReturn<{ id: number }, { count: number }>
    expectTypeOf<Return['optimisticData']['value']>().toEqualTypeOf<{ count: number }>()
  })

  it('data ref has nullable type', () => {
    type Return = UseOptimisticActionReturn<{ id: number }, { count: number }>
    expectTypeOf<Return['data']['value']>().toEqualTypeOf<{ count: number } | null>()
  })

  it('execute accepts correct input', () => {
    type Return = UseOptimisticActionReturn<{ id: number }, { count: number }>
    expectTypeOf<Parameters<Return['execute']>[0]>().toEqualTypeOf<{ id: number }>()
  })
})

describe('UseFormActionReturn types', () => {
  it('fields has correct input type', () => {
    type Return = UseFormActionReturn<{ title: string, done: boolean }, { id: number }>
    expectTypeOf<Return['fields']>().toEqualTypeOf<{ title: string, done: boolean }>()
  })

  it('data ref has nullable output type', () => {
    type Return = UseFormActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['data']['value']>().toEqualTypeOf<{ id: number } | null>()
  })

  it('submit returns ActionResult', () => {
    type Return = UseFormActionReturn<{ title: string }, { id: number }>
    expectTypeOf<ReturnType<Return['submit']>>().toEqualTypeOf<Promise<ActionResult<{ id: number }>>>()
  })

  it('fieldErrors is Record<string, string[]>', () => {
    type Return = UseFormActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['fieldErrors']['value']>().toEqualTypeOf<Record<string, string[]>>()
  })

  it('isDirty is boolean computed', () => {
    type Return = UseFormActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['isDirty']>().toEqualTypeOf<ComputedRef<boolean>>()
  })

  it('isSubmitting is boolean computed', () => {
    type Return = UseFormActionReturn<{ title: string }, { id: number }>
    expectTypeOf<Return['isSubmitting']>().toEqualTypeOf<ComputedRef<boolean>>()
  })
})

describe('Debounce/Throttle options', () => {
  it('UseActionOptions has debounce and throttle', () => {
    type Opts = UseActionOptions<unknown, unknown>
    expectTypeOf<Opts['debounce']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Opts['throttle']>().toEqualTypeOf<number | undefined>()
  })

  it('UseOptimisticActionOptions has debounce and throttle', () => {
    type Opts = UseOptimisticActionOptions<unknown, unknown>
    expectTypeOf<Opts['debounce']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Opts['throttle']>().toEqualTypeOf<number | undefined>()
  })
})
