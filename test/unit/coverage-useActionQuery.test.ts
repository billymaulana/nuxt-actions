import { ref, nextTick, effectScope } from 'vue'
import { useActionQuery } from '../../src/runtime/composables/useActionQuery'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

describe('useActionQuery enabled ref and polling lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls back to global $fetch when nuxtApp does not expose $fetch', async () => {
    mockFetch.mockResolvedValue({ success: true, data: [{ id: 1 }] })

    const { data } = useActionQuery(createActionRef('list-todos'))

    await vi.waitFor(() => expect(data.value).toEqual([{ id: 1 }]))

    expect(mockFetch).toHaveBeenCalledWith('/api/_actions/list-todos', {
      method: 'GET',
      query: {},
    })
  })

  it('starts disabled with a reactive enabled ref and refreshes once it becomes true', async () => {
    mockFetch.mockResolvedValue({ success: true, data: {} })

    const enabled = ref(false)
    useActionQuery(createActionRef('gated'), undefined, { enabled })

    expect(mockUseAsyncData).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ immediate: false }),
    )

    enabled.value = true
    await nextTick()
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    enabled.value = false
    await nextTick()
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('skips polling refreshes while a reactive enabled ref is false', () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ success: true, data: {} })

    const enabled = ref(false)
    useActionQuery(createActionRef('polling'), undefined, {
      refetchInterval: 1000,
      enabled,
    })

    vi.advanceTimersByTime(3000)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('never starts a polling interval on the server (SSR leak guard)', () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ success: true, data: {} })

    const scope = effectScope()
    scope.run(() => {
      useActionQuery(createActionRef('polling'), undefined, { refetchInterval: 1000 })
    })

    /* import.meta.client is falsy in node — polling must not run server-side */
    vi.advanceTimersByTime(5000)
    expect(mockRefresh).not.toHaveBeenCalled()
    scope.stop()
  })
})
