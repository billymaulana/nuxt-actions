import { describe, it, expect } from 'vitest'
import { getRequestMethod, getRequestPath } from '../../src/runtime/server/internal/nitro2'
import type { ServerEvent } from '../../src/runtime/server/internal/nitro2'

function h3Event(method: string, path: string): ServerEvent {
  return { method, path } as unknown as ServerEvent
}

describe('nitro2 server runtime', () => {
  it('getRequestMethod returns the h3 event method', () => {
    expect(getRequestMethod(h3Event('DELETE', '/api/_actions/a'))).toBe('DELETE')
  })

  it('getRequestPath returns the pathname without query', () => {
    expect(getRequestPath(h3Event('GET', '/api/_actions/a?x=1&y=2'))).toBe('/api/_actions/a')
  })

  it('getRequestPath keeps a path that has no query', () => {
    expect(getRequestPath(h3Event('GET', '/api/_actions/nested/b'))).toBe('/api/_actions/nested/b')
  })
})
