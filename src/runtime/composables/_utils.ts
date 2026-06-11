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
    if (ArrayBuffer.isView(val) || val instanceof ArrayBuffer) {
      /*
       * Binary payloads (multipart uploads) are summarized instead of
       * serialized byte-by-byte: a megabyte Buffer would otherwise explode
       * into tens of megabytes of JSON for idempotency fingerprints.
       */
      const bytes = ArrayBuffer.isView(val)
        ? new Uint8Array(val.buffer, val.byteOffset, val.byteLength)
        : new Uint8Array(val)
      return `["__binary__",${bytes.byteLength},"${binaryDigest(bytes)}"]`
    }
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

/**
 * Two independent FNV-1a passes (different offset basis) combined into a 64-bit
 * digest — dependency-free and isomorphic (no node:crypto), with a birthday
 * bound around 2^32 so distinct binary bodies of equal length don't collide in
 * practice. Used to fingerprint binary payloads for idempotency.
 */
function binaryDigest(bytes: Uint8Array): string {
  let h1 = 0x811C9DC5
  let h2 = 0xC2B2AE35
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    h1 = Math.imul(h1 ^ b, 0x01000193)
    h2 = Math.imul(h2 ^ b, 0x01000193)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
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

/**
 * Compute the delay before retry attempt `attempt` (1-based).
 * Applies the growth strategy, caps at maxDelay, then applies jitter so the
 * cap is never exceeded. Jitter randomizes within [50%, 100%] of the value
 * (equal jitter) to spread out concurrent retries.
 */
export function computeRetryDelay(config: RetryConfig, attempt: number): number {
  const base = config.delay ?? 500
  let delay: number
  switch (config.backoff) {
    case 'exponential':
      delay = base * 2 ** (attempt - 1)
      break
    case 'linear':
      delay = base * attempt
      break
    default:
      delay = base
  }
  if (config.maxDelay !== undefined) {
    delay = Math.min(delay, config.maxDelay)
  }
  if (config.jitter) {
    delay = delay / 2 + Math.random() * (delay / 2)
  }
  return Math.round(delay)
}

function needsDynamicRetryDelay(config: RetryConfig): boolean {
  return (config.backoff !== undefined && config.backoff !== 'fixed')
    || config.jitter === true
    || config.maxDelay !== undefined
}

// ── Abort & timeout helpers ───────────────────────────────────────

/** The settled result every aborted execute() resolves with. */
export function abortResult(): { success: false, error: { code: string, message: string, statusCode: number } } {
  return { success: false, error: { code: 'ABORT_ERROR', message: 'Request was aborted', statusCode: 0 } }
}

/**
 * Resolve with the promise's value, or reject the moment `signal` aborts —
 * whichever comes first. Lets execute() settle on abort without waiting out
 * an in-flight ofetch retry-backoff sleep.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

/**
 * Detect an aborted request across runtimes. Real ofetch never rethrows the
 * raw DOMException — it wraps rejections in a FetchError with the original
 * AbortError on `cause` — so the owned signal is the source of truth.
 */
export function isAbortRejection(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  const candidate = err as { name?: string, cause?: { name?: string } } | null | undefined
  return candidate?.name === 'AbortError' || candidate?.cause?.name === 'AbortError'
}

// ── Global hook emitter ───────────────────────────────────────────

/**
 * Emit a global action hook without ever affecting the action lifecycle:
 * fire-and-forget, and a throwing hook handler is swallowed. The target is
 * typed as unknown because NuxtApp.callHook's strictly-keyed signature is
 * not assignable to a loose structural type.
 */
export function emitActionHook(target: unknown, name: string, payload: unknown): void {
  const callHook = (target as { callHook?: unknown } | null | undefined)?.callHook
  if (typeof callHook !== 'function') return
  try {
    void Promise.resolve(
      (callHook as (n: string, p: unknown) => unknown).call(target, name, payload),
    ).catch(() => {})
  }
  catch {
    /* a synchronously-throwing hook must not break execute() */
  }
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
    const retryConfig = typeof opts.retry === 'object' ? opts.retry : undefined
    if (retryConfig && needsDynamicRetryDelay(retryConfig)) {
      /*
       * ofetch decrements options.retry before each subsequent attempt, so the
       * remaining count at failure time yields a 1-based attempt index.
       */
      fetchOptions.retryDelay = (context: { options: { retry?: number | boolean } }) => {
        const remaining = typeof context.options.retry === 'number' ? context.options.retry : retryCount
        const attempt = Math.max(1, retryCount - remaining + 1)
        return computeRetryDelay(retryConfig, attempt)
      }
    }
    else {
      /* Honor the documented 500ms default for object configs — ofetch's own default is 0ms */
      if (retryConfig) fetchOptions.retryDelay = retryConfig.delay ?? 500
    }
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

interface Resolver<T> {
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

/*
 * Settle a snapshotted batch of resolvers with the result of a (possibly
 * sync-throwing) call. The batch is captured at fire time so callers that
 * arrive while `fn` is in flight start a fresh window instead of receiving
 * this window's result.
 */
function settleBatch<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => any,
  batch: Array<Resolver<T>>,
): void {
  Promise.resolve()
    .then(fn)
    .then(
      (result: T) => {
        for (const r of batch) r.resolve(result)
      },
      (err: unknown) => {
        for (const r of batch) r.reject(err)
      },
    )
}

/**
 * Create a debounced function that delays invoking `fn` until after
 * `ms` milliseconds have elapsed since the last call. Last-call-wins.
 * All callers' promises resolve with the eventual result.
 *
 * `onCancel`, when provided, settles pending callers with its value instead
 * of rejecting — used by the action composables so cancel()/unmount keep the
 * documented "never throws" contract (an ABORT_ERROR result, not a throw).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDebouncedFn<T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
  onCancel?: () => Awaited<ReturnType<T>>,
): CancelableFunction<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Array<Resolver<ReturnType<T>>> = []

  const wrapper = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (timer) clearTimeout(timer)

    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject })
      timer = setTimeout(() => {
        timer = null
        // Snapshot the window BEFORE invoking fn so later callers start fresh
        const batch = pending
        pending = []
        settleBatch(() => fn(...args), batch)
      }, ms)
    })
  }

  wrapper.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    settleOrReject(pending, onCancel)
    pending = []
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
  onCancel?: () => Awaited<ReturnType<T>>,
): CancelableFunction<T> {
  let lastCallTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: Parameters<T> | null = null
  let pending: Array<Resolver<ReturnType<T>>> = []

  const wrapper = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const now = Date.now()
    const elapsed = now - lastCallTime

    if (elapsed >= ms) {
      // Leading edge — execute immediately
      lastCallTime = now
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      const resultPromise = Promise.resolve().then(() => fn(...args)) as Promise<ReturnType<T>>
      // Settle any callers parked by the now-cancelled trailing timer
      if (pending.length > 0) {
        const batch = pending
        pending = []
        pendingArgs = null
        resultPromise.then(
          (result) => { for (const r of batch) r.resolve(result) },
          (err) => { for (const r of batch) r.reject(err) },
        )
      }
      return resultPromise
    }

    // Within the window — schedule a trailing call
    pendingArgs = args
    if (timer) clearTimeout(timer)

    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject })
      timer = setTimeout(() => {
        lastCallTime = Date.now()
        timer = null
        // Capture args + resolvers at fire time, before fn runs
        const callArgs = pendingArgs as Parameters<T>
        pendingArgs = null
        const batch = pending
        pending = []
        settleBatch(() => fn(...callArgs), batch)
      }, ms - elapsed)
    })
  }

  wrapper.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pendingArgs = null
    settleOrReject(pending, onCancel)
    pending = []
  }

  return wrapper
}

function settleOrReject<T>(
  batch: Array<Resolver<T>>,
  onCancel?: () => T,
): void {
  if (onCancel) {
    const value = onCancel()
    for (const r of batch) r.resolve(value)
  }
  else {
    for (const r of batch) r.reject(new CancelledError())
  }
}
