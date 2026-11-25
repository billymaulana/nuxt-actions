import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-actions (nitro-v3, dev server)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/nitro-v3', import.meta.url)),
    dev: true,
    setupTimeout: 600000,
  })

  it('runs an action on the dev server', async () => {
    const result = await $fetch('/api/_actions/inspect-body', { method: 'POST', body: { a: 1 } })
    expect(result).toEqual({ success: true, data: { input: { a: 1 } } })
  })

  it('aborting a stream aborts the handler signal', async () => {
    const before = await $fetch('/api/_actions/stream-probe')
    const controller = new AbortController()
    const response = await fetch('/api/_actions/stream-until-abort', {
      method: 'POST',
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    })
    await response.body!.getReader().read()

    controller.abort()

    await expect.poll(
      async () => (await $fetch('/api/_actions/stream-probe')).data.aborted,
      { timeout: 10_000, interval: 100 },
    ).toBe(before.data.aborted + 1)
  })
})
