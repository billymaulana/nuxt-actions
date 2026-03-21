import { ref, nextTick } from 'vue'
import { useInfiniteActionQuery } from '../../src/runtime/composables/useInfiniteActionQuery'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock onScopeDispose
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onScopeDispose: vi.fn(),
  }
})

// Mock $fetch
const mockFetch = vi.fn()

// Mock useAsyncData - create fresh refs per call to isolate tests
const mockRefresh = vi.fn()
const mockClear = vi.fn()

const mockUseAsyncData = vi.fn((_key: string, handler: () => Promise<unknown>, _opts?: unknown) => {
  const asyncDataResult = {
    data: ref<unknown>(null),
    status: ref<string>('idle'),
    pending: ref(false),
    refresh: mockRefresh,
    clear: mockClear,
  }
  handler().then((result) => {
    asyncDataResult.data.value = result
    asyncDataResult.status.value = 'success'
    asyncDataResult.pending.value = false
  }).catch(() => {
    asyncDataResult.status.value = 'error'
    asyncDataResult.pending.value = false
  })
  return asyncDataResult
})

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $fetch: mockFetch,
  }),
  useAsyncData: (...args: unknown[]) => mockUseAsyncData(...args as [string, () => Promise<unknown>, unknown]),
}))

function createActionRef(path: string, method = 'GET') {
  return {
    __actionPath: path,
    __actionMethod: method,
    _types: {} as { readonly input: unknown, readonly output: unknown },
  } as never
}

