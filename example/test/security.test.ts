import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-actions CSRF protection', async () => {
  await setup({
    server: true,
  })

  async function issueToken() {
    const response = await fetch('/api/_actions/csrf-token')
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('_csrf='))
    expect(cookie).toBeDefined()
    return cookie!
  }

  it('issues a token cookie that client code can read', async () => {
    const cookie = await issueToken()
    expect(cookie.toLowerCase()).not.toContain('httponly')
    expect(cookie.split(';')[0]).toMatch(/^_csrf=[a-f0-9]{64}$/)
  })

  it('saves a note when the header carries the token', async () => {
    const token = (await issueToken()).split(';')[0]!.slice('_csrf='.length)
    const result = await $fetch('/api/_actions/protected-note', {
      method: 'POST',
      body: { note: 'Hello' },
      headers: { 'cookie': `_csrf=${token}`, 'x-csrf-token': token },
    })
    expect(result.success).toBe(true)
    expect(result.data.saved).toBe('Hello')
  })

  it('rejects a note sent without the header', async () => {
    const token = (await issueToken()).split(';')[0]!.slice('_csrf='.length)
    const result = await $fetch('/api/_actions/protected-note', {
      method: 'POST',
      body: { note: 'Hello' },
      headers: { cookie: `_csrf=${token}` },
    })
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('CSRF_ERROR')
    expect(result.error.statusCode).toBe(403)
  })
})
