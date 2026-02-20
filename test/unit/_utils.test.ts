import { resolveRetryCount, resolveRetryDelay, resolveRetryStatusCodes, resolveHeaders, stableStringify, buildFetchOptions, createDebouncedFn, createThrottledFn, CancelledError } from '../../src/runtime/composables/_utils'
import { describe, it, expect, vi } from 'vitest'

describe('resolveRetryCount', () => {
  it('returns false for undefined', () => {
    expect(resolveRetryCount(undefined)).toBe(false)
  })

  it('returns false for false', () => {
    expect(resolveRetryCount(false)).toBe(false)
  })

  it('returns 3 for true', () => {
    expect(resolveRetryCount(true)).toBe(3)
  })

  it('returns the number when a number is passed', () => {
    expect(resolveRetryCount(5)).toBe(5)
  })

  it('returns count from config object', () => {
    expect(resolveRetryCount({ count: 7 })).toBe(7)
  })

  it('defaults to 3 when config object has no count', () => {
    expect(resolveRetryCount({ delay: 100 })).toBe(3)
  })
})

describe('resolveRetryDelay', () => {
  it('returns undefined for undefined', () => {
    expect(resolveRetryDelay(undefined)).toBeUndefined()
  })

  it('returns undefined for false', () => {
    expect(resolveRetryDelay(false)).toBeUndefined()
  })

  it('returns undefined for true (not an object)', () => {
    expect(resolveRetryDelay(true)).toBeUndefined()
  })

  it('returns undefined for a number', () => {
    expect(resolveRetryDelay(3)).toBeUndefined()
  })

  it('returns delay from config object', () => {
    expect(resolveRetryDelay({ delay: 500 })).toBe(500)
  })

  it('returns undefined when config has no delay', () => {
    expect(resolveRetryDelay({ count: 3 })).toBeUndefined()
  })
})

describe('resolveRetryStatusCodes', () => {
  it('returns undefined for undefined', () => {
    expect(resolveRetryStatusCodes(undefined)).toBeUndefined()
  })

  it('returns undefined for false', () => {
    expect(resolveRetryStatusCodes(false)).toBeUndefined()
  })

  it('returns undefined for true', () => {
    expect(resolveRetryStatusCodes(true)).toBeUndefined()
  })

  it('returns undefined for a number', () => {
    expect(resolveRetryStatusCodes(3)).toBeUndefined()
  })

  it('returns statusCodes from config object', () => {
    expect(resolveRetryStatusCodes({ statusCodes: [429, 503] })).toEqual([429, 503])
  })

  it('returns undefined when config has no statusCodes', () => {
    expect(resolveRetryStatusCodes({ count: 3 })).toBeUndefined()
  })
})

describe('resolveHeaders', () => {
  it('returns undefined for undefined', () => {
    expect(resolveHeaders(undefined)).toBeUndefined()
  })

  it('returns static headers object', () => {
    const headers = { Authorization: 'Bearer token' }
    expect(resolveHeaders(headers)).toEqual({ Authorization: 'Bearer token' })
  })

  it('calls function and returns result', () => {
    const fn = () => ({ 'X-Custom': 'value' })
    expect(resolveHeaders(fn)).toEqual({ 'X-Custom': 'value' })
  })
})

