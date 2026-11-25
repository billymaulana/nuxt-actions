import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { canTrackUploads, createProgressFetch } from '../../src/runtime/composables/_xhrFetch'
import { FakeXHR } from './helpers/fake-xhr'

beforeEach(() => {
  FakeXHR.instances = []
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canTrackUploads', () => {
  it('needs XMLHttpRequest', () => {
    expect(canTrackUploads()).toBe(true)
    vi.stubGlobal('XMLHttpRequest', undefined)
    expect(canTrackUploads()).toBe(false)
  })
})

describe('createProgressFetch', () => {
  it('sends the request through XMLHttpRequest and reports upload progress', async () => {
    const onProgress = vi.fn()
    const body = new FormData()
    const pending = createProgressFetch(onProgress)('/api/_actions/upload', {
      method: 'POST',
      headers: { 'x-token': 'abc' },
      body,
      credentials: 'include',
    })
    const xhr = FakeXHR.last!

    xhr.progress(50, 200)
    xhr.progress(133, 200)
    xhr.progress(200, 200)
    xhr.respond(201, '{"success":true}', 'Content-Type: application/json\r\nX-Request-Id: r1\r\n', 'Created')
    const response = await pending

    expect(xhr).toMatchObject({ method: 'POST', url: '/api/_actions/upload', headers: { 'x-token': 'abc' }, body, withCredentials: true, responseType: 'blob' })
    expect(onProgress.mock.calls.map(call => call[0])).toEqual([
      { loaded: 50, total: 200, percent: 25 },
      { loaded: 133, total: 200, percent: 67 },
      { loaded: 200, total: 200, percent: 100 },
    ])
    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(response.headers.get('x-request-id')).toBe('r1')
    expect(await response.json()).toEqual({ success: true })
  })

  it('reports an unknown size as null', () => {
    const onProgress = vi.fn()
    void createProgressFetch(onProgress)('/upload', { method: 'POST', body: 'x' })

    FakeXHR.last!.progress(10, 0, false)

    expect(onProgress).toHaveBeenCalledWith({ loaded: 10, total: null, percent: null })
  })

  it('defaults to GET with no body, and accepts a URL or a Request', async () => {
    const send = createProgressFetch(() => {})
    const fromUrl = send(new URL('https://api.test/a'))
    FakeXHR.last!.respond(200, '')
    const fromRequest = send(new Request('https://api.test/b'))
    FakeXHR.last!.respond(200, '')
    await Promise.all([fromUrl, fromRequest])

    expect(FakeXHR.instances.map(xhr => [xhr.method, xhr.url, xhr.body, xhr.withCredentials])).toEqual([
      ['GET', 'https://api.test/a', null, false],
      ['GET', 'https://api.test/b', null, false],
    ])
  })

  it('gives a response without a body to a 204', async () => {
    const pending = createProgressFetch(() => {})('/a', { method: 'DELETE' })
    FakeXHR.last!.respond(204, 'ignored')

    const response = await pending

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })

  it('rejects when the status cannot make a response', async () => {
    const pending = createProgressFetch(() => {})('/a')
    FakeXHR.last!.respond(999, '')

    await expect(pending).rejects.toThrow(RangeError)
  })

  it('skips response header lines it cannot read', async () => {
    const pending = createProgressFetch(() => {})('/a')
    FakeXHR.last!.respond(200, '', 'Content-Type: text/plain\r\nbroken\r\n: no-name\r\n')

    expect([...(await pending).headers]).toEqual([['content-type', 'text/plain']])
  })

  it('rejects with a TypeError on a network error or a timeout', async () => {
    const send = createProgressFetch(() => {})
    const failed = send('/a')
    FakeXHR.last!.fail()
    const timedOut = send('/b')
    FakeXHR.last!.timeOut()

    await expect(failed).rejects.toThrow(new TypeError('Network request failed'))
    await expect(timedOut).rejects.toThrow(new TypeError('Network request timed out'))
  })

  it('aborts the request and rejects with the reason of the signal', async () => {
    const send = createProgressFetch(() => {})
    const plain = new AbortController()
    const withReason = new AbortController()
    const first = send('/a', { signal: plain.signal })
    const second = send('/b', { signal: withReason.signal })
    const reason = new Error('Stopped')

    plain.abort()
    withReason.abort(reason)

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).rejects.toBe(reason)
    expect(FakeXHR.instances.map(xhr => xhr.aborted)).toEqual([true, true])
  })

  it('rejects at once without sending when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(createProgressFetch(() => {})('/a', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeXHR.instances).toEqual([])
  })

  it('stops listening to the signal once the request is done', async () => {
    const controller = new AbortController()
    const pending = createProgressFetch(() => {})('/a', { signal: controller.signal })
    FakeXHR.last!.respond(200, '')
    await pending

    controller.abort()

    expect(FakeXHR.last!.aborted).toBe(false)
  })
})
