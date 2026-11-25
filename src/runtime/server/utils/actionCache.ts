import { actionPathOf, actionPrefix, createMemoryStore, currentStore, entryKey, forgetComputations, keyPrefix, replaceStore } from '../internal/actionCache'
import type { ActionCacheInvalidation, ActionCacheStore } from '../../types'

const STORE_METHODS = ['get', 'set', 'delete', 'clear'] as const

/**
 * Create the in-memory store the action cache uses by default. Entries live
 * in this server process only, so an app running on several instances needs
 * a shared store such as Redis.
 *
 * `get` and `delete` are O(1); `set` stores the JSON form of the value, linear
 * in its size; `clear` scans every entry, O(n). Memory is bounded by
 * `maxEntries` (default 10,000) times the size of a result, dropping the
 * oldest entry first.
 */
export function createMemoryActionCacheStore(options: { maxEntries?: number } = {}): ActionCacheStore {
  return createMemoryStore(options)
}

/**
 * Replace the store behind the action cache, typically from a Nitro plugin.
 *
 * @example
 * ```ts
 * export default defineNitroPlugin(() => {
 *   setActionCacheStore(createMemoryActionCacheStore({ maxEntries: 50_000 }))
 * })
 * ```
 */
export function setActionCacheStore(store: ActionCacheStore): void {
  if (!STORE_METHODS.every(method => typeof store?.[method] === 'function')) {
    throw new TypeError('[nuxt-actions] setActionCacheStore expects a store with get, set, delete, and clear functions.')
  }
  replaceStore(store)
}

/**
 * Drop cached results of an action, usually in the action that changed its
 * data. Without options every result of the action goes; `key` narrows it to
 * one key, and `input` to the result for one input. A result still being
 * computed when this runs is not stored.
 *
 * @example
 * ```ts
 * await invalidateActionCache('todos/list', { key: String(ctx.user.id) })
 * ```
 */
export async function invalidateActionCache(path: string, options: ActionCacheInvalidation = {}): Promise<void> {
  const actionPath = actionPathOf(path)
  const store = currentStore()
  if (options.input !== undefined) {
    const key = entryKey(actionPath, options.key, options.input)
    forgetComputations(running => running === key)
    await store.delete(key)
    return
  }
  const prefix = options.key === undefined ? actionPrefix(actionPath) : keyPrefix(actionPath, options.key)
  forgetComputations(running => running.startsWith(prefix))
  await store.clear(prefix)
}
