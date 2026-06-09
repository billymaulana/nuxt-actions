import { parseArgs, actionFileName, buildActionContents } from '../../bin/nuxt-actions.mjs'
import { describe, it, expect } from 'vitest'

describe('parseArgs', () => {
  it('parses name with defaults (post, server/actions, zod)', () => {
    expect(parseArgs(['add', 'create-todo'])).toEqual({
      name: 'create-todo', method: 'post', dir: 'server/actions', schema: 'zod',
    })
  })

  it('parses method, dir, schema flags', () => {
    expect(parseArgs(['add', 'list-todos', '--method', 'get', '--schema', 'none'])).toEqual({
      name: 'list-todos', method: 'get', dir: 'server/actions', schema: 'none',
    })
  })

  it('errors on missing name', () => {
    expect(parseArgs(['add']).error).toMatch(/Missing action name/)
  })

  it('errors on invalid method', () => {
    expect(parseArgs(['add', 'x', '--method', 'fetch']).error).toMatch(/Invalid method/)
  })

  it('errors on invalid name pattern', () => {
    expect(parseArgs(['add', 'Create_Todo']).error).toMatch(/Invalid name/)
  })

  it('errors on unknown command', () => {
    expect(parseArgs(['remove', 'x']).error).toMatch(/Unknown command/)
  })
})

describe('actionFileName', () => {
  it('post uses no suffix', () => {
    expect(actionFileName('create-todo', 'post')).toBe('create-todo.ts')
  })
  it('non-post uses method suffix', () => {
    expect(actionFileName('list-todos', 'get')).toBe('list-todos.get.ts')
  })
})

describe('buildActionContents', () => {
  it('zod template includes input and import', () => {
    const out = buildActionContents({ schema: 'zod' })
    expect(out).toContain(`import { z } from 'zod'`)
    expect(out).toContain('input: z.object(')
    expect(out).toContain('handler: async ({ input })')
  })

  it('none template omits input and import', () => {
    const out = buildActionContents({ schema: 'none' })
    expect(out).not.toContain('zod')
    expect(out).not.toContain('input:')
    expect(out).toContain('handler: async () =>')
  })
})
