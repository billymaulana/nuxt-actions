import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHeader, getRequestHost } from 'h3'
import { originMiddleware } from '../../src/runtime/server/utils/originMiddleware'

vi.mock('h3', () => ({
  getHeader: vi.fn(),
  getRequestHost: vi.fn(() => 'app.example.com'),
}))

function run(
  middleware: ReturnType<typeof originMiddleware>,
  { method = 'POST', headers = {} }: { method?: string, headers?: Record<string, string> } = {},
) {
  vi.mocked(getHeader).mockImplementation(((_event: unknown, name: string) => headers[name.toLowerCase()]) as never)
  const next = vi.fn(async () => ({}))
  const result = middleware({ event: { method }, ctx: {}, metadata: {}, next } as never)
  return { result, next }
}

const rejection = { code: 'CSRF_ERROR', message: 'Cross-origin request rejected', statusCode: 403 }

describe('originMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lets safe methods through without checking', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const { result, next } = run(originMiddleware(), { method, headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://evil.example' } })
      await result
      expect(next).toHaveBeenCalled()
    }
  })

  it('accepts a same-origin request', async () => {
    const { result, next } = run(originMiddleware(), { headers: { 'sec-fetch-site': 'same-origin', 'origin': 'https://app.example.com' } })
    await result
    expect(next).toHaveBeenCalled()
  })

  it('accepts a request the user started directly', async () => {
    const { result, next } = run(originMiddleware(), { headers: { 'sec-fetch-site': 'none' } })
    await result
    expect(next).toHaveBeenCalled()
  })

  it('rejects a cross-site request', async () => {
    const { result, next } = run(originMiddleware(), { headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://evil.example' } })
    await expect(result).rejects.toMatchObject(rejection)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a same-site request from another origin', async () => {
    const { result } = run(originMiddleware(), { headers: { 'sec-fetch-site': 'same-site', 'origin': 'https://admin.example.com' } })
    await expect(result).rejects.toMatchObject(rejection)
  })

  it('accepts an origin listed in allowedOrigins, ignoring case and a trailing slash', async () => {
    const middleware = originMiddleware({ allowedOrigins: ['https://Admin.Example.com/'] })
    const { result, next } = run(middleware, { headers: { 'sec-fetch-site': 'same-site', 'origin': 'https://admin.example.com' } })
    await result
    expect(next).toHaveBeenCalled()
  })

  it('rejects a cross-site request that sends no Origin', async () => {
    const { result } = run(originMiddleware(), { headers: { 'sec-fetch-site': 'cross-site' } })
    await expect(result).rejects.toMatchObject(rejection)
  })

  it('accepts an older browser whose Origin matches the request host', async () => {
    const { result, next } = run(originMiddleware(), { headers: { origin: 'https://app.example.com' } })
    await result
    expect(next).toHaveBeenCalled()
  })

  it('rejects a cross-site request even when the Origin host matches, such as an http page posting to https', async () => {
    const { result } = run(originMiddleware(), { headers: { 'sec-fetch-site': 'cross-site', 'origin': 'http://app.example.com' } })
    await expect(result).rejects.toMatchObject(rejection)
  })

  it('compares the request host without case', async () => {
    vi.mocked(getRequestHost).mockReturnValueOnce('App.Example.com')
    const { result, next } = run(originMiddleware(), { headers: { origin: 'https://app.example.com' } })
    await result
    expect(next).toHaveBeenCalled()
  })

  it('rejects an older browser whose Origin is another host', async () => {
    const { result } = run(originMiddleware(), { headers: { origin: 'https://evil.example' } })
    await expect(result).rejects.toMatchObject(rejection)
  })

  it('rejects a malformed Origin', async () => {
    const { result } = run(originMiddleware(), { headers: { origin: 'not a url' } })
    await expect(result).rejects.toMatchObject(rejection)
  })

  it('rejects Origin: null', async () => {
    const { result } = run(originMiddleware(), { headers: { origin: 'null' } })
    await expect(result).rejects.toMatchObject(rejection)
  })

  it('lets a request without Sec-Fetch-Site or Origin through by default', async () => {
    const { result, next } = run(originMiddleware())
    await result
    expect(next).toHaveBeenCalled()
  })

  it('rejects a request without Sec-Fetch-Site or Origin when requireOrigin is set', async () => {
    const { result } = run(originMiddleware({ requireOrigin: true }))
    await expect(result).rejects.toMatchObject(rejection)
  })

  it('checks PUT, PATCH, and DELETE and lower-case method names', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'post']) {
      const { result } = run(originMiddleware(), { method, headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://evil.example' } })
      await expect(result).rejects.toMatchObject(rejection)
    }
  })

  it('uses a custom message', async () => {
    const { result } = run(originMiddleware({ message: 'Not from here' }), { headers: { 'sec-fetch-site': 'cross-site' } })
    await expect(result).rejects.toMatchObject({ code: 'CSRF_ERROR', message: 'Not from here', statusCode: 403 })
  })
})
