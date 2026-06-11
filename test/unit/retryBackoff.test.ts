import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeRetryDelay, buildFetchOptions } from '../../src/runtime/composables/_utils'

describe('computeRetryDelay', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the base delay for fixed backoff (default)', () => {
    expect(computeRetryDelay({ delay: 500 }, 1)).toBe(500)
    expect(computeRetryDelay({ delay: 500 }, 3)).toBe(500)
    expect(computeRetryDelay({ delay: 500, backoff: 'fixed' }, 5)).toBe(500)
  })

  it('defaults the base delay to 500ms', () => {
    expect(computeRetryDelay({}, 1)).toBe(500)
  })

  it('doubles per attempt for exponential backoff', () => {
    const config = { delay: 100, backoff: 'exponential' as const }
    expect(computeRetryDelay(config, 1)).toBe(100)
    expect(computeRetryDelay(config, 2)).toBe(200)
    expect(computeRetryDelay(config, 3)).toBe(400)
    expect(computeRetryDelay(config, 4)).toBe(800)
  })

  it('grows arithmetically for linear backoff', () => {
    const config = { delay: 100, backoff: 'linear' as const }
    expect(computeRetryDelay(config, 1)).toBe(100)
    expect(computeRetryDelay(config, 2)).toBe(200)
    expect(computeRetryDelay(config, 3)).toBe(300)
  })

  it('caps the delay at maxDelay', () => {
    const config = { delay: 100, backoff: 'exponential' as const, maxDelay: 250 }
    expect(computeRetryDelay(config, 1)).toBe(100)
    expect(computeRetryDelay(config, 2)).toBe(200)
    expect(computeRetryDelay(config, 3)).toBe(250)
    expect(computeRetryDelay(config, 10)).toBe(250)
  })

  it('applies equal jitter within [50%, 100%] of the computed delay', () => {
    const config = { delay: 1000, jitter: true }
    for (let i = 0; i < 50; i++) {
      const d = computeRetryDelay(config, 1)
      expect(d).toBeGreaterThanOrEqual(500)
      expect(d).toBeLessThanOrEqual(1000)
    }
  })

  it('jitter never exceeds maxDelay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const config = { delay: 1000, backoff: 'exponential' as const, maxDelay: 300, jitter: true }
    expect(computeRetryDelay(config, 5)).toBe(300)
  })

  it('jitter lower bound is half the capped delay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const config = { delay: 1000, maxDelay: 300, jitter: true }
    expect(computeRetryDelay(config, 1)).toBe(150)
  })
})

describe('buildFetchOptions retry wiring', () => {
  it('keeps a numeric retryDelay for plain configs', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      retry: { count: 2, delay: 250 },
    })
    expect(opts.retry).toBe(2)
    expect(opts.retryDelay).toBe(250)
  })

  it('omits retryDelay when not configured', () => {
    const opts = buildFetchOptions({ method: 'POST', input: {}, retry: 3 })
    expect(opts.retry).toBe(3)
    expect(opts.retryDelay).toBeUndefined()
  })

  it('uses a retryDelay function when backoff is configured', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      retry: { count: 3, delay: 100, backoff: 'exponential' },
    })
    expect(typeof opts.retryDelay).toBe('function')

    const delayFn = opts.retryDelay as (ctx: { options: { retry?: number | boolean } }) => number
    expect(delayFn({ options: { retry: 3 } })).toBe(100)
    expect(delayFn({ options: { retry: 2 } })).toBe(200)
    expect(delayFn({ options: { retry: 1 } })).toBe(400)
  })

  it('uses a retryDelay function when only jitter is set', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      retry: { count: 2, delay: 100, jitter: true },
    })
    expect(typeof opts.retryDelay).toBe('function')
  })

  it('uses a retryDelay function when only maxDelay is set', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      retry: { count: 2, delay: 100, maxDelay: 50 },
    })
    const delayFn = opts.retryDelay as (ctx: { options: { retry?: number | boolean } }) => number
    expect(delayFn({ options: { retry: 2 } })).toBe(50)
  })

  it('treats explicit fixed backoff with plain delay as static', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      retry: { count: 2, delay: 100, backoff: 'fixed' },
    })
    expect(opts.retryDelay).toBe(100)
  })

  it('falls back to attempt 1 when ofetch passes a non-numeric retry', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      retry: { count: 3, delay: 100, backoff: 'exponential' },
    })
    const delayFn = opts.retryDelay as (ctx: { options: { retry?: number | boolean } }) => number
    expect(delayFn({ options: { retry: true } })).toBe(100)
    expect(delayFn({ options: {} })).toBe(100)
  })
})
