import { describe, it, expect } from 'vitest'
import { runAction } from 'nuxt-actions/testing'
import cachedReport from '../server/actions/cached-report.get'
import createValidatedTodo from '../server/actions/create-validated-todo.post'
import originProtected from '../server/actions/origin-protected.post'
import rateLimitedAction from '../server/actions/rate-limited-action.post'

describe('example actions under plain Vitest', () => {
  it('validates the input and rejects a duplicate title', async () => {
    const created = await runAction(createValidatedTodo, { input: { title: 'Read a book' } })
    const duplicate = await runAction(createValidatedTodo, { input: { title: 'Buy milk' } })

    expect(created.result).toMatchObject({ success: true, data: { title: 'Read a book', done: false } })
    expect(duplicate.result).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', fieldErrors: { title: ['This todo already exists'] } },
    })
  })

  it('limits each client to five requests and says when to retry', async () => {
    const send = () => runAction(rateLimitedAction, { input: { message: 'hi' }, ip: '203.0.113.10' })
    for (let request = 1; request < 5; request++) await send()

    const fifth = await send()
    const sixth = await send()

    expect(fifth.headers['ratelimit-remaining']).toBe('0')
    expect(sixth.result).toMatchObject({ success: false, error: { code: 'RATE_LIMIT', statusCode: 429 } })
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('rejects a cross-site post and accepts one from the same origin', async () => {
    const crossSite = await runAction(originProtected, {
      input: { note: 'forged' },
      headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://evil.example' },
    })
    const sameOrigin = await runAction(originProtected, {
      input: { note: 'saved' },
      headers: { 'sec-fetch-site': 'same-origin' },
    })

    expect(crossSite.result).toMatchObject({ success: false, error: { code: 'CSRF_ERROR', statusCode: 403 } })
    expect(sameOrigin.result).toMatchObject({ success: true, data: { saved: 'saved' } })
  })

  it('serves the report from the server cache after the first request', async () => {
    const first = await runAction(cachedReport, { method: 'GET', path: 'cached-report' })
    const second = await runAction(cachedReport, { method: 'GET', path: 'cached-report' })

    expect(first.result.success).toBe(true)
    expect(second.result).toEqual(first.result)
  })
})
