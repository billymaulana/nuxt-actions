import { useStreamActionQuery } from '../../src/runtime/composables/useStreamActionQuery'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// Track the options that useStreamAction receives
let capturedStreamOptions: Record<string, unknown> = {}

const mockStreamExecute = vi.fn()
const mockStreamStop = vi.fn()
const mockStreamStatus = ref<string>('idle')

vi.mock('../../src/runtime/composables/useStreamAction', () => ({
  useStreamAction: (_pathOrAction: unknown, options: Record<string, unknown>) => {
    capturedStreamOptions = options
    return {
      execute: mockStreamExecute,
      stop: mockStreamStop,
      chunks: ref([]),
      data: ref(null),
      status: mockStreamStatus,
      error: ref(null),
    }
  },
}))

// Mock payload data store
const payloadData: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useNuxtApp: () => ({
    payload: { data: payloadData },
  }),
}))

function createActionRef(path: string, method = 'POST') {
  return {
    __actionPath: path,
    __actionMethod: method,
    _types: {} as { readonly input: unknown, readonly output: unknown },
  } as never
}

describe('useStreamActionQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedStreamOptions = {}
    mockStreamStatus.value = 'idle'
    // Clear payload data
    for (const key of Object.keys(payloadData)) delete payloadData[key]
  })

  describe('wraps useStreamAction', () => {
    it('delegates execute to useStreamAction', async () => {
      const { execute } = useStreamActionQuery(createActionRef('generate'))

      await execute({ prompt: 'hello' })

      expect(mockStreamExecute).toHaveBeenCalledWith({ prompt: 'hello' })
    })

    it('exposes stop from useStreamAction', () => {
      const { stop } = useStreamActionQuery(createActionRef('generate'))

      stop()

      expect(mockStreamStop).toHaveBeenCalled()
    })

    it('starts with idle status and empty chunks', () => {
      const { status, chunks, data, fromCache } = useStreamActionQuery(createActionRef('generate'))

      expect(status.value).toBe('idle')
      expect(chunks.value).toEqual([])
      expect(data.value).toBeNull()
      expect(fromCache.value).toBe(false)
    })
  })

  describe('cache restoration from payload.data', () => {
    it('restores chunks from cache on mount', () => {
      const cacheKey = 'stream:test-cache'
      payloadData[cacheKey] = [{ text: 'cached-1' }, { text: 'cached-2' }]

      const { chunks, data, status, fromCache } = useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'test-cache' },
      )

      expect(chunks.value).toEqual([{ text: 'cached-1' }, { text: 'cached-2' }])
      expect(data.value).toEqual({ text: 'cached-2' })
      expect(status.value).toBe('done')
      expect(fromCache.value).toBe(true)
    })

    it('does not restore from empty cache', () => {
      const { chunks, fromCache, status } = useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'empty-cache' },
      )

      expect(chunks.value).toEqual([])
      expect(fromCache.value).toBe(false)
      expect(status.value).toBe('idle')
    })

    it('does not restore from empty array cache', () => {
      const cacheKey = 'stream:empty-arr'
      payloadData[cacheKey] = []

      const { fromCache, status } = useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'empty-arr' },
      )

      expect(fromCache.value).toBe(false)
      expect(status.value).toBe('idle')
    })
  })

  describe('fromCache ref', () => {
    it('is true when restored from cache', () => {
      const cacheKey = 'stream:from-cache'
      payloadData[cacheKey] = [{ text: 'hello' }]

      const { fromCache } = useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'from-cache' },
      )

      expect(fromCache.value).toBe(true)
    })

    it('is false initially when no cache exists', () => {
      const { fromCache } = useStreamActionQuery(createActionRef('generate'))

      expect(fromCache.value).toBe(false)
    })

    it('resets to false on execute', async () => {
      const cacheKey = 'stream:reset-test'
      payloadData[cacheKey] = [{ text: 'cached' }]

      const { fromCache, execute } = useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'reset-test' },
      )

      expect(fromCache.value).toBe(true)

      await execute({ prompt: 'new' })

      expect(fromCache.value).toBe(false)
    })
  })

  describe('clearCache', () => {
    it('removes cached data from payload', () => {
      const cacheKey = 'stream:clear-test'
      payloadData[cacheKey] = [{ text: 'cached' }]

      const { clearCache, fromCache } = useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'clear-test' },
      )

      expect(fromCache.value).toBe(true)

      clearCache()

      expect(payloadData[cacheKey]).toBeUndefined()
      expect(fromCache.value).toBe(false)
    })
  })

  describe('onChunk callback integration', () => {
    it('intercepts onChunk to sync managed chunks ref', () => {
      const userOnChunk = vi.fn()
      useStreamActionQuery(
        createActionRef('generate'),
        { onChunk: userOnChunk },
      )

      // Simulate the wrapped onChunk being called
      const wrappedOnChunk = capturedStreamOptions.onChunk as (chunk: unknown) => void
      expect(wrappedOnChunk).toBeDefined()

      wrappedOnChunk({ text: 'hello' })

      expect(userOnChunk).toHaveBeenCalledWith({ text: 'hello' })
    })

    it('intercepts onDone to cache completed chunks', () => {
      const userOnDone = vi.fn()
      useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'done-test', onDone: userOnDone },
      )

      const wrappedOnDone = capturedStreamOptions.onDone as (allChunks: unknown[]) => void
      wrappedOnDone([{ text: 'a' }, { text: 'b' }])

      expect(payloadData['stream:done-test']).toEqual([{ text: 'a' }, { text: 'b' }])
      expect(userOnDone).toHaveBeenCalledWith([{ text: 'a' }, { text: 'b' }])
    })

    it('intercepts onError to set error state', () => {
      const userOnError = vi.fn()
      const { error, status } = useStreamActionQuery(
        createActionRef('generate'),
        { onError: userOnError },
      )

      const wrappedOnError = capturedStreamOptions.onError as (err: unknown) => void
      const actionError = { code: 'STREAM_ERROR', message: 'fail', statusCode: 500 }
      wrappedOnError(actionError)

      expect(error.value).toEqual(actionError)
      expect(status.value).toBe('error')
      expect(userOnError).toHaveBeenCalledWith(actionError)
    })
  })

  describe('cache key generation', () => {
    it('uses explicit cacheKey when provided', () => {
      const cacheKey = 'stream:my-key'
      payloadData[cacheKey] = [{ text: 'test' }]

      const { fromCache } = useStreamActionQuery(
        createActionRef('generate'),
        { cacheKey: 'my-key' },
      )

      expect(fromCache.value).toBe(true)
    })

    it('derives cache key from action path when cacheKey is not provided', () => {
      const derivedKey = 'stream:/api/_actions/generate:{}'
      payloadData[derivedKey] = [{ text: 'test' }]

      const { fromCache } = useStreamActionQuery(createActionRef('generate'))

      expect(fromCache.value).toBe(true)
    })

    it('derives cache key from string path', () => {
      const derivedKey = 'stream:/api/stream/test:{}'
      payloadData[derivedKey] = [{ text: 'test' }]

      const { fromCache } = useStreamActionQuery('/api/stream/test' as never)

      expect(fromCache.value).toBe(true)
    })
  })
})