describe('stableStringify', () => {
  // 1. Null and undefined
  it('returns "null" for null', () => {
    expect(stableStringify(null)).toBe('null')
  })

  it('returns "null" for undefined', () => {
    expect(stableStringify(undefined)).toBe('null')
  })

  // 2. Primitive values
  it('serializes a string with surrounding quotes', () => {
    expect(stableStringify('hello')).toBe('"hello"')
  })

  it('serializes an empty string', () => {
    expect(stableStringify('')).toBe('""')
  })

  it('serializes a positive integer', () => {
    expect(stableStringify(42)).toBe('42')
  })

  it('serializes a negative number', () => {
    expect(stableStringify(-3.14)).toBe('-3.14')
  })

  it('serializes zero', () => {
    expect(stableStringify(0)).toBe('0')
  })

  it('serializes boolean true', () => {
    expect(stableStringify(true)).toBe('true')
  })

  it('serializes boolean false', () => {
    expect(stableStringify(false)).toBe('false')
  })

  // 3. Simple object with sorted keys
  it('serializes a single-key object', () => {
    expect(stableStringify({ a: 1 })).toBe('{"a":1}')
  })

  it('serializes an object with keys already in sorted order', () => {
    expect(stableStringify({ a: 1, b: 2, c: 3 })).toBe('{"a":1,"b":2,"c":3}')
  })

  it('sorts object keys alphabetically', () => {
    expect(stableStringify({ z: 3, a: 1, m: 2 })).toBe('{"a":1,"m":2,"z":3}')
  })

  // 4. Different key insertion order produces the same output
  it('produces identical output regardless of key insertion order', () => {
    const objA = { x: 10, y: 20, z: 30 }
    const objB = { z: 30, x: 10, y: 20 }
    const objC = { y: 20, z: 30, x: 10 }
    const result = '{"x":10,"y":20,"z":30}'
    expect(stableStringify(objA)).toBe(result)
    expect(stableStringify(objB)).toBe(result)
    expect(stableStringify(objC)).toBe(result)
  })

  it('two semantically equal objects with different insertion order compare equal', () => {
    const first = stableStringify({ foo: 'bar', baz: 42 })
    const second = stableStringify({ baz: 42, foo: 'bar' })
    expect(first).toBe(second)
  })

  // 5. Nested objects with sorted keys
  it('sorts keys in nested objects', () => {
    const input = { outer: { z: 1, a: 2 } }
    expect(stableStringify(input)).toBe('{"outer":{"a":2,"z":1}}')
  })

  it('sorts keys at every level of a deeply nested object', () => {
    const input = { c: { z: true, a: { y: 'last', b: 'first' } }, a: 1 }
    expect(stableStringify(input)).toBe('{"a":1,"c":{"a":{"b":"first","y":"last"},"z":true}}')
  })

  // 6. Arrays preserve insertion order
  it('serializes an empty array', () => {
    expect(stableStringify([])).toBe('[]')
  })

  it('preserves array element order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]')
  })

  it('serializes an array of strings', () => {
    expect(stableStringify(['c', 'a', 'b'])).toBe('["c","a","b"]')
  })

  it('serializes nested arrays and preserves order', () => {
    expect(stableStringify([[1, 2], [3, 4]])).toBe('[[1,2],[3,4]]')
  })

  // 7. Mixed nested structures
  it('serializes objects inside arrays with sorted keys', () => {
    const input = [{ b: 2, a: 1 }, { d: 4, c: 3 }]
    expect(stableStringify(input)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]')
  })

  it('serializes arrays inside objects', () => {
    const input = { nums: [3, 1, 2], label: 'test' }
    expect(stableStringify(input)).toBe('{"label":"test","nums":[3,1,2]}')
  })

  it('handles a complex mixed structure deterministically', () => {
    const inputA = {
      users: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
      meta: { total: 2, page: 1 },
    }
    const inputB = {
      meta: { page: 1, total: 2 },
      users: [
        { age: 30, name: 'Alice' },
        { age: 25, name: 'Bob' },
      ],
    }
    const expected = '{"meta":{"page":1,"total":2},"users":[{"age":30,"name":"Alice"},{"age":25,"name":"Bob"}]}'
    expect(stableStringify(inputA)).toBe(expected)
    expect(stableStringify(inputB)).toBe(expected)
  })

  it('serializes null values inside objects and arrays', () => {
    expect(stableStringify({ a: null })).toBe('{"a":null}')
    expect(stableStringify([null, null])).toBe('[null,null]')
  })

  // 8. Circular reference handling
  it('handles direct circular reference gracefully', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    expect(() => stableStringify(obj)).not.toThrow()
    expect(stableStringify(obj)).toBe('{"a":1,"self":"[Circular]"}')
  })

  it('handles indirect circular reference gracefully', () => {
    const a: Record<string, unknown> = { name: 'a' }
    const b: Record<string, unknown> = { name: 'b', ref: a }
    a.ref = b
    expect(() => stableStringify(a)).not.toThrow()
    const result = stableStringify(a)
    expect(result).toContain('"[Circular]"')
  })

  it('handles circular reference in array', () => {
    const arr: unknown[] = [1, 2]
    arr.push(arr)
    expect(() => stableStringify(arr)).not.toThrow()
    expect(stableStringify(arr)).toBe('[1,2,"[Circular]"]')
  })

  it('allows same non-circular object in multiple positions', () => {
    const shared = { x: 1 }
    const obj = { a: shared, b: shared }
    const result = stableStringify(obj)
    expect(result).toBe('{"a":{"x":1},"b":{"x":1}}')
    expect(result).not.toContain('[Circular]')
  })

  it('handles deeply nested circular reference', () => {
    const deep: Record<string, unknown> = { level: 1 }
    deep.child = { level: 2, parent: deep }
    expect(() => stableStringify(deep)).not.toThrow()
    expect(stableStringify(deep)).toContain('"[Circular]"')
  })

  // 9. Non-JSON type handling
  it('serializes BigInt values as quoted strings', () => {
    expect(stableStringify(BigInt(9007199254740991))).toBe('"9007199254740991"')
    expect(stableStringify({ n: BigInt(42) })).toBe('{"n":"42"}')
  })

  it('serializes Date as ISO string', () => {
    const date = new Date('2024-01-15T12:00:00.000Z')
    expect(stableStringify(date)).toBe('"2024-01-15T12:00:00.000Z"')
  })

  it('serializes Date inside an object', () => {
    const obj = { created: new Date('2024-01-15T12:00:00.000Z'), name: 'test' }
    expect(stableStringify(obj)).toBe('{"created":"2024-01-15T12:00:00.000Z","name":"test"}')
  })

  it('serializes RegExp as string', () => {
    expect(stableStringify(/abc/gi)).toBe('"/abc/gi"')
  })

  it('serializes Map as object', () => {
    const map = new Map([['b', 2], ['a', 1]])
    expect(stableStringify(map)).toBe('{"a":1,"b":2}')
  })

  it('serializes Set as array', () => {
    const set = new Set([3, 1, 2])
    expect(stableStringify(set)).toBe('[3,1,2]')
  })

  it('returns "null" for Symbol', () => {
    expect(stableStringify(Symbol('test'))).toBe('null')
  })

  it('handles Symbol inside object (serializes to null)', () => {
    expect(stableStringify({ a: Symbol('x'), b: 1 })).toBe('{"a":null,"b":1}')
  })
})

