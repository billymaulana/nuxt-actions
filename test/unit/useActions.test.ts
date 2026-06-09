import { useActions } from '../../src/runtime/composables/useActions'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock $fetch
const mockFetch = vi.fn()

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
  }),
}))

function createActionRef(path: string, method = 'POST') {
  return {
    __actionPath: path,
    __actionMethod: method,
    _types: {} as { readonly input: unknown, readonly output: unknown },
  } as never
}

describe('useActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parallel execution (default)', () => {
    it('runs all actions via Promise.allSettled', async () => {
      mockFetch
        .mockResolvedValueOnce({ success: true, data: { id: 1 } })
        .mockResolvedValueOnce({ success: true, data: { id: 2 } })

      const { execute, results } = useActions([
        createActionRef('action-a'),
        createActionRef('action-b'),
      ])

      const settled = await execute([{ title: 'A' }, { title: 'B' }])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(settled).toHaveLength(2)
      expect(settled[0]).toEqual({ success: true, data: { id: 1 } })
      expect(settled[1]).toEqual({ success: true, data: { id: 2 } })
      expect(results.value).toEqual(settled)
    })

    it('handles mixed success and failure results', async () => {
      mockFetch
        .mockResolvedValueOnce({ success: true, data: { id: 1 } })
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Not found', statusCode: 404 },
        })

      const { execute, errors, hasErrors } = useActions([
        createActionRef('action-a'),
        createActionRef('action-b'),
      ])

      await execute([{}, {}])

      expect(hasErrors.value).toBe(true)
      expect(errors.value[0]).toBeNull()
      expect(errors.value[1]).toEqual({ code: 'NOT_FOUND', message: 'Not found', statusCode: 404 })
    })

    it('handles fetch rejection in parallel mode', async () => {
      mockFetch
        .mockResolvedValueOnce({ success: true, data: {} })
        .mockRejectedValueOnce(new Error('Network error'))

      const { execute, errors } = useActions([
        createActionRef('action-a'),
        createActionRef('action-b'),
      ])

      const settled = await execute([{}, {}])

      // The rejected promise should be caught by executeSingle and return FETCH_ERROR
      expect(settled[0]).toEqual({ success: true, data: {} })
      expect(settled[1]).toEqual({
        success: false,
        error: { code: 'FETCH_ERROR', message: 'Network error', statusCode: 0 },
      })
      expect(errors.value[1]).toEqual({ code: 'FETCH_ERROR', message: 'Network error', statusCode: 0 })
    })
  })

  describe('sequential execution', () => {
    it('runs actions sequentially', async () => {
      const callOrder: string[] = []
      mockFetch
        .mockImplementationOnce(async () => {
          callOrder.push('action-a')
          return { success: true, data: { id: 1 } }
        })
        .mockImplementationOnce(async () => {
          callOrder.push('action-b')
          return { success: true, data: { id: 2 } }
        })

      const { execute } = useActions(
        [createActionRef('action-a'), createActionRef('action-b')],
        { mode: 'sequential' },
      )

      const settled = await execute([{ title: 'A' }, { title: 'B' }])

      expect(callOrder).toEqual(['action-a', 'action-b'])
      expect(settled).toHaveLength(2)
      expect(settled[0]).toEqual({ success: true, data: { id: 1 } })
      expect(settled[1]).toEqual({ success: true, data: { id: 2 } })
    })

    it('continues executing after a failure in sequential mode', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({ success: true, data: { id: 2 } })

      const { execute } = useActions(
        [createActionRef('action-a'), createActionRef('action-b')],
        { mode: 'sequential' },
      )

      const settled = await execute([{}, {}])

      expect(settled[0]).toEqual({
        success: false,
        error: { code: 'FETCH_ERROR', message: 'First failed', statusCode: 0 },
      })
      expect(settled[1]).toEqual({ success: true, data: { id: 2 } })
    })
  })

  describe('pending state', () => {
    it('sets pending to true during execution and false after', async () => {
      let resolveFetch: ((value: unknown) => void) | undefined
      mockFetch.mockReturnValue(new Promise((resolve) => {
        resolveFetch = resolve
      }))

      const { execute, pending } = useActions([createActionRef('action-a')])

      expect(pending.value).toBe(false)

      const promise = execute([{}])
      expect(pending.value).toBe(true)

      resolveFetch!({ success: true, data: {} })
      await promise

      expect(pending.value).toBe(false)
    })

    it('resets results and errors on new execution', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      const { execute, results, errors } = useActions([createActionRef('action-a')])

      await execute([{ first: true }])
      expect(results.value[0]).toEqual({ success: true, data: { id: 1 } })

      mockFetch.mockResolvedValue({ success: true, data: { id: 2 } })
      await execute([{ second: true }])
      expect(results.value[0]).toEqual({ success: true, data: { id: 2 } })
      expect(errors.value[0]).toBeNull()
    })
  })

  describe('error handling', () => {
    it('handles non-Error fetch exceptions', async () => {
      mockFetch.mockRejectedValue('timeout')

      const { execute, errors } = useActions([createActionRef('action-a')])
      await execute([{}])

      expect(errors.value[0]).toEqual({
        code: 'FETCH_ERROR',
        message: 'Failed to execute action',
        statusCode: 0,
      })
    })

    it('hasErrors is false when all actions succeed', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute, hasErrors } = useActions([
        createActionRef('action-a'),
        createActionRef('action-b'),
      ])

      await execute([{}, {}])
      expect(hasErrors.value).toBe(false)
    })
  })

  describe('action resolution', () => {
    it('resolves typed action reference path and method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useActions([createActionRef('create-todo', 'POST')])
      await execute([{ title: 'Test' }])

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/create-todo', expect.objectContaining({
        method: 'POST',
        body: { title: 'Test' },
      }))
    })

    it('resolves string action path', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      const { execute } = useActions(['/api/custom-action'])
      await execute([{ data: 'x' }])

      expect(mockFetch).toHaveBeenCalledWith('/api/custom-action', expect.objectContaining({
        method: 'POST',
        body: { data: 'x' },
      }))
    })

    it('sends query for GET method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: [] })

      const { execute } = useActions([createActionRef('search', 'GET')])
      await execute([{ q: 'test' }])

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/search', expect.objectContaining({
        method: 'GET',
        query: { q: 'test' },
      }))
    })
  })
})
