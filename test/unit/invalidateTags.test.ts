import { invalidateTags, invalidateActions } from '../../src/runtime/composables/invalidateActions'
import { registerTags } from '../../src/runtime/composables/_tagRegistry'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRefreshNuxtData = vi.fn().mockResolvedValue(undefined)
let app: { _asyncData: Record<string, unknown>, _actionTags?: Map<string, Set<string>> }

vi.mock('#app', () => ({
  refreshNuxtData: (...args: unknown[]) => mockRefreshNuxtData(...args),
  clearNuxtData: vi.fn(),
  useNuxtApp: () => app,
}))

describe('invalidateTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    app = { _asyncData: {} }
    registerTags('action:/api/_actions/list-todos:{}', ['todos'])
    registerTags('action:/api/_actions/search:{"q":"x"}', ['todos'])
    registerTags('action:/api/_actions/profile:{}', ['user'])
  })

  it('refetches keys carrying the tag', async () => {
    await invalidateTags('todos')
    expect(mockRefreshNuxtData).toHaveBeenCalledOnce()
    const keys = mockRefreshNuxtData.mock.calls[0][0] as string[]
    expect(keys).toContain('action:/api/_actions/list-todos:{}')
    expect(keys).toContain('action:/api/_actions/search:{"q":"x"}')
    expect(keys).not.toContain('action:/api/_actions/profile:{}')
  })

  it('accepts an array of tags', async () => {
    await invalidateTags(['todos', 'user'])
    const keys = mockRefreshNuxtData.mock.calls[0][0] as string[]
    expect(keys).toContain('action:/api/_actions/profile:{}')
  })

  it('does not refetch for an unknown tag', async () => {
    await invalidateTags('nope')
    expect(mockRefreshNuxtData).not.toHaveBeenCalled()
  })
})

describe('invalidateActions array form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    app = {
      _asyncData: {
        'action:/api/todos:{}': {},
        'action:/api/users:{}': {},
        'action:/api/posts:{}': {},
      },
    }
  })

  it('invalidates multiple paths in one refresh call', async () => {
    await invalidateActions(['/api/todos', '/api/users'])
    expect(mockRefreshNuxtData).toHaveBeenCalledOnce()
    const keys = mockRefreshNuxtData.mock.calls[0][0] as string[]
    expect(keys).toContain('action:/api/todos:{}')
    expect(keys).toContain('action:/api/users:{}')
    expect(keys).not.toContain('action:/api/posts:{}')
  })
})
