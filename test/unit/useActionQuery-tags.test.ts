import { useActionQuery } from '../../src/runtime/composables/useActionQuery'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRegisterTags = vi.fn()
vi.mock('../../src/runtime/composables/_tagRegistry', () => ({
  registerTags: (...a: unknown[]) => mockRegisterTags(...a),
}))

const mockAsyncDataResult = {
  data: { value: null },
  status: { value: 'idle' },
  pending: { value: false },
  refresh: vi.fn(),
  clear: vi.fn(),
}
vi.mock('#app', () => ({
  useNuxtApp: () => ({ $fetch: vi.fn() }),
  useAsyncData: () => mockAsyncDataResult,
}))

const ref = { __actionPath: 'list-todos', __actionMethod: 'GET', _types: {} as never }

describe('useActionQuery tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers tags with the query key when provided', () => {
    useActionQuery(ref as never, undefined, { tags: ['todos'] })
    expect(mockRegisterTags).toHaveBeenCalledOnce()
    const [key, tags] = mockRegisterTags.mock.calls[0]
    expect(key).toBe('action:/api/_actions/list-todos:{}')
    expect(tags).toEqual(['todos'])
  })

  it('does not register when no tags are given', () => {
    useActionQuery(ref as never)
    expect(mockRegisterTags).not.toHaveBeenCalled()
  })
})
