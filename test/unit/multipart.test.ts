import { foldMultipartData } from '../../src/runtime/server/utils/defineAction'
import { describe, it, expect } from 'vitest'

describe('foldMultipartData', () => {
  it('folds text fields into strings', () => {
    const out = foldMultipartData([
      { name: 'title', data: Buffer.from('hello') },
    ])
    expect(out).toEqual({ title: 'hello' })
  })

  it('folds file fields into ActionFile objects', () => {
    const data = Buffer.from('binary')
    const out = foldMultipartData([
      { name: 'avatar', filename: 'a.png', type: 'image/png', data },
    ])
    expect(out).toEqual({ avatar: { filename: 'a.png', type: 'image/png', data } })
  })

  it('defaults file type to octet-stream', () => {
    const out = foldMultipartData([
      { name: 'f', filename: 'x.bin', data: Buffer.from('1') },
    ]) as { f: { type: string } }
    expect(out.f.type).toBe('application/octet-stream')
  })

  it('collects repeated names into arrays', () => {
    const out = foldMultipartData([
      { name: 'tags', data: Buffer.from('a') },
      { name: 'tags', data: Buffer.from('b') },
    ])
    expect(out).toEqual({ tags: ['a', 'b'] })
  })

  it('skips parts without a name', () => {
    const out = foldMultipartData([
      { data: Buffer.from('x') },
      { name: 'ok', data: Buffer.from('y') },
    ])
    expect(out).toEqual({ ok: 'y' })
  })
})
