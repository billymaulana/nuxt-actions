import { describe, it, expect, vi } from 'vitest'
import { buildNamespaceTree, generateNamespaceExport } from '../../src/module'

describe('buildNamespaceTree', () => {
  it('places root actions as top-level leaves', () => {
    const tree = buildNamespaceTree([
      { name: 'createTodo', path: 'create-todo' },
      { name: 'listTodos', path: 'list-todos' },
    ])
    expect(tree.get('createTodo')).toEqual({ kind: 'leaf', constName: 'createTodo' })
    expect(tree.get('listTodos')).toEqual({ kind: 'leaf', constName: 'listTodos' })
  })

  it('nests directory segments as groups', () => {
    const tree = buildNamespaceTree([
      { name: 'authLogin', path: 'auth/login' },
      { name: 'authRegister', path: 'auth/register' },
      { name: 'adminUserStats', path: 'admin/user-stats' },
    ])
    const auth = tree.get('auth')
    expect(auth?.kind).toBe('group')
    if (auth?.kind === 'group') {
      expect(auth.children.get('login')).toEqual({ kind: 'leaf', constName: 'authLogin' })
      expect(auth.children.get('register')).toEqual({ kind: 'leaf', constName: 'authRegister' })
    }
    const admin = tree.get('admin')
    if (admin?.kind === 'group') {
      expect(admin.children.get('userStats')).toEqual({ kind: 'leaf', constName: 'adminUserStats' })
    }
  })

  it('supports deep nesting', () => {
    const tree = buildNamespaceTree([
      { name: 'adminUsersBan', path: 'admin/users/ban' },
    ])
    const admin = tree.get('admin')
    expect(admin?.kind).toBe('group')
    if (admin?.kind === 'group') {
      const users = admin.children.get('users')
      expect(users?.kind).toBe('group')
      if (users?.kind === 'group') {
        expect(users.children.get('ban')).toEqual({ kind: 'leaf', constName: 'adminUsersBan' })
      }
    }
  })

  it('warns and skips when a group name collides with an existing leaf', () => {
    const warn = vi.fn()
    const tree = buildNamespaceTree([
      { name: 'auth', path: 'auth' },
      { name: 'authLogin', path: 'auth/login' },
    ], warn)
    expect(tree.get('auth')).toEqual({ kind: 'leaf', constName: 'auth' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('warns and skips when a leaf collides with an existing group', () => {
    const warn = vi.fn()
    const tree = buildNamespaceTree([
      { name: 'authLogin', path: 'auth/login' },
      { name: 'auth', path: 'auth' },
    ], warn)
    expect(tree.get('auth')?.kind).toBe('group')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('generateNamespaceExport', () => {
  it('emits shorthand for root leaves and aliases for nested ones', () => {
    const lines = generateNamespaceExport([
      { name: 'createTodo', path: 'create-todo' },
      { name: 'authLogin', path: 'auth/login' },
    ])
    const code = lines.join('\n')
    expect(code).toContain('export const actions = Object.freeze({')
    expect(code).toContain('  createTodo,')
    expect(code).toContain('  auth: {')
    expect(code).toContain('    login: authLogin,')
    expect(code).toContain('})')
  })

  it('produces syntactically valid nesting', () => {
    const lines = generateNamespaceExport([
      { name: 'a', path: 'a' },
      { name: 'gB', path: 'g/b' },
      { name: 'gHC', path: 'g/h/c' },
    ])
    const code = lines.join('\n')
    const opens = (code.match(/\{/g) ?? []).length
    const closes = (code.match(/\}/g) ?? []).length
    expect(opens).toBe(closes)
  })

  it('skips the grouped export when an action is named "actions"', () => {
    const warn = vi.fn()
    const lines = generateNamespaceExport([
      { name: 'actions', path: 'actions' },
      { name: 'other', path: 'other' },
    ], warn)
    expect(lines).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
