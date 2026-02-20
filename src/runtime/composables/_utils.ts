import type { RetryConfig } from '../types'

// ── Serialization helpers ─────────────────────────────────────────

/**
 * Deterministic JSON serialization with sorted object keys.
 * Guarantees identical output for semantically equal objects regardless of key insertion order.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet()

  function serialize(val: unknown): string {
    if (val === null || val === undefined) return 'null'
    if (typeof val === 'bigint') return `"${val.toString()}"`
    if (typeof val === 'symbol') return 'null'
    if (typeof val !== 'object') return JSON.stringify(val)

    // Handle non-plain objects before cycle detection
    if (val instanceof Date) return JSON.stringify(val.toISOString())
    if (val instanceof RegExp) return JSON.stringify(val.toString())
    if (val instanceof Map) return serialize(Object.fromEntries(val))
    if (val instanceof Set) return serialize([...val])

    // Cycle detection: if we've already entered this object, bail out
    if (seen.has(val as object)) return '"[Circular]"'
    seen.add(val as object)

    let result: string
    if (Array.isArray(val)) {
      result = `[${val.map(serialize).join(',')}]`
    }
    else {
      const sorted = Object.keys(val as Record<string, unknown>).sort()
      result = `{${sorted.map(k => `${JSON.stringify(k)}:${serialize((val as Record<string, unknown>)[k])}`).join(',')}}`
    }

    // Allow the same non-circular object to appear in multiple positions
    seen.delete(val as object)
    return result
  }

  return serialize(value)
}

// ── Retry helpers ─────────────────────────────────────────────────

export function resolveRetryCount(opt?: boolean | number | RetryConfig): number | false {
  if (opt === false || opt === undefined) return false
  if (opt === true) return 3
  if (typeof opt === 'number') return opt
  return opt.count ?? 3
}

export function resolveRetryDelay(opt?: boolean | number | RetryConfig): number | undefined {
  if (!opt || typeof opt !== 'object') return undefined
  return opt.delay
}

export function resolveRetryStatusCodes(opt?: boolean | number | RetryConfig): number[] | undefined {
  if (!opt || typeof opt !== 'object') return undefined
  return opt.statusCodes
}

// ── Header helpers ────────────────────────────────────────────────

export function resolveHeaders(
  opt?: Record<string, string> | (() => Record<string, string>),
): Record<string, string> | undefined {
  if (!opt) return undefined
  return typeof opt === 'function' ? opt() : opt
}

// ── Shared fetch option builder ──────────────────────────────────

interface FetchOptionInputs {
  method: string
  input: unknown
  headers?: Record<string, string> | (() => Record<string, string>)
  retry?: boolean | number | RetryConfig
  timeout?: number
  signal?: AbortSignal
}

/**
 * Build the fetch options object shared by useAction and useOptimisticAction.
 * Centralises header, retry, timeout, body/query logic in one place.
 */
export function buildFetchOptions(opts: FetchOptionInputs): Record<string, unknown> {
  const fetchOptions: Record<string, unknown> = { method: opts.method }

  if (opts.signal) {
    fetchOptions.signal = opts.signal
  }

  // Headers
  const headers = resolveHeaders(opts.headers)
  if (headers) {
    fetchOptions.headers = headers
  }

  // Retry
  const retryCount = resolveRetryCount(opts.retry)
  if (retryCount !== false) {
    fetchOptions.retry = retryCount
    const retryDelay = resolveRetryDelay(opts.retry)
    if (retryDelay !== undefined) fetchOptions.retryDelay = retryDelay
    const retryStatusCodes = resolveRetryStatusCodes(opts.retry)
    if (retryStatusCodes) fetchOptions.retryStatusCodes = retryStatusCodes
  }

  // Timeout
  if (opts.timeout) {
    fetchOptions.timeout = opts.timeout
  }

  // Body / query based on method
  if (opts.method === 'GET' || opts.method === 'HEAD') {
    fetchOptions.query = opts.input ?? {}
  }
  else {
    fetchOptions.body = opts.input ?? {}
  }

  return fetchOptions
}

// ── Debounce / Throttle helpers ─────────────────────────────────

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CancelableFunction<T extends (...args: any[]) => any>
  = ((...args: Parameters<T>) => Promise<ReturnType<T>>) & { cancel: () => void }

/**
 * Create a debounced function that delays invoking `fn` until after
 * `ms` milliseconds have elapsed since the last call. Last-call-wins.
 * All callers' promises resolve with the eventual result.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDebouncedFn<T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): CancelableFunction<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const pendingResolvers: Array<{ resolve: (value: ReturnType<T>) => void, reject: (reason: unknown) => void }> = []

  const wrapper = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (timer) clearTimeout(timer)

    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject })
      timer = setTimeout(async () => {
        timer = null
        try {
          const result = await fn(...args)
          const resolvers = pendingResolvers.splice(0)
          for (const r of resolvers) r.resolve(result)
        }
        catch (err) {
          const resolvers = pendingResolvers.splice(0)
          for (const r of resolvers) r.reject(err)
        }
      }, ms)
    })
  }

  wrapper.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    // Reject all pending promises so callers are not left dangling
    const resolvers = pendingResolvers.splice(0)
    for (const r of resolvers) r.reject(new CancelledError())
  }

  return wrapper
}

/**
 * Create a throttled function that invokes `fn` at most once per `ms`
 * milliseconds. Trailing call is guaranteed to fire.
 * All callers within a throttle window resolve with the trailing result.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createThrottledFn<T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): CancelableFunction<T> {
  let lastCallTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: Parameters<T> | null = null
  const pendingResolvers: Array<{ resolve: (value: ReturnType<T>) => void, reject: (reason: unknown) => void }> = []

  const wrapper = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const now = Date.now()
    const elapsed = now - lastCallTime

    if (elapsed >= ms) {
      // Enough time has passed — execute immediately
      lastCallTime = now
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      const resultPromise = Promise.resolve(fn(...args))
      // Resolve any pending callers from the cleared trailing timer
      if (pendingResolvers.length > 0) {
        const resolvers = pendingResolvers.splice(0)
        resultPromise.then(
          (result) => { for (const r of resolvers) r.resolve(result) },
          (err) => { for (const r of resolvers) r.reject(err) },
        )
      }
      return resultPromise
    }

    // Within throttle window — schedule trailing call
    pendingArgs = args
    if (timer) clearTimeout(timer)

    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject })
      timer = setTimeout(async () => {
        lastCallTime = Date.now()
        timer = null
        try {
          const result = await fn(...(pendingArgs as Parameters<T>))
          const resolvers = pendingResolvers.splice(0)
          for (const r of resolvers) r.resolve(result)
        }
        catch (err) {
          const resolvers = pendingResolvers.splice(0)
          for (const r of resolvers) r.reject(err)
        }
        pendingArgs = null
      }, ms - elapsed)
    })
  }

  wrapper.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    // Reject all pending promises so callers are not left dangling
    const resolvers = pendingResolvers.splice(0)
    for (const r of resolvers) r.reject(new CancelledError())
  }

  return wrapper
}
