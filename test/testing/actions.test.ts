import { afterEach, describe, it, expect, vi } from 'vitest'
import { createTestEvent, getTestResponse, runAction } from '../../src/runtime/testing'
import createTodo from './fixtures/create-todo.post'
import { charge, csrfProtected, limited, originChecked, refund } from './fixtures/guarded.post'
import { cachedTodos, missingTodo, siteName } from './fixtures/reads.get'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('nuxt-actions/testing with plain Vitest', () => {
  it('runs an action with input, headers, cookies, and context', async () => {
    const { result, headers, cookies } = await runAction(createTodo, {
      input: { title: 'Buy milk' },
      headers: { 'x-request-id': 'r1' },
      cookies: { locale: 'id' },
      context: { auth: { userId: 1 } },
    })

    expect(result).toEqual({ success: true, data: { title: 'Buy milk', userId: 1, locale: 'id' } })
    expect(headers['x-request-id']).toBe('r1')
    expect(cookies).toEqual({ 'last-todo': 'Buy milk' })
  })

  it('reports validation and middleware errors', async () => {
    const invalid = await runAction(createTodo, { input: { title: '' }, context: { auth: { userId: 1 } } })
    const anonymous = await runAction(createTodo, { input: { title: 'Buy milk' } })

    expect(invalid.result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR', statusCode: 422 } })
    expect(anonymous.result).toEqual({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in first', statusCode: 401 } })
  })

  it('runs an action as its route would, parsing the body', async () => {
    const event = createTestEvent({ body: { title: 'From the body' }, context: { auth: { userId: 2 } } })

    expect(await createTodo(event as never)).toEqual({ success: true, data: { title: 'From the body', userId: 2, locale: 'en' } })
    expect(getTestResponse(event).cookies).toEqual({ 'last-todo': 'From the body' })
  })

  it('tests rate limiting, including its headers', async () => {
    const first = await runAction(limited, { ip: '203.0.113.1' })
    const second = await runAction(limited, { ip: '203.0.113.1' })
    const otherClient = await runAction(limited, { ip: '203.0.113.2' })

    expect(first.result).toEqual({ success: true, data: 'ok' })
    expect(first.headers['ratelimit-remaining']).toBe('0')
    expect(second.result).toMatchObject({ success: false, error: { code: 'RATE_LIMIT', statusCode: 429, retryAfter: 60 } })
    expect(second.headers['retry-after']).toBe('60')
    expect(otherClient.result).toEqual({ success: true, data: 'ok' })
  })

  it('tests CSRF protection with the cookie from a first request', async () => {
    const page = await runAction(csrfProtected, { method: 'GET' })
    const token = page.cookies._csrf!

    const withoutHeader = await runAction(csrfProtected, { cookies: { _csrf: token } })
    const withHeader = await runAction(csrfProtected, { cookies: { _csrf: token }, headers: { 'x-csrf-token': token } })

    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(withoutHeader.result).toMatchObject({ success: false, error: { code: 'CSRF_ERROR', statusCode: 403 } })
    expect(withHeader.result).toEqual({ success: true, data: { token } })
  })

  it('keeps idempotency keys of different actions apart', async () => {
    const headers = { 'idempotency-key': 'order-1' }

    const charged = await runAction(charge, { headers })
    const refunded = await runAction(refund, { headers })
    const replayed = await runAction(charge, { headers })

    expect(charged.result).toEqual({ success: true, data: 'charged' })
    expect(refunded.result).toEqual({ success: true, data: 'refunded' })
    expect(replayed.result).toEqual({ success: true, data: 'charged' })
  })

  it('tests the origin check', async () => {
    const crossSite = await runAction(originChecked, { headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://evil.test' } })
    const sameHost = await runAction(originChecked, { headers: { host: 'app.test', origin: 'https://app.test' } })

    expect(crossSite.result).toMatchObject({ success: false, error: { code: 'CSRF_ERROR', statusCode: 403 } })
    expect(sameHost.result).toEqual({ success: true, data: 'ok' })
  })

  it('reports createError with its status', async () => {
    const { result } = await runAction(missingTodo, { method: 'GET' })

    expect(result).toEqual({ success: false, error: { code: 'SERVER_ERROR', message: 'Todo not found', statusCode: 404 } })
  })

  it('uses Nitro auto-imports the test stubs', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { siteName: 'Docs' } }))

    expect((await runAction(siteName, { method: 'GET' })).result).toEqual({ success: true, data: 'Docs' })
  })

  it('uses the server cache when the action path is given', async () => {
    const asUser = (userId: number) => runAction(cachedTodos, { method: 'GET', path: 'todos/cached', context: { userId } })

    const first = await asUser(1)
    const again = await asUser(1)
    const otherUser = await asUser(2)
    await invalidateActionCache('todos/cached', { key: '1' })
    const fresh = await asUser(1)
    const withoutPath = await runAction(cachedTodos, { method: 'GET', context: { userId: 2 } })

    expect(again.result).toEqual(first.result)
    expect(otherUser.result).toMatchObject({ data: { userId: 2 } })
    expect(fresh.result).not.toEqual(first.result)
    expect(withoutPath.result).not.toEqual(otherUser.result)
  })

  it('calls a middleware directly on a test event', async () => {
    const event = createTestEvent({ ip: '198.51.100.9' })
    const next = vi.fn(async () => ({}))

    await rateLimitMiddleware({ limit: 5, headers: true })({ event: event as never, ctx: {}, metadata: {}, next })

    expect(next).toHaveBeenCalledTimes(1)
    expect(getTestResponse(event).headers['ratelimit-remaining']).toBe('4')
  })
})
