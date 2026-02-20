import { invalidateActions, clearActionCache } from '../../src/runtime/composables/invalidateActions'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock #app
const mockRefreshNuxtData = vi.fn().mockResolvedValue(undefined)
const mockClearNuxtData = vi.fn()

vi.mock('#app', () => ({
  refreshNuxtData: (...args: unknown[]) => mockRefreshNuxtData(...args),
  clearNuxtData: (...args: unknown[]) => mockClearNuxtData(...args),
}))

describe('invalidateActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates all action queries when called without arguments', async () => {
    await invalidateActions()

    expect(mockRefreshNuxtData).toHaveBeenCalledOnce()
    const predicate = mockRefreshNuxtData.mock.calls[0][0] as (key: string) => boolean

    expect(predicate('action:/api/todos:{"q":"test"}')).toBe(true)
    expect(predicate('action:/api/users:{}')).toBe(true)
    expect(predicate('some-other-key')).toBe(false)
  })

  it('invalidates specific action by string path', async () => {
    await invalidateActions('/api/todos')

    expect(mockRefreshNuxtData).toHaveBeenCalledOnce()
    const predicate = mockRefreshNuxtData.mock.calls[0][0] as (key: string) => boolean

    expect(predicate('action:/api/todos:{"q":"test"}')).toBe(true)
    expect(predicate('action:/api/todos:{}')).toBe(true)
    expect(predicate('action:/api/users:{}')).toBe(false)
  })

  it('invalidates specific action by typed reference', async () => {
    const actionRef = {
      __actionPath: 'list-todos',
      __actionMethod: 'GET',
      _types: {} as { readonly input: unknown, readonly output: unknown },
    }

    await invalidateActions(actionRef as never)

    expect(mockRefreshNuxtData).toHaveBeenCalledOnce()
    const predicate = mockRefreshNuxtData.mock.calls[0][0] as (key: string) => boolean

    expect(predicate('action:/api/_actions/list-todos:{"q":"test"}')).toBe(true)
    expect(predicate('action:/api/_actions/other:{}')).toBe(false)
  })

  it('handles non-string keys gracefully', async () => {
    await invalidateActions()

    const predicate = mockRefreshNuxtData.mock.calls[0][0] as (key: unknown) => boolean
    expect(predicate(123)).toBe(false)
    expect(predicate(null)).toBe(false)
    expect(predicate(undefined)).toBe(false)
  })

  it('handles non-string keys gracefully when filtering by path', async () => {
    await invalidateActions('/api/todos')

    const predicate = mockRefreshNuxtData.mock.calls[0][0] as (key: unknown) => boolean
    expect(predicate(123)).toBe(false)
    expect(predicate(null)).toBe(false)
  })
})

describe('clearActionCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears all action caches when called without arguments', () => {
    clearActionCache()

    expect(mockClearNuxtData).toHaveBeenCalledOnce()
    const predicate = mockClearNuxtData.mock.calls[0][0] as (key: string) => boolean

    expect(predicate('action:/api/todos:{}')).toBe(true)
    expect(predicate('other-key')).toBe(false)
  })

  it('clears specific action cache by string path', () => {
    clearActionCache('/api/todos')

    const predicate = mockClearNuxtData.mock.calls[0][0] as (key: string) => boolean

    expect(predicate('action:/api/todos:{"q":"x"}')).toBe(true)
    expect(predicate('action:/api/users:{}')).toBe(false)
  })

  it('clears specific action cache by typed reference', () => {
    const actionRef = {
      __actionPath: 'search',
      __actionMethod: 'GET',
      _types: {} as { readonly input: unknown, readonly output: unknown },
    }

    clearActionCache(actionRef as never)

    const predicate = mockClearNuxtData.mock.calls[0][0] as (key: string) => boolean

    expect(predicate('action:/api/_actions/search:{"q":"hello"}')).toBe(true)
    expect(predicate('action:/api/_actions/other:{}')).toBe(false)
  })

  it('handles non-string keys gracefully', () => {
    clearActionCache()

    const predicate = mockClearNuxtData.mock.calls[0][0] as (key: unknown) => boolean
    expect(predicate(42)).toBe(false)
  })

  it('handles non-string keys gracefully when filtering by path', () => {
    clearActionCache('/api/todos')

    const predicate = mockClearNuxtData.mock.calls[0][0] as (key: unknown) => boolean
    expect(predicate(42)).toBe(false)
    expect(predicate(null)).toBe(false)
  })
})