/** Flush microtask queue so handler().then() in mockUseAsyncData settles */
async function flushAsync() {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('useInfiniteActionQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial page fetch', () => {
    it('fetches and stores the first page', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 1 }], nextCursor: 'abc' },
      })

      const { pages, data } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
        },
      )

      await flushAsync()

      expect(pages.value).toHaveLength(1)
      expect(pages.value[0]).toEqual({ items: [{ id: 1 }], nextCursor: 'abc' })
      expect(data.value).toEqual({ items: [{ id: 1 }], nextCursor: 'abc' })
    })

    it('makes correct fetch call for typed reference', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { items: [] } })

      useInfiniteActionQuery(
        createActionRef('search', 'GET'),
        () => ({ q: 'test' }),
        { getNextPageParam: () => undefined },
      )

      await flushAsync()

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/search', expect.objectContaining({
        method: 'GET',
        query: { q: 'test' },
      }))
    })

    it('makes correct fetch call for string path', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { items: [] } })

      useInfiniteActionQuery(
        '/api/items',
        () => ({ limit: 10 }),
        { getNextPageParam: () => undefined },
      )

      await flushAsync()

      expect(mockFetch).toHaveBeenCalledWith('/api/items', expect.objectContaining({
        method: 'GET',
        query: { limit: 10 },
      }))
    })

    it('sends body for POST method', async () => {
      mockFetch.mockResolvedValue({ success: true, data: { items: [] } })

      useInfiniteActionQuery(
        createActionRef('search', 'POST'),
        () => ({ filter: 'active' }),
        { getNextPageParam: () => undefined },
      )

      await flushAsync()

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/search', expect.objectContaining({
        method: 'POST',
        body: { filter: 'active' },
      }))
    })
  })

  describe('fetchNextPage appends to pages array', () => {
    it('appends second page when fetchNextPage is called', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 1 }], nextCursor: 'cursor-1' },
      })

      const { pages, fetchNextPage, hasNextPage } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
        },
      )

      await flushAsync()
      expect(pages.value).toHaveLength(1)
      expect(hasNextPage.value).toBe(true)

      // Second page
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 2 }], nextCursor: 'cursor-2' },
      })

      await fetchNextPage()

      expect(pages.value).toHaveLength(2)
      expect(pages.value[1]).toEqual({ items: [{ id: 2 }], nextCursor: 'cursor-2' })
    })

    it('sets error on fetchNextPage failure', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [], nextCursor: 'c1' },
      })

      const { fetchNextPage, error } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
        },
      )

      await flushAsync()

      // Next page returns error
      mockFetch.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'Page error', statusCode: 500 },
      })

      await fetchNextPage()

      expect(error.value).toEqual({ code: 'ERR', message: 'Page error', statusCode: 500 })
    })

    it('handles fetch error on fetchNextPage', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [], nextCursor: 'c1' },
      })

      const { fetchNextPage, error } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
        },
      )

      await flushAsync()

      mockFetch.mockRejectedValue(new Error('Network error'))

      await fetchNextPage()

      expect(error.value).toEqual({
        code: 'FETCH_ERROR',
        message: 'Network error',
        statusCode: 0,
      })
    })

    it('does not fetch if already fetching next page', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [], nextCursor: 'c1' },
      })

      const { fetchNextPage, isFetchingNextPage } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
        },
      )

      await flushAsync()

      let resolveFetch: ((value: unknown) => void) | undefined
      mockFetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))

      const promise = fetchNextPage()
      expect(isFetchingNextPage.value).toBe(true)

      // Try fetching again while in-flight — should be a no-op
      await fetchNextPage()
      expect(mockFetch).toHaveBeenCalledTimes(2) // initial + one next page

      resolveFetch!({ success: true, data: { items: [] } })
      await promise
    })
  })

  describe('hasNextPage becomes false when getNextPageParam returns undefined', () => {
    it('hasNextPage is false when there are no more pages', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 1 }], nextCursor: undefined },
      })

      const { hasNextPage } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
        },
      )

      await flushAsync()

      expect(hasNextPage.value).toBe(false)
    })

    it('fetchNextPage is a no-op when hasNextPage is false', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 1 }] },
      })

      const { fetchNextPage, hasNextPage, pages } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: () => undefined,
        },
      )

      await flushAsync()
      expect(pages.value).toHaveLength(1)
      expect(hasNextPage.value).toBe(false)

      await fetchNextPage()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(pages.value).toHaveLength(1)
    })
  })

  describe('transform option', () => {
    it('transforms page data before storing', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 2 }, { id: 1 }], nextCursor: 'c1' },
      })

      const { pages } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
          transform: (page: { items: { id: number }[], nextCursor?: string }) => ({
            ...page,
            items: [...page.items].sort((a, b) => a.id - b.id),
          }),
        },
      )

      await flushAsync()

      expect(pages.value).toHaveLength(1)
      expect((pages.value[0] as { items: { id: number }[] }).items).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('applies transform to fetchNextPage results', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: ['a'], nextCursor: 'c1' },
      })

      const { pages, fetchNextPage } = useInfiniteActionQuery(
        createActionRef('list-items'),
        undefined,
        {
          getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
          transform: (page: { items: string[], nextCursor?: string }) => ({
            ...page,
            items: page.items.map(s => String(s).toUpperCase()),
          }),
        },
      )

      await flushAsync()
      expect(pages.value).toHaveLength(1)

      mockFetch.mockResolvedValue({
        success: true,
        data: { items: ['b'], nextCursor: undefined },
      })

      await fetchNextPage()

      expect((pages.value[1] as { items: string[] }).items).toEqual(['B'])
    })
  })

  describe('refresh and clear', () => {
    it('refresh resets pages and re-fetches', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 1 }] },
      })

      const { pages, refresh } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        { getNextPageParam: () => undefined },
      )

      await flushAsync()
      expect(pages.value).toHaveLength(1)

      await refresh()

      expect(mockRefresh).toHaveBeenCalled()
    })

    it('clear resets pages and calls asyncData.clear', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [{ id: 1 }] },
      })

      const { pages, clear, error } = useInfiniteActionQuery(
        createActionRef('list-todos'),
        undefined,
        { getNextPageParam: () => undefined },
      )

      await flushAsync()
      expect(pages.value).toHaveLength(1)

      clear()

      expect(pages.value).toHaveLength(0)
      expect(error.value).toBeNull()
      expect(mockClear).toHaveBeenCalled()
    })
  })

  describe('initialPageParam', () => {
    it('passes initialPageParam to first fetch', async () => {
      mockFetch.mockResolvedValue({
        success: true,
        data: { items: [], nextOffset: 20 },
      })

      useInfiniteActionQuery(
        createActionRef('list-items', 'GET'),
        () => ({ limit: 10 }),
        {
          initialPageParam: 0,
          getNextPageParam: (lastPage: { nextOffset?: number }) => lastPage.nextOffset,
        },
      )

      await flushAsync()

      expect(mockFetch).toHaveBeenCalledWith('/api/_actions/list-items', expect.objectContaining({
        method: 'GET',
        query: { limit: 10, pageParam: 0 },
      }))
    })
  })
})
