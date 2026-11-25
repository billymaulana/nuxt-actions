import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-actions v1.3 features', async () => {
  await setup({
    server: true,
  })

  // ── Idempotency ─────────────────────────────────────────────

  it('replays a duplicate payment instead of charging twice', async () => {
    const key = `e2e-${Date.now()}`
    const body = { amount: 100, recipient: 'Acme' }
    const headers = { 'Idempotency-Key': key }

    const first = await $fetch('/api/_actions/pay', { method: 'POST', body, headers })
    const second = await $fetch('/api/_actions/pay', { method: 'POST', body, headers })

    expect(first.success).toBe(true)
    expect(second).toEqual(first) // same txId — handler ran once
  })

  it('rejects the same key with a different amount', async () => {
    const key = `e2e-conflict-${Date.now()}`
    await $fetch('/api/_actions/pay', {
      method: 'POST',
      body: { amount: 100, recipient: 'Acme' },
      headers: { 'Idempotency-Key': key },
    })
    const conflict = await $fetch('/api/_actions/pay', {
      method: 'POST',
      body: { amount: 999, recipient: 'Acme' },
      headers: { 'Idempotency-Key': key },
    })

    expect(conflict.success).toBe(false)
    expect(conflict.error.code).toBe('IDEMPOTENCY_KEY_REUSE')
    expect(conflict.error.statusCode).toBe(422)
  })

  it('charges normally without an idempotency key', async () => {
    const r1 = await $fetch('/api/_actions/pay', { method: 'POST', body: { amount: 5, recipient: 'x' } })
    const r2 = await $fetch('/api/_actions/pay', { method: 'POST', body: { amount: 5, recipient: 'x' } })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect(r2.data.txId).not.toBe(r1.data.txId)
  })

  // ── Namespaced action (grouped #actions) ────────────────────

  it('routes a nested namespaced action', async () => {
    const res = await $fetch('/api/_actions/admin/metrics')
    expect(res.success).toBe(true)
    expect(res.data).toHaveProperty('activeUsers')
    expect(res.data).toHaveProperty('p95LatencyMs')
  })

  // ── Retry-on-503 flaky endpoint ─────────────────────────────

  it('flaky endpoint eventually succeeds (drives client retry/backoff)', async () => {
    // The handler fails twice then succeeds; hitting it 3x guarantees a success body.
    let lastSuccess: { success: boolean, data?: { attempt: number } } | undefined
    for (let i = 0; i < 3; i++) {
      const res = await $fetch('/api/_actions/flaky-api', {
        method: 'POST',
        body: { message: 'sync' },
        ignoreResponseError: true,
      }).catch((err: { data?: unknown }) => err.data ?? { success: false })
      if (res?.success) lastSuccess = res
    }
    expect(lastSuccess?.success).toBe(true)
  })
})
