import { onScopeDispose } from 'vue'
import { useStreamAction } from '../../src/runtime/composables/useStreamAction'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock onScopeDispose (Vue's lifecycle hook)
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onScopeDispose: vi.fn(),
  }
})

// Mock #app — provide useNuxtApp and useRequestURL
vi.mock('#app', () => ({
  useNuxtApp: () => ({
    ssrContext: null,
  }),
  useRequestURL: () => new URL('http://localhost:3000'),
}))

// Mock global fetch for SSE
const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

function createActionRef(path: string, method = 'GET') {
  return {
    __actionPath: path,
    __actionMethod: method,
    _types: {} as { readonly input: unknown, readonly output: unknown },
  } as never
}

/**
 * Helper to create a mock ReadableStream that yields SSE data lines.
 */
function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index] + '\n'))
        index++
      }
      else {
        controller.close()
      }
    },
  })
}

describe('useStreamAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('initial state', () => {
    it('starts with idle state', () => {
      const { chunks, data, status, error } = useStreamAction(createActionRef('stream'))
      expect(chunks.value).toEqual([])
      expect(data.value).toBeNull()
      expect(status.value).toBe('idle')
      expect(error.value).toBeNull()
    })
  })

  describe('streaming', () => {
    it('receives chunks and updates reactive state', async () => {
      const stream = createSSEStream([
        'data: {"text":"hello"}',
        'data: {"text":"world"}',
        'data: {"__actions_done":true}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const onChunk = vi.fn()
      const onDone = vi.fn()

      const { execute, chunks, data, status } = useStreamAction(
        createActionRef('stream'),
        { onChunk, onDone },
      )

      await execute({})

      expect(status.value).toBe('done')
      expect(chunks.value).toEqual([
        { text: 'hello' },
        { text: 'world' },
      ])
      expect(data.value).toEqual({ text: 'world' }) // last chunk
      expect(onChunk).toHaveBeenCalledTimes(2)
      expect(onChunk).toHaveBeenCalledWith({ text: 'hello' })
      expect(onChunk).toHaveBeenCalledWith({ text: 'world' })
      expect(onDone).toHaveBeenCalledWith([
        { text: 'hello' },
        { text: 'world' },
      ])
    })

    it('handles stream error event', async () => {
      const stream = createSSEStream([
        'data: {"text":"partial"}',
        'data: {"__actions_error":{"code":"STREAM_ERROR","message":"Handler failed","statusCode":500}}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const onError = vi.fn()

      const { execute, status, error } = useStreamAction(
        createActionRef('stream'),
        { onError },
      )

      await execute({})

      expect(status.value).toBe('error')
      expect(error.value).toEqual({
        code: 'STREAM_ERROR',
        message: 'Handler failed',
        statusCode: 500,
      })
      expect(onError).toHaveBeenCalled()
    })

    it('handles HTTP error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: null,
      })

      const onError = vi.fn()

      const { execute, status, error } = useStreamAction(
        createActionRef('stream'),
        { onError },
      )

      await execute({})

      expect(status.value).toBe('error')
      expect(error.value).toMatchObject({
        code: 'STREAM_ERROR',
        statusCode: 500,
      })
      expect(onError).toHaveBeenCalled()
    })

    it('handles stream that ends without done event', async () => {
      const stream = createSSEStream([
        'data: {"text":"chunk1"}',
        'data: {"text":"chunk2"}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, chunks, status } = useStreamAction(createActionRef('stream'))

      await execute({})

      expect(status.value).toBe('done')
      expect(chunks.value).toHaveLength(2)
    })

    it('handles network error during fetch', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

      const onError = vi.fn()

      const { execute, status, error } = useStreamAction(
        createActionRef('stream'),
        { onError },
      )

      await execute({})

      expect(status.value).toBe('error')
      expect(error.value).toMatchObject({
        code: 'STREAM_ERROR',
        message: 'Failed to fetch',
        statusCode: 500,
      })
      expect(onError).toHaveBeenCalled()
    })

    it('handles non-Error thrown during fetch', async () => {
      mockFetch.mockRejectedValue('string error')

      const onError = vi.fn()

      const { execute, status, error } = useStreamAction(
        createActionRef('stream'),
        { onError },
      )

      await execute({})

      expect(status.value).toBe('error')
      expect(error.value).toMatchObject({
        code: 'STREAM_ERROR',
        message: 'Stream connection failed',
        statusCode: 500,
      })
    })
  })

  describe('URL building', () => {
    it('builds URL for typed reference', async () => {
      const stream = createSSEStream(['data: {"__actions_done":true}'])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction(createActionRef('ai-generate'))
      await execute({})

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/_actions/ai-generate',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('builds URL for string path with POST', async () => {
      const stream = createSSEStream(['data: {"__actions_done":true}'])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction('/api/stream')
      await execute({ prompt: 'hello' })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/stream',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ prompt: 'hello' }),
        }),
      )
    })

    it('handles GET with null input (no query params)', async () => {
      const stream = createSSEStream(['data: {"__actions_done":true}'])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction(createActionRef('search', 'GET'))
      await execute(null)

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toBe('/api/_actions/search')
      expect(calledUrl).not.toContain('?')
    })

    it('handles POST with null input', async () => {
      const stream = createSSEStream(['data: {"__actions_done":true}'])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction('/api/stream')
      await execute(null)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/stream',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        }),
      )
    })

    it('appends query params for GET method', async () => {
      const stream = createSSEStream(['data: {"__actions_done":true}'])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction(createActionRef('search', 'GET'))
      await execute({ q: 'test', limit: 10 })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('q=test')
      expect(calledUrl).toContain('limit=10')
    })

    it('serializes object values as JSON in GET query params', async () => {
      const stream = createSSEStream(['data: {"__actions_done":true}'])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction(createActionRef('search', 'GET'))
      await execute({ filter: { status: 'active' }, tags: ['a', 'b'] })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('filter=' + encodeURIComponent('{"status":"active"}'))
      expect(calledUrl).toContain('tags=' + encodeURIComponent('["a","b"]'))
    })

    it('handles null and undefined values in GET query params', async () => {
      const stream = createSSEStream(['data: {"__actions_done":true}'])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction(createActionRef('search', 'GET'))
      await execute({ q: 'test', empty: null, undef: undefined })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('q=test')
      // null is an object but with value null — should use String(null ?? '') = ''
      expect(calledUrl).toContain('empty=')
      // undefined — should use String(undefined ?? '') = ''
      expect(calledUrl).toContain('undef=')
    })
  })

  describe('stop', () => {
    it('does nothing when called before execute (idle)', () => {
      const { stop, status } = useStreamAction(createActionRef('stream'))

      expect(() => stop()).not.toThrow()
      expect(status.value).toBe('idle')
    })

    it('sets status to done when called during active streaming', async () => {
      // Create a stream with external close control
      const encoder = new TextEncoder()
      let closeStream: () => void

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"text":"hello"}\n'))
          // Store close function — don't close yet
          closeStream = () => controller.close()
        },
      })

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, stop, status, chunks } = useStreamAction(createActionRef('stream'))

      const executePromise = execute({})
      await new Promise(r => setTimeout(r, 50))

      expect(status.value).toBe('streaming')
      expect(chunks.value).toEqual([{ text: 'hello' }])

      // Stop mid-stream — sets status to 'done'
      stop()
      // Close the underlying stream so reader.read() resolves
      closeStream!()

      await executePromise

      expect(status.value).toBe('done')
    })

    it('abort on new execute clears state', async () => {
      const stream1 = createSSEStream([
        'data: {"n":1}',
        'data: {"__actions_done":true}',
      ])
      const stream2 = createSSEStream([
        'data: {"n":2}',
        'data: {"__actions_done":true}',
      ])

      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', body: stream1 })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', body: stream2 })

      const { execute, chunks, status } = useStreamAction(createActionRef('stream'))

      await execute({})
      expect(chunks.value).toEqual([{ n: 1 }])
      expect(status.value).toBe('done')

      // Second execute should reset state
      await execute({})
      expect(chunks.value).toEqual([{ n: 2 }])
      expect(status.value).toBe('done')
    })
  })

  describe('new execute resets state', () => {
    it('clears previous chunks on new execute', async () => {
      const stream1 = createSSEStream([
        'data: {"n":1}',
        'data: {"__actions_done":true}',
      ])
      const stream2 = createSSEStream([
        'data: {"n":2}',
        'data: {"__actions_done":true}',
      ])

      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', body: stream1 })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', body: stream2 })

      const { execute, chunks } = useStreamAction(createActionRef('stream'))

      await execute({})
      expect(chunks.value).toEqual([{ n: 1 }])

      await execute({})
      expect(chunks.value).toEqual([{ n: 2 }])
    })
  })

  describe('SSE parsing', () => {
    it('skips comment lines', async () => {
      const stream = createSSEStream([
        ': this is a comment',
        'data: {"text":"actual"}',
        'data: {"__actions_done":true}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, chunks } = useStreamAction(createActionRef('stream'))
      await execute({})

      expect(chunks.value).toEqual([{ text: 'actual' }])
    })

    it('skips empty lines', async () => {
      const stream = createSSEStream([
        '',
        'data: {"text":"data"}',
        '',
        'data: {"__actions_done":true}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, chunks } = useStreamAction(createActionRef('stream'))
      await execute({})

      expect(chunks.value).toEqual([{ text: 'data' }])
    })

    it('handles data: prefix with and without space', async () => {
      const stream = createSSEStream([
        'data:{"noSpace":true}',
        'data: {"withSpace":true}',
        'data: {"__actions_done":true}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, chunks } = useStreamAction(createActionRef('stream'))
      await execute({})

      expect(chunks.value).toEqual([
        { noSpace: true },
        { withSpace: true },
      ])
    })

    it('skips non-data lines (event type, id, retry)', async () => {
      const stream = createSSEStream([
        'event: message',
        'id: 123',
        'retry: 5000',
        'data: {"text":"actual"}',
        'data: {"__actions_done":true}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, chunks } = useStreamAction(createActionRef('stream'))
      await execute({})

      expect(chunks.value).toEqual([{ text: 'actual' }])
    })

    it('skips non-JSON data lines gracefully', async () => {
      const stream = createSSEStream([
        'data: not valid json',
        'data: {"text":"valid"}',
        'data: {"__actions_done":true}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, chunks } = useStreamAction(createActionRef('stream'))
      await execute({})

      expect(chunks.value).toEqual([{ text: 'valid' }])
    })
  })

  describe('scope cleanup', () => {
    it('registers onScopeDispose and cleans up on dispose', () => {
      const mockedDispose = vi.mocked(onScopeDispose)
      mockedDispose.mockClear()

      useStreamAction(createActionRef('stream'))

      expect(mockedDispose).toHaveBeenCalledOnce()
      const disposeCallback = mockedDispose.mock.calls[0][0] as () => void

      // Invoking the dispose callback should not throw
      expect(() => disposeCallback()).not.toThrow()
    })

    it('aborts active stream on scope dispose', async () => {
      const mockedDispose = vi.mocked(onScopeDispose)
      mockedDispose.mockClear()

      const encoder = new TextEncoder()
      let closeStream: () => void

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"n":1}\n'))
          closeStream = () => controller.close()
        },
      })

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, status } = useStreamAction(createActionRef('stream'))

      const promise = execute({})
      await new Promise(r => setTimeout(r, 50))

      expect(status.value).toBe('streaming')

      // Simulate scope dispose (component unmount)
      const disposeCallback = mockedDispose.mock.calls[0][0] as () => void
      disposeCallback()
      // Close stream so reader resolves
      closeStream!()

      await promise

      // Stream ended normally after dispose — "stream ended without done" sets status
      expect(status.value).toBe('done')
    })
  })

  describe('AbortError handling', () => {
    it('handles AbortError gracefully when streaming', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      mockFetch.mockRejectedValue(abortError)

      const { execute, status } = useStreamAction(createActionRef('stream'))
      await execute({})

      // AbortError should set to done, not error
      expect(status.value).toBe('done')
    })

    it('does not override status when stop() already set it to done', async () => {
      // Create a stream whose reader rejects with AbortError when the fetch signal fires
      const encoder = new TextEncoder()
      mockFetch.mockImplementation(async (_url: string, opts: RequestInit) => {
        const signal = opts.signal!
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"text":"hello"}\n'))
          },
          pull() {
            // Wait for abort signal, then reject with AbortError (simulates browser behavior)
            return new Promise<void>((_, reject) => {
              if (signal.aborted) {
                reject(new DOMException('The operation was aborted', 'AbortError'))
                return
              }
              signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted', 'AbortError'))
              })
            })
          },
        })
        return { ok: true, status: 200, statusText: 'OK', body: stream }
      })

      const { execute, stop, status, chunks } = useStreamAction(createActionRef('stream'))

      const executePromise = execute({})
      await new Promise(r => setTimeout(r, 50))

      expect(status.value).toBe('streaming')
      expect(chunks.value).toEqual([{ text: 'hello' }])

      // stop() sets status to 'done' THEN aborts → reader throws AbortError
      // In catch: status is 'done' (not 'streaming'), so the if-branch is false
      stop()

      await executePromise

      expect(status.value).toBe('done')
    })
  })

  describe('rapid stop→execute race condition', () => {
    it('prevents stale catch from corrupting new execution state', async () => {
      const encoder = new TextEncoder()

      // First execute: will be stopped, its AbortError catch should be a no-op
      const firstStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"n":1}\n'))
        },
        pull(_controller) {
          // Block until abort — simulates a long-lived SSE connection
          return new Promise<void>(() => {
            // Never resolve — will be cancelled by abort
          })
        },
        cancel() {
          // Called when the stream is aborted
        },
      })

      // Second execute: controllable stream that stays open
      let secondStreamEnqueue: (data: string) => void
      let secondStreamClose: () => void
      const secondStream = new ReadableStream<Uint8Array>({
        start(controller) {
          secondStreamEnqueue = (data: string) => controller.enqueue(encoder.encode(data + '\n'))
          secondStreamClose = () => controller.close()
        },
      })

      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', body: firstStream })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', body: secondStream })

      const { execute, stop, status, chunks } = useStreamAction(createActionRef('stream'))

      // Start first execution (don't await — it'll be cancelled)
      execute({})
      await new Promise(r => setTimeout(r, 30))
      expect(status.value).toBe('streaming')

      // stop() then immediately execute() — the race condition scenario
      stop()
      expect(status.value).toBe('done')

      // Second execute sets streaming again
      const secondPromise = execute({})
      await new Promise(r => setTimeout(r, 30))
      expect(status.value).toBe('streaming')

      // First stream was aborted by stop() + new execute(). Its catch is stale.
      // Give it a tick to settle
      await new Promise(r => setTimeout(r, 10))

      // First stream's stale catch should be a no-op because executionId changed
      expect(status.value).toBe('streaming')

      // Now complete second stream
      secondStreamEnqueue!('data: {"n":2}')
      secondStreamEnqueue!('data: {"__actions_done":true}')
      secondStreamClose!()
      await secondPromise

      expect(status.value).toBe('done')
      expect(chunks.value).toEqual([{ n: 2 }])
    })
  })

  describe('headers option', () => {
    it('merges static headers with default Accept header', async () => {
      const stream = createSSEStream([
        'data: {"text":"hello"}',
        'data: {"__actions_done":true}',
      ])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction(createActionRef('stream'), {
        headers: { Authorization: 'Bearer token123' },
      })

      await execute({})

      const fetchCall = mockFetch.mock.calls[0]
      const init = fetchCall[1] as RequestInit
      expect(init.headers).toEqual(expect.objectContaining({
        Accept: 'text/event-stream',
        Authorization: 'Bearer token123',
      }))
    })

    it('merges function-returned headers', async () => {
      const stream = createSSEStream([
        'data: {"__actions_done":true}',
      ])
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute } = useStreamAction(createActionRef('stream'), {
        headers: () => ({ 'X-Custom': 'value' }),
      })

      await execute({})

      const fetchCall = mockFetch.mock.calls[0]
      const init = fetchCall[1] as RequestInit
      expect(init.headers).toEqual(expect.objectContaining({
        'Accept': 'text/event-stream',
        'X-Custom': 'value',
      }))
    })
  })

  describe('namespaced control messages', () => {
    it('does not intercept user data with __done or __error keys', async () => {
      // User data can contain keys like __done or __error without triggering stream control
      const stream = createSSEStream([
        'data: {"__done":true,"value":"user data"}',
        'data: {"__error":{"code":"USER"},"info":"not a control message"}',
        'data: {"__actions_done":true}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const { execute, chunks, status } = useStreamAction(createActionRef('stream'))
      await execute({})

      expect(status.value).toBe('done')
      // Old-style keys are treated as regular data chunks
      expect(chunks.value).toEqual([
        { __done: true, value: 'user data' },
        { __error: { code: 'USER' }, info: 'not a control message' },
      ])
    })

    it('handles namespaced error control message', async () => {
      const stream = createSSEStream([
        'data: {"text":"partial"}',
        'data: {"__actions_error":{"code":"STREAM_ERROR","message":"Handler failed","statusCode":500}}',
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: stream,
      })

      const onError = vi.fn()
      const { execute, status, error, chunks } = useStreamAction(
        createActionRef('stream'),
        { onError },
      )

      await execute({})

      expect(status.value).toBe('error')
      expect(error.value).toEqual({
        code: 'STREAM_ERROR',
        message: 'Handler failed',
        statusCode: 500,
      })
      expect(chunks.value).toEqual([{ text: 'partial' }])
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('timeout option', () => {
    it('handles TimeoutError with correct error payload', async () => {
      const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      mockFetch.mockRejectedValue(timeoutError)

      const onError = vi.fn()
      const { execute, status, error } = useStreamAction(createActionRef('stream'), {
        timeout: 5000,
        onError,
      })

      await execute({})

      expect(status.value).toBe('error')
      expect(error.value).toEqual({
        code: 'TIMEOUT_ERROR',
        message: 'Stream connection timed out after 5000ms',
        statusCode: 408,
      })
      expect(onError).toHaveBeenCalledWith(error.value)
    })
  })
})
