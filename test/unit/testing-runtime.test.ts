import { describe, it, expect, vi } from 'vitest'
import {
  createError,
  createEventStream,
  createTestEvent,
  defineEventHandler,
  deleteCookie,
  getCookie,
  getHeader,
  getHeaders,
  getQuery,
  getRequestHeader,
  getRequestHeaders,
  getRequestHost,
  getRequestIP,
  getRequestMethod,
  getRequestPath,
  getRequestURL,
  getTestResponse,
  parseCookies,
  readBody,
  readMultipartFormData,
  setCookie,
  setHeader,
  setResponseHeader,
  setResponseStatus,
} from '../../src/runtime/testing/runtime'

describe('createTestEvent', () => {
  it('defaults to a POST to / from 127.0.0.1 on localhost', async () => {
    const event = createTestEvent()

    expect(getRequestMethod(event)).toBe('POST')
    expect(getRequestPath(event)).toBe('/')
    expect(getRequestIP(event)).toBe('127.0.0.1')
    expect(getRequestHost(event)).toBe('localhost')
    expect(getQuery(event)).toEqual({})
    expect(await readBody(event)).toBeUndefined()
    expect(event.context).toEqual({})
  })

  it('reads the method, url, headers, query, body, and context', async () => {
    const context = { auth: { userId: 1 } }
    const event = createTestEvent({
      method: 'get',
      url: '/api/_actions/todos?page=2&tag=a&tag=b&tag=c',
      headers: { 'X-Trace': 'abc', 'host': 'example.test' },
      query: { sort: 'asc' },
      body: { ignored: true },
      context,
    })

    expect(event.method).toBe('GET')
    expect(event.path).toBe('/api/_actions/todos?page=2&tag=a&tag=b&tag=c')
    expect(getRequestPath(event)).toBe('/api/_actions/todos')
    expect(getHeader(event, 'x-trace')).toBe('abc')
    expect(getRequestHeader(event, 'X-TRACE')).toBe('abc')
    expect(event.headers.get('x-trace')).toBe('abc')
    expect(getHeaders(event)).toEqual({ 'x-trace': 'abc', 'host': 'example.test' })
    expect(getRequestHeaders(event)).toEqual(getHeaders(event))
    expect(getQuery(event)).toEqual({ page: '2', tag: ['a', 'b', 'c'], sort: 'asc' })
    expect(await readBody(event)).toEqual({ ignored: true })
    expect(event.context).toBe(context)
    expect(getRequestURL(event).href).toBe('http://example.test/api/_actions/todos?page=2&tag=a&tag=b&tag=c')
    expect(getHeader(event, 'x-missing')).toBeUndefined()
  })

  it('reads cookies from the cookies option and the cookie header', () => {
    const event = createTestEvent({ headers: { cookie: 'theme=dark; lang=id' }, cookies: { session: 'a b', lang: 'en' } })

    expect(getCookie(event, 'session')).toBe('a b')
    expect(getCookie(event, 'missing')).toBeUndefined()
    expect(parseCookies(event)).toEqual({ theme: 'dark', lang: 'en', session: 'a b' })
    expect(getHeader(event, 'cookie')).toBe('theme=dark; lang=en; session=a%20b')
  })

  it('returns copies, so changing them does not change the event', () => {
    const event = createTestEvent({ url: '/?page=2', cookies: { session: 'abc' } })
    setHeader(event, 'x-total', '3')

    getQuery(event).page = 'changed'
    parseCookies(event).session = 'changed'
    getTestResponse(event).headers['x-total'] = 'changed'
    getTestResponse(event).cookies.session = 'changed'

    expect(getQuery(event)).toEqual({ page: '2' })
    expect(parseCookies(event)).toEqual({ session: 'abc' })
    expect(getTestResponse(event)).toEqual({ status: 200, headers: { 'x-total': '3' }, cookies: {} })
  })

  it('skips malformed cookies and keeps values it cannot decode', () => {
    const event = createTestEvent({ headers: { cookie: 'theme=dark; broken; =x; bad=%E0%A4%A; token=a=b' } })

    expect(parseCookies(event)).toEqual({ theme: 'dark', bad: '%E0%A4%A', token: 'a=b' })
  })

  it('reads the client IP, trusting x-forwarded-for only when asked', () => {
    const event = createTestEvent({ ip: '10.0.0.1', headers: { 'x-forwarded-for': '203.0.113.7 , 10.0.0.2' } })

    expect(getRequestIP(event)).toBe('10.0.0.1')
    expect(getRequestIP(event, { xForwardedFor: true })).toBe('203.0.113.7')
    expect(getRequestIP(createTestEvent({ ip: '10.0.0.1' }), { xForwardedFor: true })).toBe('10.0.0.1')
    expect(getRequestIP(createTestEvent({ headers: { 'x-forwarded-for': ' 198.51.100.1 ' } }), { xForwardedFor: true })).toBe('198.51.100.1')
  })

  it('reads the host and protocol, trusting forwarded headers the way h3 does', () => {
    const event = createTestEvent({ headers: { 'host': 'app.test', 'x-forwarded-host': 'proxy.test', 'x-forwarded-proto': 'https' } })

    expect(getRequestHost(event)).toBe('app.test')
    expect(getRequestHost(event, { xForwardedHost: true })).toBe('proxy.test')
    expect(getRequestHost(createTestEvent({ headers: { host: 'app.test' } }), { xForwardedHost: true })).toBe('app.test')
    expect(getRequestURL(event).protocol).toBe('https:')
    expect(getRequestURL(event, { xForwardedProto: false }).protocol).toBe('http:')
    expect(getRequestURL(event, { xForwardedHost: true }).host).toBe('proxy.test')
  })

  it('reads multipart form data from a FormData body', async () => {
    const form = new FormData()
    form.append('title', 'Report')
    form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt')
    form.append('raw', new Blob(['x']), 'raw.bin')
    const event = createTestEvent({ body: form })

    expect(getHeader(event, 'content-type')).toMatch(/^multipart\/form-data/)
    const parts = await readMultipartFormData(event)
    expect(parts?.map(part => ({ ...part, data: part.data.toString() }))).toEqual([
      { name: 'title', data: 'Report' },
      { name: 'file', filename: 'hello.txt', type: 'text/plain', data: 'hello' },
      { name: 'raw', filename: 'raw.bin', type: undefined, data: 'x' },
    ])
  })

  it('keeps an explicit content type and has no multipart data without a FormData body', async () => {
    const event = createTestEvent({ body: new FormData(), headers: { 'content-type': 'multipart/form-data; boundary=x' } })

    expect(getHeader(event, 'content-type')).toBe('multipart/form-data; boundary=x')
    expect(await readMultipartFormData(createTestEvent({ body: { a: 1 } }))).toBeUndefined()
  })
})

