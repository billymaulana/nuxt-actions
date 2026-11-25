import { createHash } from 'node:crypto'
import type { ActionCacheConfig, ActionCacheEntry, ActionCacheStore, ActionResult } from '../../types'
import type { ServerEvent } from './server-runtime'

const DEFAULT_MAX_ENTRIES = 10_000
const NO_KEY = '_'
const ROUTE_PREFIX = '/api/_actions/'

interface Computation {
  promise: Promise<ActionResult<unknown>>
  startedAt: number
  /** False once the computation was invalidated or replaced, so its result is not stored. */
  current: boolean
}

const computations = new Map<string, Computation>()
let store: ActionCacheStore | undefined

export class UncacheableInput extends TypeError {
  constructor() {
    super('[nuxt-actions] This input cannot be used as a cache key: it has no JSON form, or it refers to itself.')
  }
}

export function createMemoryStore(options: { maxEntries?: number } = {}): ActionCacheStore {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const entries = new Map<string, { entry: ActionCacheEntry, expiresAt: number }>()

  return {
    get(key) {
      const stored = entries.get(key)
      if (!stored) return undefined
      if (Date.now() >= stored.expiresAt) {
        entries.delete(key)
        return undefined
      }
      return stored.entry
    },
    set(key, entry, ttlMs) {
      const copy = JSON.parse(JSON.stringify(entry)) as ActionCacheEntry
      entries.delete(key)
      entries.set(key, { entry: copy, expiresAt: Date.now() + ttlMs })
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value as string)
      }
    },
    delete(key) {
      entries.delete(key)
    },
    clear(prefix) {
      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) entries.delete(key)
      }
    },
  }
}

export function currentStore(): ActionCacheStore {
  store ??= createMemoryStore()
  return store
}

export function replaceStore(next: ActionCacheStore): void {
  store = next
}

export function assertCacheConfig(config: { maxAge: number, staleMaxAge?: number }, hasInputSchema: boolean): void {
  if (!(Number.isFinite(config.maxAge) && config.maxAge > 0)) {
    throw new TypeError('[nuxt-actions] cache.maxAge must be a positive, finite number of seconds.')
  }
  if (config.staleMaxAge !== undefined && !(Number.isFinite(config.staleMaxAge) && config.staleMaxAge >= 0)) {
    throw new TypeError('[nuxt-actions] cache.staleMaxAge must be a finite number of seconds, zero or more.')
  }
  if (!hasInputSchema) {
    throw new TypeError('[nuxt-actions] cache needs an input schema that drops unknown keys, or every new query parameter becomes a new cache entry. Use z.object({}).optional() for an action without input.')
  }
}

/** Accept `todos/list` as well as the route path `/api/_actions/todos/list`, with or without slashes around it. */
export function actionPathOf(path: string): string {
  const withoutRoute = path.startsWith(ROUTE_PREFIX) ? path.slice(ROUTE_PREFIX.length) : path
  return withoutRoute.replace(/^\/+|\/+$/g, '')
}

/*
 * Keys are `<path>:<key or _>:<input hash>`. Escaping keeps every segment free
 * of ':', '/', '?', and '#', so a prefix never matches another path or key, even
 * in stores that split or cut keys at those characters, and a key of exactly
 * '_' is escaped so it cannot pass for "no key".
 */
function escapeSegment(value: string): string {
  return value.replace(/[%:/\\?#]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function keySegment(key: string | undefined): string {
  if (key === undefined) return NO_KEY
  return key === NO_KEY ? '%5F' : escapeSegment(key)
}

export function actionPrefix(path: string): string {
  return `${escapeSegment(path)}:`
}

export function keyPrefix(path: string, key: string | undefined): string {
  return `${actionPrefix(path)}${keySegment(key)}:`
}

/**
 * Throws UncacheableInput when the input has no JSON form: a function, a
 * symbol, a cycle, or a class instance without `toJSON`.
 */
export function entryKey(path: string, key: string | undefined, input: unknown): string {
  return `${keyPrefix(path, key)}${createHash('sha256').update(serializeInput(input, new Set())).digest('hex')}`
}

/*
 * Unlike JSON, this keeps apart values that JSON merges (undefined and null,
 * NaN and Infinity, a Date and its ISO string, a Map and an object), and it
 * ignores the order of object keys and of Map and Set members.
 */
function serializeInput(value: unknown, seen: Set<object>): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : String(value)
    case 'bigint':
      return `${value}n`
    case 'boolean':
    case 'undefined':
      return String(value)
    case 'object':
      return value === null ? 'null' : serializeObject(value, seen)
    default:
      throw new UncacheableInput()
  }
}