// ── buildFetchOptions ──────────────────────────────────────────────

describe('buildFetchOptions', () => {
  it('sets method and body for POST', () => {
    const opts = buildFetchOptions({ method: 'POST', input: { title: 'test' } })
    expect(opts.method).toBe('POST')
    expect(opts.body).toEqual({ title: 'test' })
    expect(opts.query).toBeUndefined()
  })

  it('sets method and query for GET', () => {
    const opts = buildFetchOptions({ method: 'GET', input: { q: 'search' } })
    expect(opts.method).toBe('GET')
    expect(opts.query).toEqual({ q: 'search' })
    expect(opts.body).toBeUndefined()
  })

  it('sets method and query for HEAD', () => {
    const opts = buildFetchOptions({ method: 'HEAD', input: {} })
    expect(opts.method).toBe('HEAD')
    expect(opts.query).toEqual({})
  })

  it('resolves static headers', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      headers: { Authorization: 'Bearer token' },
    })
    expect(opts.headers).toEqual({ Authorization: 'Bearer token' })
  })

  it('resolves function headers', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      headers: () => ({ 'X-Custom': 'value' }),
    })
    expect(opts.headers).toEqual({ 'X-Custom': 'value' })
  })

  it('omits headers when not provided', () => {
    const opts = buildFetchOptions({ method: 'POST', input: {} })
    expect(opts.headers).toBeUndefined()
  })

  it('sets retry count for boolean true', () => {
    const opts = buildFetchOptions({ method: 'POST', input: {}, retry: true })
    expect(opts.retry).toBe(3)
  })

  it('sets retry count for number', () => {
    const opts = buildFetchOptions({ method: 'POST', input: {}, retry: 5 })
    expect(opts.retry).toBe(5)
  })

  it('sets retry config with delay and statusCodes', () => {
    const opts = buildFetchOptions({
      method: 'POST',
      input: {},
      retry: { count: 2, delay: 1000, statusCodes: [500, 502] },
    })
    expect(opts.retry).toBe(2)
    expect(opts.retryDelay).toBe(1000)
    expect(opts.retryStatusCodes).toEqual([500, 502])
  })

  it('omits retry when false or undefined', () => {
    const opts1 = buildFetchOptions({ method: 'POST', input: {}, retry: false })
    expect(opts1.retry).toBeUndefined()

    const opts2 = buildFetchOptions({ method: 'POST', input: {} })
    expect(opts2.retry).toBeUndefined()
  })

  it('sets timeout when provided', () => {
    const opts = buildFetchOptions({ method: 'POST', input: {}, timeout: 5000 })
    expect(opts.timeout).toBe(5000)
  })

  it('omits timeout when not provided', () => {
    const opts = buildFetchOptions({ method: 'POST', input: {} })
    expect(opts.timeout).toBeUndefined()
  })

  it('sets signal when provided', () => {
    const controller = new AbortController()
    const opts = buildFetchOptions({ method: 'POST', input: {}, signal: controller.signal })
    expect(opts.signal).toBe(controller.signal)
  })

  it('uses empty object for null input', () => {
    const opts = buildFetchOptions({ method: 'POST', input: null })
    expect(opts.body).toEqual({})
  })
})