describe('the response of a test event', () => {
  it('collects the status, headers, and cookies', () => {
    const event = createTestEvent()
    setHeader(event, 'X-Total', '3')
    setResponseHeader(event, 'x-tags', ['a', 'b'])
    setResponseHeader(event, 'x-count', 42)
    setResponseStatus(event, 201, 'Created')
    setCookie(event, 'session', 'abc', { httpOnly: true })
    setCookie(event, 'old', 'x')
    deleteCookie(event, 'old')

    expect(getTestResponse(event)).toEqual({
      status: 201,
      statusText: 'Created',
      headers: { 'x-total': '3', 'x-tags': 'a, b', 'x-count': '42' },
      cookies: { session: 'abc', old: '' },
    })
  })

  it('is a 200 with nothing set by default', () => {
    expect(getTestResponse(createTestEvent())).toEqual({ status: 200, headers: {}, cookies: {} })
  })

  it('keeps the status when setResponseStatus is called without one', () => {
    const event = createTestEvent()
    setResponseStatus(event)

    expect(getTestResponse(event).status).toBe(200)
  })

  it('rejects an object that is not a test event', () => {
    expect(() => getHeader({} as never, 'host')).toThrow(/createTestEvent/)
    expect(() => getTestResponse(null as never)).toThrow(/createTestEvent/)
  })
})

describe('createEventStream', () => {
  it('records pushed messages until it is closed', async () => {
    const event = createTestEvent()
    const stream = createEventStream(event)
    const closed = vi.fn()
    stream.onClosed(closed)

    expect(stream.send()).toBe(stream)
    await stream.push('one')
    await stream.close()
    await stream.push('late')
    await stream.close()

    expect(stream.messages).toEqual(['one'])
    expect(closed).toHaveBeenCalledTimes(1)
    expect(getTestResponse(event).headers['content-type']).toBe('text/event-stream')
  })

  it('calls onClosed soon after when it is already closed', async () => {
    const stream = createEventStream(createTestEvent())
    await stream.close()
    const closed = vi.fn()
    stream.onClosed(closed)

    expect(closed).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(closed).toHaveBeenCalledTimes(1)
  })
})

describe('h3 helpers', () => {
  it('defineEventHandler returns the handler', () => {
    const handler = () => 'ok'

    expect(defineEventHandler(handler)).toBe(handler)
  })

  it('createError makes an error that defineAction reports with its status', () => {
    const error = createError({ statusCode: 404, statusMessage: 'Not found', data: { id: 1 } })

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ statusCode: 404, statusMessage: 'Not found', message: 'Not found', data: { id: 1 } })
    expect(createError('Broken')).toMatchObject({ statusCode: 500, message: 'Broken' })
    expect(createError({ status: 409, statusText: 'Conflict', message: 'Taken' })).toMatchObject({ statusCode: 409, statusMessage: 'Conflict', message: 'Taken' })
    expect(createError({})).toMatchObject({ statusCode: 500, message: '' })
  })
})
