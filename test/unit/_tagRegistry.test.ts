import { registerTags, keysForTags, unregisterTags } from '../../src/runtime/composables/_tagRegistry'
import { describe, it, expect, beforeEach, vi } from 'vitest'

let app: { _actionTags?: Map<string, Set<string>> }
vi.mock('#app', () => ({
  useNuxtApp: () => app,
}))

describe('_tagRegistry', () => {
  beforeEach(() => {
    app = {}
  })

  it('registers tags for a key and resolves them', () => {
    registerTags('action:/api/_actions/list-todos:{}', ['todos'])
    expect(keysForTags(['todos'])).toContain('action:/api/_actions/list-todos:{}')
  })

  it('unions tags on re-register', () => {
    registerTags('k1', ['todos'])
    registerTags('k1', ['list'])
    expect(keysForTags(['todos'])).toContain('k1')
    expect(keysForTags(['list'])).toContain('k1')
  })

  it('returns empty for an unknown tag', () => {
    registerTags('k1', ['todos'])
    expect(keysForTags(['nope'])).toEqual([])
  })

  it('ignores empty tag arrays', () => {
    registerTags('k1', [])
    expect(keysForTags([])).toEqual([])
  })

  it('isolates registry per nuxtApp instance (no cross-request bleed)', () => {
    registerTags('k1', ['todos'])
    expect(keysForTags(['todos'])).toContain('k1')
    app = {}
    expect(keysForTags(['todos'])).toEqual([])
  })

  it('resolves several keys under one tag without scanning every key', () => {
    registerTags('k1', ['todos'])
    registerTags('k2', ['todos'])
    registerTags('k3', ['user'])
    const keys = keysForTags(['todos'])
    expect(keys).toContain('k1')
    expect(keys).toContain('k2')
    expect(keys).not.toContain('k3')
  })

  it('dedupes keys spanning multiple requested tags', () => {
    registerTags('k1', ['todos', 'user'])
    expect(keysForTags(['todos', 'user'])).toEqual(['k1'])
  })

  it('unregisterTags removes a key and prunes empty tags', () => {
    registerTags('k1', ['todos'])
    registerTags('k2', ['todos'])
    unregisterTags('k1', ['todos'])
    expect(keysForTags(['todos'])).toEqual(['k2'])

    unregisterTags('k2', ['todos'])
    expect(keysForTags(['todos'])).toEqual([])
    expect(app._actionTags?.has('todos')).toBe(false)
  })

  it('unregisterTags is a no-op for unknown keys/tags/empty arrays', () => {
    registerTags('k1', ['todos'])
    expect(() => unregisterTags('k1', [])).not.toThrow()
    expect(() => unregisterTags('missing', ['todos'])).not.toThrow()
    expect(() => unregisterTags('k1', ['unknown-tag'])).not.toThrow()
    expect(keysForTags(['todos'])).toEqual(['k1'])
  })
})
