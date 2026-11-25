import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildFetchOptions, parseRetryAfter, runWithRetryAfter, sleep } from '../../src/runtime/composables/_utils'

function rateLimited(retryAfter?: number) {
  return {
    success: false as const,
    error: { code: 'RATE_LIMIT', message: 'Slow down', statusCode: 429, ...(retryAfter === undefined ? {} : { retryAfter }) },
  }
}

const ok = { success: true as const, data: 'done' }

function httpError(status: number, retryAfter?: string) {
  const headers = retryAfter === undefined ? undefined : { 'retry-after': retryAfter }
  return Object.assign(new Error(`HTTP ${status}`), { response: new Response(null, { status, headers }), statusCode: status })
}

const respect = { count: 2, respectRetryAfter: true }

afterEach(() => {
  vi.useRealTimers()
})

describe('parseRetryAfter', () => {
  it('reads delay seconds', () => {
    expect(parseRetryAfter('3')).toBe(3000)
  })

  it('reads an HTTP date', () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0)
    expect(parseRetryAfter(new Date(now + 10_000).toUTCString(), now)).toBe(10_000)
  })

  it('never returns a negative wait for a date in the past', () => {
    expect(parseRetryAfter(new Date(0).toUTCString(), 5000)).toBe(0)
  })

  it('ignores missing or malformed values', () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('')).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
    expect(parseRetryAfter('-1')).toBeUndefined()
    expect(parseRetryAfter('1.5')).toBeUndefined()
  })
})

describe('sleep', () => {
  it('resolves after the delay', async () => {
    vi.useFakeTimers()
    let done = false
    const waiting = sleep(1000).then(() => {
      done = true
    })

    await vi.advanceTimersByTimeAsync(999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await waiting
    expect(done).toBe(true)
  })

  it('rejects with an AbortError when the signal aborts and clears its timer', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const waiting = sleep(10_000, controller.signal)

    controller.abort()

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects at once when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(sleep(10_000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('runWithRetryAfter', () => {
  it('calls the request once when respectRetryAfter is off', async () => {
    const request = vi.fn().mockResolvedValue(rateLimited(1))

    await expect(runWithRetryAfter(request, { count: 3 }, new AbortController().signal)).resolves.toEqual(rateLimited(1))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('retries a RATE_LIMIT result after retryAfter seconds', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockResolvedValueOnce(rateLimited(2)).mockResolvedValueOnce(ok)
    const running = runWithRetryAfter(request, respect, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(1999)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(running).resolves.toEqual(ok)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('gives up after count retries and returns the last result', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockResolvedValue(rateLimited(1))
    const running = runWithRetryAfter(request, respect, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(5000)

    await expect(running).resolves.toEqual(rateLimited(1))
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('returns the very promise of the request when respectRetryAfter is off', () => {
    const pending = Promise.resolve(ok)
    expect(runWithRetryAfter(() => pending, { count: 3 }, new AbortController().signal)).toBe(pending)
  })

  it('retries three times when count is not set', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockResolvedValue(rateLimited(1))
    const running = runWithRetryAfter(request, { respectRetryAfter: true }, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(10_000)

    await expect(running).resolves.toEqual(rateLimited(1))
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('does not retry when retryAfter is longer than maxDelay', async () => {
    const request = vi.fn().mockResolvedValue(rateLimited(10))

    await expect(runWithRetryAfter(request, { ...respect, maxDelay: 5000 }, new AbortController().signal)).resolves.toEqual(rateLimited(10))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('caps the wait at 30 seconds when maxDelay is not set', async () => {
    const request = vi.fn().mockResolvedValue(rateLimited(31))

    await runWithRetryAfter(request, respect, new AbortController().signal)

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('returns other failures and RATE_LIMIT without retryAfter as they are', async () => {
    const failure = { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'Bad', statusCode: 422 } }
    const request = vi.fn().mockResolvedValueOnce(failure).mockResolvedValueOnce(rateLimited())

    await expect(runWithRetryAfter(request, respect, new AbortController().signal)).resolves.toEqual(failure)
    await expect(runWithRetryAfter(request, respect, new AbortController().signal)).resolves.toEqual(rateLimited())
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('retries an HTTP 429 after its Retry-After header', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockRejectedValueOnce(httpError(429, '1')).mockResolvedValueOnce(ok)
    const running = runWithRetryAfter(request, respect, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(999)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(running).resolves.toEqual(ok)
  })

  it('retries an HTTP 503 with an HTTP-date Retry-After', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockRejectedValueOnce(httpError(503, new Date(Date.now() + 2000).toUTCString())).mockResolvedValueOnce(ok)
    const running = runWithRetryAfter(request, respect, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(2000)

    await expect(running).resolves.toEqual(ok)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('rethrows an HTTP error whose Retry-After is longer than maxDelay', async () => {
    const error = httpError(429, '120')
    const request = vi.fn().mockRejectedValue(error)

    await expect(runWithRetryAfter(request, respect, new AbortController().signal)).rejects.toBe(error)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('retries a 500 with the configured delay', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(ok)
    const running = runWithRetryAfter(request, { ...respect, delay: 200 }, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(199)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(running).resolves.toEqual(ok)
  })

  it('treats a network failure like a 500', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(ok)
    const running = runWithRetryAfter(request, respect, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(500)

    await expect(running).resolves.toEqual(ok)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('rethrows status codes outside statusCodes without retrying', async () => {
    const error = httpError(400)
    const request = vi.fn().mockRejectedValue(error)

    await expect(runWithRetryAfter(request, respect, new AbortController().signal)).rejects.toBe(error)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('rethrows the last HTTP error once retries run out', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockRejectedValue(httpError(503, '1'))
    const running = runWithRetryAfter(request, respect, new AbortController().signal)
    const settled = expect(running).rejects.toMatchObject({ statusCode: 503 })

    await vi.advanceTimersByTimeAsync(5000)

    await settled
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('rethrows an abort without retrying', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    const request = vi.fn().mockRejectedValue(abort)

    await expect(runWithRetryAfter(request, respect, new AbortController().signal)).rejects.toBe(abort)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('stops waiting as soon as the signal aborts', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const request = vi.fn().mockResolvedValue(rateLimited(5))
    const running = runWithRetryAfter(request, respect, controller.signal)
    const settled = expect(running).rejects.toMatchObject({ name: 'AbortError' })

    await vi.advanceTimersByTimeAsync(0)
    controller.abort()

    await settled
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('buildFetchOptions with respectRetryAfter', () => {
  it('turns off the fetch-level retries so the composable runs them', () => {
    const options = buildFetchOptions({ method: 'POST', retry: { count: 3, respectRetryAfter: true } })

    expect(options.retry).toBe(0)
    expect(options.retryDelay).toBeUndefined()
    expect(options.retryStatusCodes).toBeUndefined()
  })

  it('keeps fetch-level retries when respectRetryAfter is off', () => {
    expect(buildFetchOptions({ method: 'POST', retry: { count: 3 } }).retry).toBe(3)
  })
})
