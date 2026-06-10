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
  const rawKey = config.key ? await config.key(event) : getHeader(event, header)

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

  const scope = config.scope ? await config.scope(event) : ''
  const storeKey = `${event.path}:${scope}:${rawKey}`
  const fingerprint = stableStringify(rawInput)
  const store = config.store ?? defaultStore

  const existing = await store.get(storeKey)
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

  const pending = inflight.get(storeKey)
  if (pending) {
    if (pending.fingerprint !== fingerprint) {
      return keyReuseError()
    }
    return pending.promise
  }

  const promise = run()
  inflight.set(storeKey, { fingerprint, promise })
  try {
    const result = await promise
    if (result.success) {
      try {
        await store.set(storeKey, { fingerprint, result }, config.ttl ?? DEFAULT_TTL)
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