// ── createDebouncedFn ────────────────────────────────────────────

describe('createDebouncedFn', () => {
  it('delays execution until idle period elapses', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('result')
    const debounced = createDebouncedFn(fn, 100)

    const promise = debounced('arg1')

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    const result = await promise

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('arg1')
    expect(result).toBe('result')

    vi.useRealTimers()
  })

  it('uses last-call-wins when called rapidly', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('final')
    const debounced = createDebouncedFn(fn, 100)

    debounced('first')
    debounced('second')
    const promise = debounced('third')

    vi.advanceTimersByTime(100)
    await promise

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('third')

    vi.useRealTimers()
  })

  it('resets timer on each call', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('ok')
    const debounced = createDebouncedFn(fn, 100)

    debounced('a')
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()

    debounced('b')
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()

    const promise = debounced('c')
    vi.advanceTimersByTime(100)
    await promise

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('c')

    vi.useRealTimers()
  })

  it('resolves all pending callers with the final result', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('final-result')
    const debounced = createDebouncedFn(fn, 100)

    const promise1 = debounced('first')
    const promise2 = debounced('second')
    const promise3 = debounced('third')

    vi.advanceTimersByTime(100)

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])

    expect(result1).toBe('final-result')
    expect(result2).toBe('final-result')
    expect(result3).toBe('final-result')
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('third')

    vi.useRealTimers()
  })

  it('does not leak promises from superseded calls', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('done')
    const debounced = createDebouncedFn(fn, 50)

    const promises: Promise<unknown>[] = []
    for (let i = 0; i < 10; i++) {
      promises.push(debounced(`call-${i}`))
    }

    vi.advanceTimersByTime(50)

    const results = await Promise.all(promises)
    expect(results.every(r => r === 'done')).toBe(true)
    expect(fn).toHaveBeenCalledOnce()

    vi.useRealTimers()
  })

  it('has a cancel method that clears pending timer', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('result')
    const debounced = createDebouncedFn(fn, 100)

    const promise = debounced('arg1')
    expect(fn).not.toHaveBeenCalled()

    debounced.cancel()

    // Pending promise should be rejected
    await expect(promise).rejects.toThrow(CancelledError)

    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('cancel is safe to call when no timer is pending', () => {
    const fn = vi.fn().mockResolvedValue('result')
    const debounced = createDebouncedFn(fn, 100)

    expect(() => debounced.cancel()).not.toThrow()
  })

  it('cancel rejects pending promises with CancelledError', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('result')
    const debounced = createDebouncedFn(fn, 100)

    const promise1 = debounced('a')
    const promise2 = debounced('b')

    debounced.cancel()

    await expect(promise1).rejects.toThrow(CancelledError)
    await expect(promise2).rejects.toThrow(CancelledError)
    expect(fn).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('cancel rejects with CancelledError that has correct name', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('result')
    const debounced = createDebouncedFn(fn, 100)

    const promise = debounced('a')
    debounced.cancel()

    try {
      await promise
    }
    catch (err) {
      expect(err).toBeInstanceOf(CancelledError)
      expect((err as CancelledError).name).toBe('CancelledError')
      expect((err as CancelledError).message).toBe('Cancelled')
    }

    vi.useRealTimers()
  })
})

