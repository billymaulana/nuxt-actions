import { buildActionsDescription } from '../../src/devtools'
import { describe, it, expect } from 'vitest'

describe('buildActionsDescription', () => {
  it('shows empty state when no actions', () => {
    expect(buildActionsDescription([])).toMatch(/No action files found/)
  })

  it('lists each action with endpoint and a curl snippet', () => {
    const out = buildActionsDescription([
      { name: 'createTodo', path: 'create-todo', method: 'POST' },
    ])
    expect(out).toContain('POST')
    expect(out).toContain('createTodo')
    expect(out).toContain('/api/_actions/create-todo')
    expect(out).toContain('curl')
    expect(out).toContain('-X POST')
  })

  it('uses a query-style curl hint for GET', () => {
    const out = buildActionsDescription([
      { name: 'listTodos', path: 'list-todos', method: 'GET' },
    ])
    expect(out).toContain('/api/_actions/list-todos')
    expect(out).toContain('curl')
  })
})