function serializeObject(value: object, seen: Set<object>): string {
  if (seen.has(value)) throw new UncacheableInput()
  seen.add(value)
  try {
    if (Array.isArray(value)) return `[${Array.from(value, item => serializeInput(item, seen)).join(',')}]`
    if (value instanceof Date) return `D${JSON.stringify(Number.isNaN(value.getTime()) ? null : value.toISOString())}`
    if (value instanceof RegExp) return `R${JSON.stringify(String(value))}`
    if (value instanceof Map) {
      return `M[${Array.from(value, ([key, item]) => `${serializeInput(key, seen)}=>${serializeInput(item, seen)}`).sort().join(',')}]`
    }
    if (value instanceof Set) return `S[${Array.from(value, item => serializeInput(item, seen)).sort().join(',')}]`

    const prototype = Object.getPrototypeOf(value)
    if (prototype === Object.prototype || prototype === null) {
      const record = value as Record<string, unknown>
      return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${serializeInput(record[key], seen)}`).join(',')}}`
    }
    const { toJSON } = value as { toJSON?: unknown }
    if (typeof toJSON === 'function') return `J${serializeInput(toJSON.call(value), seen)}`
    throw new UncacheableInput()
  }
  finally {
    seen.delete(value)
  }
}

/**
 * Stop computations whose entry key matches, so they do not store a result
 * computed before the data changed and later requests compute again.
 */
export function forgetComputations(matches: (key: string) => boolean): void {
  for (const [key, computation] of computations) {
    if (matches(key)) {
      computation.current = false
      computations.delete(key)
    }
  }
}

/**
 * Serve a result from the cache, or produce and store it. Concurrent requests
 * for the same entry share one computation, and with `swr` a stale result is
 * served while it is refreshed in the background. An input that cannot be
 * keyed runs without the cache.
 *
 * Time: building the key is linear in the size of the input, plus sorting the
 * keys of each object, Map, and Set in it; then one store read, and on a miss
 * one store write. Space: one pending computation per entry being produced.
 */
export async function runCached<TInput, TCtx, T>(
  path: string,
  config: ActionCacheConfig<TInput, TCtx>,
  args: { input: TInput, ctx: TCtx, event: ServerEvent },
  produce: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const extraKey = await config.key?.(args)
  let key: string
  try {
    key = entryKey(path, extraKey, args.input)
  }
  catch (error) {
    if (error instanceof UncacheableInput) return produce()
    throw error
  }

  const entry = await attempt(() => currentStore().get(key))
  const compute = (computation: Computation) => produceAndStore(key, config, produce, computation)

  if (entry && Date.now() < entry.staleAt) {
    return { success: true, data: entry.value as T }
  }
  if (entry && config.swr) {
    const refresh = shared(key, config.maxAge * 1000, compute).then(ignore, ignore)
    keepAlive(args.event, refresh)
    return { success: true, data: entry.value as T }
  }
  return shared(key, config.maxAge * 1000, compute)
}

async function produceAndStore<T>(
  key: string,
  config: { maxAge: number, swr?: boolean, staleMaxAge?: number },
  produce: () => Promise<ActionResult<T>>,
  computation: Computation,
): Promise<ActionResult<T>> {
  const result = await produce()
  if (result.success && computation.current) {
    const freshMs = config.maxAge * 1000
    const staleMs = config.swr ? (config.staleMaxAge ?? config.maxAge) * 1000 : 0
    const entry: ActionCacheEntry = { value: result.data, staleAt: Date.now() + freshMs }
    await attempt(() => currentStore().set(key, entry, freshMs + staleMs))
    if (!computation.current) await attempt(() => currentStore().delete(key))
  }
  return result
}

/**
 * Join the computation already running for `key`, unless it has run longer
 * than `maxAgeMs`; then a new one replaces it, so a request that never settles
 * cannot hold up the entry, and the replaced one no longer stores its result.
 */
function shared<T>(
  key: string,
  maxAgeMs: number,
  compute: (computation: Computation) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const running = computations.get(key)
  if (running && Date.now() - running.startedAt < maxAgeMs) {
    return running.promise as Promise<ActionResult<T>>
  }
  if (running) running.current = false

  const computation = { startedAt: Date.now(), current: true } as Computation
  computations.set(key, computation)
  const promise = compute(computation).finally(() => {
    if (computations.get(key) === computation) computations.delete(key)
  })
  computation.promise = promise
  return promise
}

function keepAlive(event: ServerEvent, promise: Promise<void>): void {
  const { waitUntil } = event as { waitUntil?: (promise: Promise<unknown>) => void }
  if (typeof waitUntil === 'function') {
    waitUntil.call(event, promise)
  }
}

async function attempt<T>(operation: () => T | Promise<T>): Promise<T | undefined> {
  try {
    return await operation()
  }
  catch (error) {
    /* v8 ignore start -- import.meta.dev is a compile-time constant set by Nuxt */
    if (import.meta.dev) {
      console.warn('[nuxt-actions] The action cache store failed, so the action ran without the cache:', error)
    }
    /* v8 ignore stop */
    return undefined
  }
}

function ignore(): void {}
