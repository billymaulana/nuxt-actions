import { ref } from 'vue'
import { useActionQuery } from '../../src/runtime/composables/useActionQuery'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock $fetch
const mockFetch = vi.fn()

// Mock useAsyncData
const mockRefresh = vi.fn()
const mockClear = vi.fn()
const mockAsyncDataResult = {
  data: ref<unknown>(null),
  status: ref<string>('idle'),
  pending: ref(false),
  refresh: mockRefresh,
  clear: mockClear,
}

const mockUseAsyncData = vi.fn((_key: string | (() => string), handler: () => Promise<unknown>, _opts?: unknown) => {
  // Execute the handler to simulate useAsyncData
  handler().then((result) => {
    mockAsyncDataResult.data.value = result
    mockAsyncDataResult.status.value = 'success'
    mockAsyncDataResult.pending.value = false
  }).catch(() => {
    mockAsyncDataResult.status.value = 'error'
    mockAsyncDataResult.pending.value = false
  })
  return mockAsyncDataResult
})

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
  }),
  useAsyncData: (...args: unknown[]) => mockUseAsyncData(...args as [string | (() => string), () => Promise<unknown>, unknown]),
}))

function createActionRef(path: string, method = 'GET') {
  return {
    __actionPath: path,
    __actionMethod: method,
    _types: {} as { readonly input: unknown, readonly output: unknown },
  } as never
}

