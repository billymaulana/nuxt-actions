import type { Ref } from 'vue'
import { describe, expectTypeOf, it } from 'vitest'
import type { UploadProgress, UseActionOptions, UseActionReturn, UseFormActionOptions } from '../../src/runtime/types'

describe('upload progress types', () => {
  it('types the progress callback and the progress ref', () => {
    expectTypeOf<UseActionOptions<FormData, { id: number }>['onUploadProgress']>()
      .toEqualTypeOf<((progress: UploadProgress) => void) | undefined>()
    expectTypeOf<UseActionOptions<FormData, { id: number }>['uploadProgress']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<UseActionReturn<FormData, { id: number }>['uploadProgress']>()
      .toEqualTypeOf<Readonly<Ref<UploadProgress | null>>>()
    expectTypeOf<UploadProgress>().toEqualTypeOf<{ loaded: number, total: number | null, percent: number | null }>()
  })

  it('leaves upload progress out of useFormAction, which sends JSON', () => {
    expectTypeOf<UseFormActionOptions<{ name: string }, unknown>>().not.toHaveProperty('uploadProgress')
    expectTypeOf<UseFormActionOptions<{ name: string }, unknown>>().not.toHaveProperty('onUploadProgress')
  })
})
