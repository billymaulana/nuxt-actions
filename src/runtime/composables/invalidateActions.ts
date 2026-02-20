import { refreshNuxtData, clearNuxtData } from '#app'
import type { TypedActionReference } from '../types'

const CACHE_PREFIX = 'action:'

/**
 * Resolve the cache key prefix for a given action path or typed reference.
 */
function resolvePrefix(actionOrPath: string | TypedActionReference): string {
  if (typeof actionOrPath === 'string') {
    return `${CACHE_PREFIX}${actionOrPath}:`
  }
  return `${CACHE_PREFIX}/api/_actions/${actionOrPath.__actionPath}:`
}

/**
 * Invalidate (refetch) cached data for action queries.
 *
 * - Pass a typed action reference or string path to invalidate a specific action
 * - Call without arguments to invalidate ALL action queries
 *
 * @example
 * ```ts
 * import { listTodos } from '#actions'
 * // Invalidate a specific action's cached data
 * await invalidateActions(listTodos)
 * // Invalidate all action queries
 * await invalidateActions()
 * ```
 */
export async function invalidateActions(
  actionOrPath?: string | TypedActionReference,
): Promise<void> {
  if (actionOrPath) {
    const prefix = resolvePrefix(actionOrPath)
    await refreshNuxtData((key) => {
      if (typeof key !== 'string') return false
      return key.startsWith(prefix)
    })
  }
  else {
    await refreshNuxtData((key) => {
      if (typeof key !== 'string') return false
      return key.startsWith(CACHE_PREFIX)
    })
  }
}

/**
 * Clear cached data for action queries without refetching.
 *
 * - Pass a typed action reference or string path to clear a specific action
 * - Call without arguments to clear ALL action query caches
 *
 * @example
 * ```ts
 * import { listTodos } from '#actions'
 * clearActionCache(listTodos)
 * clearActionCache() // clear all
 * ```
 */
export function clearActionCache(
  actionOrPath?: string | TypedActionReference,
): void {
  if (actionOrPath) {
    const prefix = resolvePrefix(actionOrPath)
    clearNuxtData((key) => {
      if (typeof key !== 'string') return false
      return key.startsWith(prefix)
    })
  }
  else {
    clearNuxtData((key) => {
      if (typeof key !== 'string') return false
      return key.startsWith(CACHE_PREFIX)
    })
  }
}