describe('useActionQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAsyncDataResult.data.value = null
    mockAsyncDataResult.status.value = 'idle'
    mockAsyncDataResult.pending.value = false
  })

  describe('basic usage', () => {
    it('extracts data from successful ActionResult', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Test' }],
      })

      const { data } = useActionQuery(createActionRef('list-todos'))

      await vi.waitFor(() => expect(mockAsyncDataResult.data.value).not.toBeNull())

      expect(data.value).toEqual([{ id: 1, title: 'Test' }])
    })

    it('makes correct fetch call for typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      useActionQuery(createActionRef('get-user'), () => ({ id: 42 }))

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/get-user', {
        method: 'GET',
        query: { id: 42 },
      })
    })

    it('makes correct fetch call for string path', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      useActionQuery('/api/test', () => ({ q: 'search' }))

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())

      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        method: 'GET',
        query: { q: 'search' },
      })
    })
  })

  describe('error extraction', () => {
    it('extracts error from failed ActionResult', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found', statusCode: 404 },
      })

      const { data, error } = useActionQuery(createActionRef('get-item'))

      await vi.waitFor(() => expect(mockAsyncDataResult.data.value).not.toBeNull())

      expect(data.value).toBeNull()
      expect(error.value).toEqual({
        code: 'NOT_FOUND',
        message: 'Not found',
        statusCode: 404,
      })
    })

    it('returns null data and error when result is null', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      const { data, error } = useActionQuery(createActionRef('test'))

      expect(data.value).toBeNull()
      expect(error.value).toBeNull()
    })
  })

  describe('default option', () => {
    it('uses default factory when data is null', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      const { data } = useActionQuery(createActionRef('list'), undefined, {
        default: () => [],
      })

      expect(data.value).toEqual([])
    })

    it('uses default factory when result is error', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'fail', statusCode: 500 },
      })

      const { data } = useActionQuery(createActionRef('list'), undefined, {
        default: () => ['fallback'],
      })

      await vi.waitFor(() => expect(mockAsyncDataResult.data.value).not.toBeNull())

      expect(data.value).toEqual(['fallback'])
    })
  })

  describe('options forwarding', () => {
    it('passes SSR options to useAsyncData', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      useActionQuery(createActionRef('test'), undefined, {
        server: false,
        lazy: true,
        immediate: false,
      })

      expect(mockUseAsyncData).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          server: false,
          lazy: true,
          immediate: false,
        }),
      )
    })

    it('defaults to server: true, lazy: false, immediate: true', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      useActionQuery(createActionRef('test'))

      expect(mockUseAsyncData).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          server: true,
          lazy: false,
          immediate: true,
        }),
      )
    })
  })

  describe('return values', () => {
    it('exposes refresh and clear from useAsyncData', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      const result = useActionQuery(createActionRef('test'))

      expect(result.refresh).toBe(mockRefresh)
      expect(result.clear).toBe(mockClear)
    })

    it('exposes status and pending from useAsyncData', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      const result = useActionQuery(createActionRef('test'))

      expect(result.status.value).toBe('idle')
      expect(result.pending.value).toBe(false)
    })
  })

  describe('key generation', () => {
    it('generates unique key based on path and input', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      useActionQuery(createActionRef('search'), () => ({ q: 'hello' }))

      // Key is passed as a getter function for reactive updates
      const keyArg = mockUseAsyncData.mock.calls[0][0]
      expect(typeof keyArg).toBe('function')
      expect((keyArg as () => string)()).toBe('action:/api/_actions/search:{"q":"hello"}')
    })

    it('generates key with empty object for no input', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      useActionQuery(createActionRef('list'))

      const keyArg = mockUseAsyncData.mock.calls[0][0]
      expect(typeof keyArg).toBe('function')
      expect((keyArg as () => string)()).toBe('action:/api/_actions/list:{}')
    })

    it('key updates reactively when input changes', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      const query = ref('hello')
      useActionQuery(createActionRef('search'), () => ({ q: query.value }))

      const keyFn = mockUseAsyncData.mock.calls[0][0] as () => string
      expect(keyFn()).toBe('action:/api/_actions/search:{"q":"hello"}')

      // Change reactive input — key should reflect the new value
      query.value = 'world'
      expect(keyFn()).toBe('action:/api/_actions/search:{"q":"world"}')
    })
  })

  describe('POST body routing', () => {
    it('sends input as body for POST-method typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { id: 1 } })

      useActionQuery(createActionRef('create-item', 'POST'), () => ({ title: 'New' }))

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/create-item', {
        method: 'POST',
        body: { title: 'New' },
      })
    })

    it('sends input as body for PUT-method typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      useActionQuery(createActionRef('update-item', 'PUT'), () => ({ id: 1, title: 'Updated' }))

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/update-item', {
        method: 'PUT',
        body: { id: 1, title: 'Updated' },
      })
    })

    it('sends input as body for PATCH-method typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      useActionQuery(createActionRef('patch-item', 'PATCH'), () => ({ done: true }))

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/patch-item', {
        method: 'PATCH',
        body: { done: true },
      })
    })

    it('sends input as query for GET-method typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: [] })

      useActionQuery(createActionRef('search', 'GET'), () => ({ q: 'test' }))

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/search', {
        method: 'GET',
        query: { q: 'test' },
      })
    })

    it('sends input as query for DELETE-method typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: {} })

      useActionQuery(createActionRef('delete-item', 'DELETE'), () => ({ id: 1 }))

      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/delete-item', {
        method: 'DELETE',
        query: { id: 1 },
      })
    })
  })

  describe('reactive input', () => {
    it('passes watch option when input is provided', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      const query = ref('test')
      useActionQuery(createActionRef('search'), () => ({ q: query.value }))

      const callOpts = mockUseAsyncData.mock.calls[0][2] as Record<string, unknown>
      expect(Array.isArray(callOpts.watch)).toBe(true)
    })

    it('watch function returns current input value', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      const query = ref('test')
      useActionQuery(createActionRef('search'), () => ({ q: query.value }))

      const callOpts = mockUseAsyncData.mock.calls[0][2] as Record<string, unknown>
      const watchFns = callOpts.watch as Array<() => unknown>
      expect(watchFns).toHaveLength(1)
      expect(watchFns[0]()).toEqual({ q: 'test' })
    })

    it('passes watch: false when no input', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))

      useActionQuery(createActionRef('list'))

      const callOpts = mockUseAsyncData.mock.calls[0][2] as Record<string, unknown>
      expect(callOpts.watch).toBe(false)
    })
  })
})
