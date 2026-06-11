import { createHash } from 'node:crypto'
import { getHeader, setHeader } from 'h3'
import type { H3Event } from 'h3'
import type {
  ActionResult,
  IdempotencyConfig,
  IdempotencyRecord,
  IdempotencyStore,
} from '../../types'
import { stableStringify } from '../../composables/_utils'

const DEFAULT_TTL = 86_400_000
const DEFAULT_HEADER = 'Idempotency-Key'
const DEFAULT_MAX_ENTRIES = 10_000

/**
 * Compose an injective store key from independently-encoded segments so a
 * client-controlled key can never collide across scopes via the ':' delimiter
 * (e.g. scope "acme" + key "42:x" must not equal scope "acme:42" + key "x").
 * The query string is dropped so the same logical action maps to one key.
 */
function composeStoreKey(path: string, scope: string, rawKey: string): string {
  return JSON.stringify([path.split('?')[0], scope, rawKey])
}

/** Constant-size, collision-free fingerprint of the request input. */
function fingerprintOf(rawInput: unknown): string {
  return createHash('sha256').update(stableStringify(rawInput)).digest('hex')
}

/**
 * In-memory IdempotencyStore with TTL expiry and a hard size cap.
 * Reads are O(1): only the requested entry's expiry is checked. When the cap
 * is exceeded on write, the oldest entries are evicted (insertion order), so
 * unauthenticated key floods cannot exhaust memory. Per-process only — use a
 * shared store (Redis via unstorage, etc.) across instances.
 */
export function createMemoryIdempotencyStore(
  opts: { maxEntries?: number } = {},
): IdempotencyStore {
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES
  const entries = new Map<string, { record: IdempotencyRecord, expiresAt: number }>()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return null
      if (Date.now() >= entry.expiresAt) {
        entries.delete(key)
        return null
      }
      return entry.record
    },
    set(key, record, ttlMs) {
      entries.delete(key)
      entries.set(key, { record, expiresAt: Date.now() + ttlMs })
      while (entries.size > maxEntries) {
        /* size > maxEntries >= 0 guarantees the map is non-empty */
        entries.delete(entries.keys().next().value as string)
      }
    },
  }
}

const defaultStore = createMemoryIdempotencyStore()

/*
 * In-flight requests are tracked per process so a concurrent duplicate
 * (double-click before the first response lands) awaits the original
 * execution instead of running the handler twice. Keys are path-scoped,
 * so one registry is shared safely across all actions.
 */
const inflight = new Map<string, { fingerprint: string, promise: Promise<ActionResult<unknown>> }>()

/**
 * Idempotency orchestration used by defineAction when the `idempotency`
 * option is set. This lives in defineAction (not middleware) because the
 * middleware chain runs strictly before the handler and never sees the
 * response — replaying a stored result requires controlling both sides.
 *
 * Semantics (Stripe-style):
 * - No key (and not required): execute normally.
 * - Known key + same payload: replay the stored result, handler is skipped.
 * - Known key + different payload: 422 IDEMPOTENCY_KEY_REUSE.
 * - Concurrent duplicate: awaits the in-flight execution (per process).
 * - Only successful results are stored; failures may be retried.
 *
 * Replay happens BEFORE validation and middleware: a replayed request does
 * not re-run auth or rate limiting. Set `scope` (e.g. the session user id)
 * so one client can never replay another client's result.
 */
export async function executeWithIdempotency(
  event: H3Event,
  rawInput: unknown,
  config: IdempotencyConfig,
  run: () => Promise<ActionResult<unknown>>,
): Promise<ActionResult<unknown>> {
  const header = config.header ?? DEFAULT_HEADER

  let rawKey: string | null | undefined
  let scope: string
  try {
    rawKey = config.key ? await config.key(event) : getHeader(event, header)
    if (rawKey) {
      scope = config.scope ? await config.scope(event) : ''
    }
    else {
      scope = ''
    }
  }
  catch {
    /* A throwing key/scope resolver must fail closed as a typed result, never a raw 500. */
    return storeUnavailableError()
  }

  if (!rawKey) {
    if (config.required) {
      return {
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: `Missing ${header} header`,
          statusCode: 400,
        },
      }
    }
    return run()
  }

  const storeKey = composeStoreKey(event.path, scope, rawKey)
  const fingerprint = fingerprintOf(rawInput)
  const store = config.store ?? defaultStore
  const ttl = config.ttl ?? DEFAULT_TTL

  /*
   * Claim the in-flight slot SYNCHRONOUSLY (no await before inflight.set), so
   * two concurrent duplicates cannot both pass an async store.get and run the
   * handler twice. The async store lookup happens inside the claimed promise.
   * Cross-instance dedupe (shared store) still needs an atomic claim in the
   * store implementation; this closes the in-process window.
   */
  const pending = inflight.get(storeKey)
  if (pending) {
    if (pending.fingerprint !== fingerprint) {
      return keyReuseError()
    }
    return pending.promise
  }

  const promise = (async (): Promise<ActionResult<unknown>> => {
    let existing: IdempotencyRecord | null | undefined
    try {
      existing = await store.get(storeKey)
    }
    catch {
      /*
       * A read outage (e.g. Redis down) fails closed: never run the handler
       * blindly (risking a double-execution), and never leak a raw 500.
       */
      return storeUnavailableError()
    }
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return keyReuseError()
      }
      try {
        setHeader(event, 'idempotency-replayed', 'true')
      }
      catch {
        /* replay must succeed even when the response is no longer writable */
      }
      return existing.result
    }

    const result = await run()
    if (result.success) {
      try {
        await store.set(storeKey, { fingerprint, result }, ttl)
      }
      catch {
        /*
         * Persistence is best-effort: a store outage must not turn an
         * already-successful handler result into a 500 (which would also
         * invite a retry that re-runs the handler).
         */
      }
    }
    return result
  })()

  inflight.set(storeKey, { fingerprint, promise })
  try {
    return await promise
  }
  finally {
    inflight.delete(storeKey)
  }
}

function keyReuseError(): ActionResult<never> {
  return {
    success: false,
    error: {
      code: 'IDEMPOTENCY_KEY_REUSE',
      message: 'Idempotency key was already used with a different request payload',
      statusCode: 422,
    },
  }
}

function storeUnavailableError(): ActionResult<never> {
  return {
    success: false,
    error: {
      code: 'IDEMPOTENCY_STORE_ERROR',
      message: 'Idempotency store unavailable',
      statusCode: 503,
    },
  }
}
