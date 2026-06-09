import { refreshNuxtData, clearNuxtData, useNuxtApp } from '#app'
import type { TypedActionReference } from '../types'
import { keysForTags } from './_tagRegistry'

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
 * Collect the keys of registered action queries matching a prefix.
 * `refreshNuxtData` only accepts explicit keys, so prefix matching is resolved here.
 */
function actionKeys(prefix: string): string[] {
  const registry = useNuxtApp()._asyncData ?? {}
  return Object.keys(registry).filter(key => key.startsWith(prefix))
}

/**
 * Invalidate (refetch) cached data for action queries.
 *
 * - Pass a typed action reference or string path to invalidate a specific action
 * - Pass an array to invalidate several actions in one refresh
 * - Call without arguments to invalidate ALL action queries
 *
 * @example
 * ```ts
 * import { listTodos, searchTodos } from '#actions'
 * await invalidateActions(listTodos)
 * await invalidateActions([listTodos, searchTodos])
 * await invalidateActions() // all
 * ```
 */
export async function invalidateActions(
  target?: string | TypedActionReference | Array<string | TypedActionReference>,
): Promise<void> {
  let keys: string[]
  if (Array.isArray(target)) {
    const all = new Set<string>()
    for (const item of target) {
      for (const key of actionKeys(resolvePrefix(item))) all.add(key)
    }
    keys = [...all]
  }
  else {
    const prefix = target ? resolvePrefix(target) : CACHE_PREFIX
    keys = actionKeys(prefix)
  }
  if (keys.length > 0) {
    await refreshNuxtData(keys)
  }
}

/**
 * Invalidate (refetch) action queries registered under one or more tags.
 *
 * @example
 * ```ts
 * await invalidateTags('todos')
 * await invalidateTags(['todos', 'user'])
 * ```
 */
export async function invalidateTags(tags: string | string[]): Promise<void> {
  const list = Array.isArray(tags) ? tags : [tags]
  const keys = keysForTags(list)
  if (keys.length > 0) {
    await refreshNuxtData(keys)
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
