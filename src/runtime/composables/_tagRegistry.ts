import { useNuxtApp } from '#app'

type Registry = Map<string, Set<string>>

function getRegistry(): Registry {
  const app = useNuxtApp() as unknown as { _actionTags?: Registry }
  return (app._actionTags ??= new Map())
}

export function registerTags(key: string, tags: string[]): void {
  if (tags.length === 0) return
  const registry = getRegistry()
  const existing = registry.get(key) ?? new Set<string>()
  for (const tag of tags) existing.add(tag)
  registry.set(key, existing)
}

export function keysForTags(tags: string[]): string[] {
  if (tags.length === 0) return []
  const wanted = new Set(tags)
  const keys: string[] = []
  for (const [key, keyTags] of getRegistry()) {
    for (const tag of keyTags) {
      if (wanted.has(tag)) {
        keys.push(key)
        break
      }
    }
  }
  return keys
}
