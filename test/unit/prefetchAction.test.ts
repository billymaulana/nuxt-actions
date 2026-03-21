import { prefetchAction } from '../../src/runtime/composables/prefetchAction'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock $fetch
const mockFetch = vi.fn()

// Mock payload & static data stores
const payloadData: Record<string, unknown> = {}
const staticData: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
    payload: { data: payloadData },
    static: { data: staticData },
  }),
}))

function createActionRef(path: string, method = 'GET') {
  return {
    __actionPath: path,
    __actionMethod: method,
    _types: {} as { readonly input: unknown, readonly output: unknown },
  } as never
}

describe('prefetchAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear payload and static data
    for (const key of Object.keys(payloadData)) delete payloadData[key]
    for (const key of Object.keys(staticData)) delete staticData[key]
  })

  describe('fetches and stores result in payload.data', () => {
    it('stores successful result in payload.data and static.data', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Todo' }],
      })

      const result = await prefetchAction(createActionRef('list-todos'))

      expect(result).toEqual([{ id: 1, title: 'Todo' }])
      const key = 'action:/api/_actions/list-todos:{}'
      expect(payloadData[key]).toEqual({
        success: true,
        data: [{ id: 1, title: 'Todo' }],
      })
      expect(staticData[key]).toEqual({
        success: true,
        data: [{ id: 1, title: 'Todo' }],
      })
    })

    it('returns null for failed action result', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 500 },
      })

      const result = await prefetchAction(createActionRef('get-item'))

      expect(result).toBeNull()
      const key = 'action:/api/_actions/get-item:{}'
      expect(payloadData[key]).toEqual({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 500 },
      })
    })

    it('returns null on fetch error (best-effort)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await prefetchAction(createActionRef('broken'))

      expect(result).toBeNull()
    })
  })

  describe('skips fetch when data is already cached', () => {
    it('returns cached data without calling fetch', async () => {
      const key = 'action:/api/_actions/list-todos:{}'
      payloadData[key] = { success: true, data: [{ id: 99 }] }

      const result = await prefetchAction(createActionRef('list-todos'))

      expect(mockFetch).not.toHaveBeenCalled()
      expect(result).toEqual([{ id: 99 }])
    })

    it('returns null for cached error result', async () => {
      const key = 'action:/api/_actions/get-item:{}'
      payloadData[key] = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found', statusCode: 404 },
      }

      const result = await prefetchAction(createActionRef('get-item'))

      expect(mockFetch).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  describe('typed reference and string path overloads', () => {
    it('constructs path from typed action reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      await prefetchAction(createActionRef('get-user'))

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/get-user', expect.objectContaining({
        method: 'GET',
        query: {},
      }))
    })

    it('uses string path directly', async () => {
      mockFetch.mockResolvedValue({ success: true, data: [] })

      await prefetchAction('/api/todos')

      expect(mockFetch).toHaveBeenCalledWith('/api/todos', expect.objectContaining({
        method: 'GET',
        query: {},
      }))
    })

    it('sends input as query for GET method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: [] })

      await prefetchAction(createActionRef('search', 'GET'), { q: 'hello' })

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/search', expect.objectContaining({
        method: 'GET',
        query: { q: 'hello' },
      }))
    })

    it('sends input as body for POST method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      await prefetchAction(createActionRef('create-todo', 'POST'), { title: 'New' })

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/create-todo', expect.objectContaining({
        method: 'POST',
        body: { title: 'New' },
      }))
    })

    it('sends input as body for PUT method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      await prefetchAction(createActionRef('update-todo', 'PUT'), { id: 1, title: 'Updated' })

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/update-todo', expect.objectContaining({
        method: 'PUT',
        body: { id: 1, title: 'Updated' },
      }))
    })

    it('sends input as body for PATCH method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      await prefetchAction(createActionRef('patch-todo', 'PATCH'), { done: true })

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/patch-todo', expect.objectContaining({
        method: 'PATCH',
        body: { done: true },
      }))
    })

    it('generates deterministic cache key with input', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { name: 'Alice' } })

      await prefetchAction(createActionRef('get-user', 'GET'), { id: 42 })

      const key = 'action:/api/_actions/get-user:{"id":42}'
      expect(payloadData[key]).toBeDefined()
    })
  })
})
