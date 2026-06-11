import { ref, nextTick } from 'vue'
import { useStreamActionQuery } from '../../src/runtime/composables/useStreamActionQuery'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStreamExecute = vi.fn()
const mockStreamStop = vi.fn()
const mockStreamStatus = ref<string>('idle')

vi.mock('../../src/runtime/composables/useStreamAction', () => ({
  useStreamAction: () => ({
    execute: mockStreamExecute,
    stop: mockStreamStop,
    chunks: ref([]),
    data: ref(null),
    status: mockStreamStatus,
    error: ref(null),
  }),
}))

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

describe('useStreamActionQuery status mirroring and cache fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStreamStatus.value = 'idle'
    Object.keys(payloadData).forEach(key => Reflect.deleteProperty(payloadData, key))
  })

  it('mirrors only streaming transitions from the underlying stream status', async () => {
    const { status } = useStreamActionQuery(createActionRef('generate'))

    expect(status.value).toBe('idle')

    mockStreamStatus.value = 'streaming'
    await nextTick()
    expect(status.value).toBe('streaming')

    mockStreamStatus.value = 'idle'
    await nextTick()
    expect(status.value).toBe('streaming')
  })

  it('restores null data when the cached final chunk is null', () => {
    payloadData['stream:null-tail'] = [null]

    const { chunks, data, status, fromCache } = useStreamActionQuery(
      createActionRef('generate'),
      { cacheKey: 'null-tail' },
    )

    expect(chunks.value).toEqual([null])
    expect(data.value).toBeNull()
    expect(status.value).toBe('done')
    expect(fromCache.value).toBe(true)
  })
})
