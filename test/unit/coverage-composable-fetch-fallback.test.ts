import { ref } from 'vue'
import { prefetchAction } from '../../src/runtime/composables/prefetchAction'
import { useAction } from '../../src/runtime/composables/useAction'
import { useActions } from '../../src/runtime/composables/useActions'
import { useOptimisticAction } from '../../src/runtime/composables/useOptimisticAction'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onScopeDispose: vi.fn(),
  }
})

const mockGlobalFetch = vi.fn()

interface MockNuxtApp {
  payload: { data: Record<string, unknown> }
  static: { data: Record<string, unknown> }
}

let mockNuxtApp: MockNuxtApp

vi.mock('#app', () => ({
  useNuxtApp: () => mockNuxtApp,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockNuxtApp = {
    payload: { data: {} },
    static: { data: {} },
  }
  vi.stubGlobal('$fetch', mockGlobalFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('global $fetch fallback when the nuxt app does not expose $fetch', () => {
  it('prefetchAction fetches via the global $fetch and caches the result', async () => {
    mockGlobalFetch.mockResolvedValue({ success: true, data: { id: 7 } })

    const result = await prefetchAction<{ q: string }, { id: number }>('/api/items', { q: 'x' })

    expect(mockGlobalFetch).toHaveBeenCalledWith('/api/items', expect.objectContaining({
      method: 'GET',
      query: { q: 'x' },
    }))
    expect(result).toEqual({ id: 7 })
    expect(mockNuxtApp.payload.data['action:/api/items:{"q":"x"}']).toEqual({
      success: true,
      data: { id: 7 },
    })
  })

  it('useAction executes via the global $fetch', async () => {
    mockGlobalFetch.mockResolvedValue({ success: true, data: { ok: true } })

    const { execute, data } = useAction('/api/fallback')
    await execute(undefined)

    expect(mockGlobalFetch).toHaveBeenCalledWith('/api/fallback', expect.objectContaining({
      method: 'POST',
    }))
    expect(data.value).toEqual({ ok: true })
  })

  it('useActions executes via the global $fetch', async () => {
    mockGlobalFetch.mockResolvedValue({ success: true, data: { id: 1 } })

    const { execute } = useActions(['/api/one'])
    const settled = await execute([{ title: 'A' }])

    expect(mockGlobalFetch).toHaveBeenCalledWith('/api/one', expect.objectContaining({
      method: 'POST',
      body: { title: 'A' },
    }))
    expect(settled[0]).toEqual({ success: true, data: { id: 1 } })
  })

  it('useOptimisticAction executes via the global $fetch and syncs server truth', async () => {
    mockGlobalFetch.mockResolvedValue({ success: true, data: { count: 5 } })

    const current = ref({ count: 0 })
    const { execute, data, optimisticData } = useOptimisticAction<{ by: number }, { count: number }>('/api/counter', {
      currentData: current,
      updateFn: (input, currentData) => ({ count: currentData.count + input.by }),
    })

    await execute({ by: 1 })

    expect(mockGlobalFetch).toHaveBeenCalledWith('/api/counter', expect.objectContaining({
      method: 'POST',
      body: { by: 1 },
    }))
    expect(data.value).toEqual({ count: 5 })
    expect(optimisticData.value).toEqual({ count: 5 })
  })
})
