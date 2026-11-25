import { describe, it, expect } from 'vitest'
import { setup, url } from '@nuxt/test-utils/e2e'

describe('nuxt-actions streaming', async () => {
  await setup({
    server: true,
  })

  it('stream action endpoint responds with event stream', async () => {
    const controller = new AbortController()
    const res = await fetch(url('/api/_actions/generate-text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }),
      signal: controller.signal,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    // Abort to prevent hanging on the stream body
    controller.abort()
  })

  it('stream action sends data chunks for valid prompt', async () => {
    const controller = new AbortController()
    const res = await fetch(url('/api/_actions/generate-text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }),
      signal: controller.signal,
    })
    expect(res.status).toBe(200)

    // Read first chunk to verify streaming works
    const reader = res.body!.getReader()
    const { done, value } = await reader.read()
    expect(done).toBe(false)

    const text = new TextDecoder().decode(value)
    // SSE format: data: {...}\n\n
    expect(text).toContain('data:')

    reader.releaseLock()
    controller.abort()
  })
})
