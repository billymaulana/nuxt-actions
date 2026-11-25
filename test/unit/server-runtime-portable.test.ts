import { describe, it, expect, vi } from 'vitest'
import {
  createEventStream,
  getRequestMethod,
  getRequestPath,
  readMultipartFormData,
  setHeader,
} from '../../src/runtime/server/internal/portable'
import type { ServerEvent } from '../../src/runtime/server/internal/portable'

interface EventInit {
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: BodyInit
  signal?: AbortSignal
}

function createEvent(init: EventInit = {}): ServerEvent {
  const url = new URL(init.url ?? 'http://localhost/api/_actions/demo')
  const req = new Request(url, {
    method: init.method ?? 'POST',
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  })
  return {
    req,
    url,
    res: { status: 200, statusText: '', headers: new Headers() },
    context: {},
  } as unknown as ServerEvent
}

function settlesWithin<T>(promise: Promise<T>, ms: number): Promise<'settled' | 'pending'> {
  return Promise.race([
    promise.then(() => 'settled' as const),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), ms)),
  ])
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

const MULTIPART_BOUNDARY = 'nuxt-actions-boundary'

function rawMultipart(parts: string[]): EventInit {
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${MULTIPART_BOUNDARY}` },
    body: [...parts.map(part => `--${MULTIPART_BOUNDARY}\r\n${part}`), `--${MULTIPART_BOUNDARY}--\r\n`].join('\r\n'),
  }
}

describe('portable server runtime', () => {
  describe('request and response helpers', () => {
    it('setHeader keeps the value case', () => {
      const event = createEvent()
      setHeader(event, 'X-Demo', 'MixedCase/Value')
      expect(event.res.headers.get('x-demo')).toBe('MixedCase/Value')
    })

    it('getRequestMethod returns the request method', () => {
      expect(getRequestMethod(createEvent({ method: 'PATCH' }))).toBe('PATCH')
    })

    it('getRequestPath returns the pathname without query', () => {
      const event = createEvent({ url: 'http://localhost/api/_actions/a?x=1&y=2' })
      expect(getRequestPath(event)).toBe('/api/_actions/a')
    })
  })

  describe('readMultipartFormData', () => {
    it('maps fields and files like h3', async () => {
      const form = new FormData()
      form.append('title', 'hello')
      form.append('avatar', new File([new Uint8Array([0, 159, 255])], 'a.png', { type: 'image/png' }))

      const parts = await readMultipartFormData(createEvent({ body: form }))

      expect(parts).toHaveLength(2)
      expect(parts[0]).toEqual({ name: 'title', data: Buffer.from('hello') })
      expect(Object.keys(parts[0]!)).not.toContain('filename')
      expect(parts[1]).toEqual({
        name: 'avatar',
        filename: 'a.png',
        type: 'image/png',
        data: Buffer.from([0, 159, 255]),
      })
      expect(Buffer.isBuffer(parts[1]!.data)).toBe(true)
    })

    it('decodes non-ASCII file names', async () => {
      const parts = await readMultipartFormData(createEvent(rawMultipart([
        'Content-Disposition: form-data; name="doc"; filename="héllo.txt"\r\nContent-Type: text/markdown\r\n\r\n# hi',
      ])))
      expect(parts[0]).toMatchObject({ name: 'doc', filename: 'héllo.txt', type: 'text/markdown' })
      expect(parts[0]!.data.toString('utf-8')).toBe('# hi')
    })

    it('leaves type undefined when the runtime reports an empty content type', async () => {
      const form = new FormData()
      form.append('blob', new File([new Uint8Array([1])], 'x.bin', { type: '' }))
      const event = createEvent()
      vi.spyOn(event.req, 'formData').mockResolvedValue(form)

      const parts = await readMultipartFormData(event)

      expect(parts).toEqual([{ name: 'blob', filename: 'x.bin', type: undefined, data: Buffer.from([1]) }])
    })

    it('keeps repeated field names in order', async () => {
      const form = new FormData()
      form.append('tag', 'a')
      form.append('tag', 'b')
      const parts = await readMultipartFormData(createEvent({ body: form }))
      expect(parts.map(part => [part.name, part.data.toString('utf-8')])).toEqual([['tag', 'a'], ['tag', 'b']])
    })

    it('returns no parts for an empty form', async () => {
      expect(await readMultipartFormData(createEvent({ body: new FormData() }))).toEqual([])
    })

    it('rejects a malformed multipart body', async () => {
      const event = createEvent({
        headers: { 'content-type': 'multipart/form-data; boundary=zz' },
        body: 'not multipart',
      })
      await expect(readMultipartFormData(event)).rejects.toThrow(TypeError)
    })
  })

  describe('createEventStream', () => {
    it('send() sets the response status to 200 like h3', async () => {
      const event = createEvent()
      event.res.status = 403
      const stream = createEventStream(event)

      stream.send()

      expect(event.res.status).toBe(200)
      await stream.close()
    })

    it('formats frames like h3', async () => {
      const stream = createEventStream(createEvent())
      const body = stream.send()
      await stream.push('{"a":1}')
      await stream.push('line1\nline2\r\nline3\rline4')
      await stream.close()
      expect(await readAll(body)).toBe('data: {"a":1}\n\ndata: line1\ndata: line2\ndata: line3\ndata: line4\n\n')
    })

    it('sets SSE response headers when sent', () => {
      const event = createEvent()
      createEventStream(event).send()
      expect(event.res.headers.get('content-type')).toBe('text/event-stream')
      expect(event.res.headers.get('cache-control')).toBe('private, no-cache, no-store, no-transform, must-revalidate, max-age=0')
      expect(event.res.headers.get('x-accel-buffering')).toBe('no')
    })

    it('push before send does not wait for a reader', async () => {
      const stream = createEventStream(createEvent())
      expect(await settlesWithin(stream.push('x'.repeat(200_000)), 200)).toBe('settled')
    })

    it('push after send waits while the queue is above the high-water mark and resumes on read', async () => {
      const stream = createEventStream(createEvent())
      const reader = stream.send().getReader()
      const pending = stream.push('x'.repeat(70 * 1024))

      expect(await settlesWithin(pending, 100)).toBe('pending')
      await reader.read()
      expect(await settlesWithin(pending, 500)).toBe('settled')
    })

    it('cancel resolves pending pushes and fires onClosed once', async () => {
      const stream = createEventStream(createEvent())
      const onClosed = vi.fn()
      stream.onClosed(onClosed)
      const reader = stream.send().getReader()
      const pending = stream.push('x'.repeat(70 * 1024))

      await reader.cancel()

      expect(await settlesWithin(pending, 500)).toBe('settled')
      await stream.close()
      await stream.push('ignored')
      expect(onClosed).toHaveBeenCalledTimes(1)
    })

    it('an already aborted request closes the stream immediately', async () => {
      const controller = new AbortController()
      controller.abort()
      const stream = createEventStream(createEvent({ signal: controller.signal }))
      const onClosed = vi.fn()
      stream.onClosed(onClosed)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(onClosed).toHaveBeenCalledTimes(1)
      expect(await readAll(stream.send())).toBe('')
    })

    it('aborting the request closes the stream and fires onClosed', async () => {
      const controller = new AbortController()
      const stream = createEventStream(createEvent({ signal: controller.signal }))
      const onClosed = vi.fn()
      stream.onClosed(onClosed)
      const body = stream.send()
      await stream.push('before')

      controller.abort()
      await stream.push('after')

      expect(onClosed).toHaveBeenCalledTimes(1)
      expect(await readAll(body)).toBe('data: before\n\n')
    })

    it('push after close is a no-op and close is idempotent', async () => {
      const stream = createEventStream(createEvent())
      const body = stream.send()
      await stream.push('one')
      await stream.close()
      await stream.close()
      await stream.push('two')
      expect(await readAll(body)).toBe('data: one\n\n')
    })
  })
})
