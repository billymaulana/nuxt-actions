import { ref } from 'vue'
import { invalidateActions } from '../../src/runtime/composables/invalidateActions'
import { useAction } from '../../src/runtime/composables/useAction'
import { useActions } from '../../src/runtime/composables/useActions'
import { useOptimisticAction } from '../../src/runtime/composables/useOptimisticAction'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onScopeDispose: vi.fn(),
  }
})

const mockNuxtFetch = vi.fn()
const mockRefreshNuxtData = vi.fn().mockResolvedValue(undefined)
const mockClearNuxtData = vi.fn()

interface MockNuxtApp {
  $fetch?: ReturnType<typeof vi.fn>
  _asyncData?: Record<string, unknown>
}

let mockNuxtApp: MockNuxtApp

vi.mock('#app', () => ({
  useNuxtApp: () => mockNuxtApp,
  refreshNuxtData: (...args: unknown[]) => mockRefreshNuxtData(...args),
  clearNuxtData: (...args: unknown[]) => mockClearNuxtData(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockNuxtApp = { $fetch: mockNuxtFetch }
})

describe('invalidateActions registry fallback', () => {
  it('skips refresh when the nuxt app has no _asyncData registry', async () => {
    await invalidateActions('/api/todos')

    expect(mockRefreshNuxtData).not.toHaveBeenCalled()
  })

  it('skips refresh for the all-actions form when the registry is missing', async () => {
    await invalidateActions()

    expect(mockRefreshNuxtData).not.toHaveBeenCalled()
  })

  it('refreshes only keys matching a string path when the registry exists', async () => {
    mockNuxtApp._asyncData = {
      'action:/api/todos:{}': {},
      'action:/api/users:{}': {},
    }

    await invalidateActions('/api/todos')

    expect(mockRefreshNuxtData).toHaveBeenCalledWith(['action:/api/todos:{}'])
  })
})

describe('useAction transform option', () => {
  it('stores the transformed data when a transform is provided', async () => {
    mockNuxtFetch.mockResolvedValue({ success: true, data: { count: 2 } })

    const { execute, data } = useAction<{ count: number }, { count: number }>('/api/counter', {
      transform: result => ({ count: result.count * 10 }),
    })

    await execute({ count: 2 })

    expect(data.value).toEqual({ count: 20 })
  })

  it('stores the raw data when no transform is provided', async () => {
    mockNuxtFetch.mockResolvedValue({ success: true, data: { count: 2 } })

    const { execute, data } = useAction<{ count: number }, { count: number }>('/api/counter')

    await execute({ count: 2 })

    expect(data.value).toEqual({ count: 2 })
  })
})

describe('useActions rejection mapping', () => {
  function createActionRef(path: string, method = 'POST') {
    return {
      __actionPath: path,
      __actionMethod: method,
      _types: {} as { readonly input: unknown, readonly output: unknown },
    } as never
  }

  function createRejectingActionRef(reason: unknown) {
    return {
      get __actionPath(): string {
        throw reason
      },
      __actionMethod: 'POST',
    } as never
  }

  it('maps a rejected action with an Error reason to a FETCH_ERROR carrying its message', async () => {
    mockNuxtFetch.mockResolvedValue({ success: true, data: { ok: true } })

    const { execute, errors, hasErrors } = useActions([
      createRejectingActionRef(new Error('resolve failed')),
      createActionRef('good'),
    ])

    const settled = await execute([{}, {}])

    expect(settled[0]).toEqual({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'resolve failed', statusCode: 0 },
    })
    expect(settled[1]).toEqual({ success: true, data: { ok: true } })
    expect(errors.value[0]).toEqual({ code: 'FETCH_ERROR', message: 'resolve failed', statusCode: 0 })
    expect(hasErrors.value).toBe(true)
  })

  it('defaults body and query to empty objects when inputs are missing', async () => {
    mockNuxtFetch.mockResolvedValue({ success: true, data: {} })

    const { execute } = useActions([
      createActionRef('create', 'POST'),
      createActionRef('list', 'GET'),
    ])

    await execute([])

    expect(mockNuxtFetch).toHaveBeenCalledWith('/api/_actions/create', expect.objectContaining({
      method: 'POST',
      body: {},
    }))
    expect(mockNuxtFetch).toHaveBeenCalledWith('/api/_actions/list', expect.objectContaining({
      method: 'GET',
      query: {},
    }))
  })

  it('maps a rejected action with a non-Error reason to "Unknown error"', async () => {
    const { execute } = useActions([createRejectingActionRef('broken reference')])

    const settled = await execute([{}])

    expect(settled[0]).toEqual({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Unknown error', statusCode: 0 },
    })
  })
})

describe('useOptimisticAction transform option', () => {
  it('stores the transformed data in both data and optimisticData', async () => {
    mockNuxtFetch.mockResolvedValue({ success: true, data: { count: 3 } })

    const current = ref({ count: 0 })
    const { execute, data, optimisticData } = useOptimisticAction<{ by: number }, { count: number }>('/api/counter', {
      currentData: current,
      updateFn: (input, currentData) => ({ count: currentData.count + input.by }),
      transform: serverData => ({ count: serverData.count * 2 }),
    })

    await execute({ by: 1 })

    expect(data.value).toEqual({ count: 6 })
    expect(optimisticData.value).toEqual({ count: 6 })
  })
})
