import { useNuxtApp } from '#app'

/* Indexed tag -> keys so a mutation resolves affected keys in O(matching keys), not O(all keys x tags). */
type Registry = Map<string, Set<string>>

function getRegistry(): Registry {
  const app = useNuxtApp() as unknown as { _actionTags?: Registry }
  return (app._actionTags ??= new Map())
}

export function registerTags(key: string, tags: string[]): void {
  if (tags.length === 0) return
  const registry = getRegistry()
  for (const tag of tags) {
    const keys = registry.get(tag) ?? new Set<string>()
    keys.add(key)
    registry.set(tag, keys)
  }
}

export function unregisterTags(key: string, tags: string[]): void {
  if (tags.length === 0) return
  const registry = getRegistry()
  for (const tag of tags) {
    const keys = registry.get(tag)
    if (!keys) continue
    keys.delete(key)
    if (keys.size === 0) registry.delete(tag)
  }
}

export function keysForTags(tags: string[]): string[] {
  if (tags.length === 0) return []
  const registry = getRegistry()
  const out = new Set<string>()
  for (const tag of tags) {
    const keys = registry.get(tag)
    if (keys) {
      for (const key of keys) out.add(key)
    }
  }
  return [...out]
}
