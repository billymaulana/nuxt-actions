import { registerTags, keysForTags } from '../../src/runtime/composables/_tagRegistry'
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
})
