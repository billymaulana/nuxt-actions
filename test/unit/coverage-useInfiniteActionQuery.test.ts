import { ref, nextTick, effectScope } from 'vue'
import { useInfiniteActionQuery } from '../../src/runtime/composables/useInfiniteActionQuery'
import type { UseInfiniteActionQueryReturn } from '../../src/runtime/types'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()

/* Nuxt 4 removed $fetch from nuxtApp — the composable falls back to globalThis.$fetch */
vi.stubGlobal('$fetch', mockFetch)

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
  Promise.resolve(handler()).then((result) => {
    asyncDataResult.data.value = result
    asyncDataResult.status.value = 'success'
  }).catch(() => {
    asyncDataResult.status.value = 'error'
  })
  return asyncDataResult
})

vi.mock('#app', () => ({
  useNuxtApp: () => ({}),
  useAsyncData: (...args: unknown[]) => mockUseAsyncData(...args as [string, () => Promise<unknown>, unknown]),
}))

function createActionRef(path: string, method = 'GET') {
  return {
    __actionPath: path,
    __actionMethod: method,
    _types: {} as { readonly input: unknown, readonly output: unknown },
  } as never
}

async function flushAsync() {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

describe('useInfiniteActionQuery option branches and lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('derives the first page from late-arriving async data (SSR/A7 regression)', async () => {
    /*
     * The data resolves AFTER setup (like onServerPrefetch). The first page must
     * still appear via a render-time computed, not an immediate watch that Vue
     * stops during SSR before the data lands.
     */
    mockFetch.mockResolvedValue({ success: true, data: { items: [{ id: 1 }], cursor: 'c2' } })

    const { pages, data, hasNextPage } = useInfiniteActionQuery(createActionRef('feed'), undefined, {
      getNextPageParam: (p: { cursor?: string }) => p.cursor,
    })

    // Before the async data settles, the derivation is empty (no crash, no stale watch)
    expect(pages.value).toHaveLength(0)
    expect(hasNextPage.value).toBe(false)

    await flushAsync()

    expect(pages.value).toEqual([{ items: [{ id: 1 }], cursor: 'c2' }])
    expect(data.value).toEqual({ items: [{ id: 1 }], cursor: 'c2' })
    expect(hasNextPage.value).toBe(true) // nextPageParam reactively derived
  })

  it('has no next page when options are omitted entirely', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { items: [{ id: 1 }] } })

    const { pages, hasNextPage } = useInfiniteActionQuery(createActionRef('feed'))

    await flushAsync()

    expect(pages.value).toHaveLength(1)
    expect(hasNextPage.value).toBe(false)
  })

  it('sets immediate to false when enabled is statically false', () => {
    mockFetch.mockResolvedValue({ success: true, data: {} })

    useInfiniteActionQuery(createActionRef('gated'), undefined, {
      enabled: false,
      getNextPageParam: () => undefined,
    })

    expect(mockUseAsyncData).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ immediate: false }),
    )
  })

  it('sets immediate to true when enabled is statically true', () => {
    mockFetch.mockResolvedValue({ success: true, data: {} })

    useInfiniteActionQuery(createActionRef('open'), undefined, {
      enabled: true,
      getNextPageParam: () => undefined,
    })

    expect(mockUseAsyncData).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ immediate: true }),
    )
  })

  it('refreshes when a reactive enabled ref flips to true and ignores flips back to false', async () => {
    mockFetch.mockResolvedValue({ success: true, data: {} })

    const enabled = ref(false)
    useInfiniteActionQuery(createActionRef('gated'), undefined, {
      enabled,
      getNextPageParam: () => undefined,
    })

    enabled.value = true
    await nextTick()
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    enabled.value = false
    await nextTick()
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('exposes null data before any page has loaded', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { data, pages } = useInfiniteActionQuery(createActionRef('slow'), undefined, {
      getNextPageParam: () => undefined,
    })

    expect(pages.value).toHaveLength(0)
    expect(data.value).toBeNull()
  })

  it('forwards reactive input through the useAsyncData watch option', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    const query = ref('first')
    useInfiniteActionQuery(createActionRef('search'), () => ({ q: query.value }), {
      getNextPageParam: () => undefined,
    })

    const callOpts = mockUseAsyncData.mock.calls[0][2] as Record<string, unknown>
    const watchFns = callOpts.watch as Array<() => unknown>
    expect(watchFns).toHaveLength(1)
    expect(watchFns[0]()).toEqual({ q: 'first' })

    query.value = 'second'
    expect(watchFns[0]()).toEqual({ q: 'second' })
  })

  it('passes primitive input through without merging the page param', async () => {
    mockFetch.mockResolvedValue({ success: true, data: {} })

    useInfiniteActionQuery(createActionRef('raw'), () => 'plain-value', {
      initialPageParam: 1,
      getNextPageParam: () => undefined,
    })

    await flushAsync()

    expect(mockFetch).toHaveBeenCalledWith('/api/_actions/raw', expect.objectContaining({
      method: 'GET',
      query: 'plain-value',
    }))
  })

  it('uses a generic message when fetchNextPage rejects with a non-Error value', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { nextCursor: 'c1' } })

    const { fetchNextPage, error } = useInfiniteActionQuery(createActionRef('list'), undefined, {
      getNextPageParam: (lastPage: { nextCursor?: string }) => lastPage.nextCursor,
    })

    await flushAsync()

    mockFetch.mockRejectedValue('boom')

    await fetchNextPage()

    expect(error.value).toEqual({
      code: 'FETCH_ERROR',
      message: 'Failed to fetch next page',
      statusCode: 0,
    })
  })

  it('clears client-accumulated extra pages on dispose while the cached first page persists', async () => {
    mockFetch.mockResolvedValue({ success: true, data: { items: [{ id: 1 }], cursor: 'c2' } })

    const scope = effectScope()
    let result: UseInfiniteActionQueryReturn<unknown> | undefined
    scope.run(() => {
      result = useInfiniteActionQuery(createActionRef('list'), undefined, {
        getNextPageParam: (p: { cursor?: string }) => p.cursor,
      })
    })

    await flushAsync()
    mockFetch.mockResolvedValue({ success: true, data: { items: [{ id: 2 }] } })
    await result!.fetchNextPage()
    expect(result!.pages.value).toHaveLength(2)

    scope.stop()

    /* Extra (client-fetched) pages are freed; the first page lives in Nuxt's cache. */
    expect(result!.pages.value).toHaveLength(1)
  })
})