// ── createThrottledFn ────────────────────────────────────────────

describe('createThrottledFn', () => {
  it('executes immediately on first call', async () => {
    const fn = vi.fn().mockResolvedValue('immediate')
    const throttled = createThrottledFn(fn, 100)

    const result = await throttled('arg1')

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('arg1')
    expect(result).toBe('immediate')
  })

  it('throttles subsequent calls within the window', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('ok')
    const throttled = createThrottledFn(fn, 100)

    await throttled('first')
    expect(fn).toHaveBeenCalledTimes(1)

    // Second call within window — should be deferred
    const promise = throttled('second')
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    await promise

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')

    vi.useRealTimers()
  })

  it('fires trailing call with the latest arguments', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('trailing')
    const throttled = createThrottledFn(fn, 100)

    await throttled('first')
    throttled('second')
    const promise = throttled('third')

    vi.advanceTimersByTime(100)
    await promise

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('third')

    vi.useRealTimers()
  })

  it('allows execution after throttle window expires', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('ok')
    const throttled = createThrottledFn(fn, 100)

    await throttled('first')
    vi.advanceTimersByTime(100)

    await throttled('second')

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')

    vi.useRealTimers()
  })

  it('resolves all pending callers within throttle window', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('trailing-result')
    const throttled = createThrottledFn(fn, 100)

    // First call executes immediately
    await throttled('first')

    // These all fall within the throttle window
    const promise1 = throttled('second')
    const promise2 = throttled('third')
    const promise3 = throttled('fourth')

    vi.advanceTimersByTime(100)

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])

    expect(result1).toBe('trailing-result')
    expect(result2).toBe('trailing-result')
    expect(result3).toBe('trailing-result')
    // First call + one trailing call
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('fourth')

    vi.useRealTimers()
  })

  it('does not leak promises from superseded trailing calls', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('done')
    const throttled = createThrottledFn(fn, 100)

    await throttled('first')

    const promises: Promise<unknown>[] = []
    for (let i = 0; i < 10; i++) {
      promises.push(throttled(`call-${i}`))
    }

    vi.advanceTimersByTime(100)

    const results = await Promise.all(promises)
    expect(results.every(r => r === 'done')).toBe(true)

    vi.useRealTimers()
  })

  it('has a cancel method that clears pending trailing timer', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('result')
    const throttled = createThrottledFn(fn, 100)

    // First call executes immediately
    await throttled('first')
    expect(fn).toHaveBeenCalledTimes(1)

    // Second call within window — deferred
    const promise = throttled('second')

    throttled.cancel()

    // Pending promise should be rejected
    await expect(promise).rejects.toThrow(CancelledError)

    vi.advanceTimersByTime(200)
    // Only the immediate first call, trailing was cancelled
    expect(fn).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('cancel is safe to call when no timer is pending', () => {
    const fn = vi.fn().mockResolvedValue('result')
    const throttled = createThrottledFn(fn, 100)

    expect(() => throttled.cancel()).not.toThrow()
  })

  it('cancel rejects pending promises with CancelledError', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('result')
    const throttled = createThrottledFn(fn, 100)

    // First call — immediate
    await throttled('first')
    expect(fn).toHaveBeenCalledTimes(1)

    // Second call — deferred (within throttle window)
    const promise = throttled('second')

    throttled.cancel()

    await expect(promise).rejects.toThrow(CancelledError)
    // Only the first immediate call should have fired
    expect(fn).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('clears pending trailing timer when new call arrives after window', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue('ok')
    const throttled = createThrottledFn(fn, 100)

    // First call — immediate
    await throttled('first')
    expect(fn).toHaveBeenCalledTimes(1)

    // Second call within window — sets trailing timer
    throttled('second')
    expect(fn).toHaveBeenCalledTimes(1)

    // Move Date.now() forward WITHOUT firing the trailing timer
    vi.setSystemTime(Date.now() + 200)

    // Third call — elapsed >= ms AND timer is still pending
    // This should hit the branch: clearTimeout(timer); timer = null; execute immediately
    await throttled('third')
    expect(fn).toHaveBeenCalledTimes(2) // first + immediate third (trailing timer cleared, never fired)
    expect(fn).toHaveBeenLastCalledWith('third')

    vi.useRealTimers()
  })
})
