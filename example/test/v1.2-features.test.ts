import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-actions v1.2 features', async () => {
  await setup({
    server: true,
  })

  // ── Smart cache: tasks store ────────────────────────────────

  it('lists tasks', async () => {
    const res = await $fetch('/api/_actions/list-tasks')
    expect(res.success).toBe(true)
    expect(res.data).toHaveProperty('items')
    expect(Array.isArray(res.data.items)).toBe(true)
  })

  it('reports task stats', async () => {
    const res = await $fetch('/api/_actions/task-stats')
    expect(res.success).toBe(true)
    expect(res.data.total).toBe(res.data.done + res.data.pending)
  })

  it('adds, toggles, and deletes a task', async () => {
    const before = await $fetch('/api/_actions/task-stats')
    const startTotal = before.data.total

    const added = await $fetch('/api/_actions/add-task', {
      method: 'POST',
      body: { title: 'Integration task' },
    })
    expect(added.success).toBe(true)
    expect(added.data.title).toBe('Integration task')
    const id = added.data.id

    const afterAdd = await $fetch('/api/_actions/task-stats')
    expect(afterAdd.data.total).toBe(startTotal + 1)

    const toggled = await $fetch('/api/_actions/toggle-task', {
      method: 'POST',
      body: { id },
    })
    expect(toggled.success).toBe(true)
    expect(toggled.data.done).toBe(true)

    const deleted = await $fetch('/api/_actions/delete-task', {
      method: 'POST',
      body: { id },
    })
    expect(deleted.success).toBe(true)
    expect(deleted.data.removed).toBe(true)

    const afterDelete = await $fetch('/api/_actions/task-stats')
    expect(afterDelete.data.total).toBe(startTotal)
  })

  it('validates an empty task title', async () => {
    const res = await $fetch('/api/_actions/add-task', {
      method: 'POST',
      body: { title: '' },
    })
    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when toggling a missing task', async () => {
    const res = await $fetch('/api/_actions/toggle-task', {
      method: 'POST',
      body: { id: 999999 },
    })
    expect(res.success).toBe(false)
    expect(res.error.code).toBe('NOT_FOUND')
    expect(res.error.statusCode).toBe(404)
  })

  // ── Auth preset ─────────────────────────────────────────────

  it('rejects the account action without a session', async () => {
    const res = await $fetch('/api/_actions/account', { method: 'POST', body: {} })
    expect(res.success).toBe(false)
    expect(res.error.statusCode).toBe(401)
  })

  it('returns account data with a session header', async () => {
    const res = await $fetch('/api/_actions/account', {
      method: 'POST',
      body: {},
      headers: { 'x-demo-session': 'u_42' },
    })
    expect(res.success).toBe(true)
    expect(res.data.user.id).toBe('u_42')
    expect(res.data.user.plan).toBe('pro')
  })

  // ── File uploads ────────────────────────────────────────────

  it('parses an uploaded file into a typed field', async () => {
    const fd = new FormData()
    fd.append('label', 'avatar')
    fd.append('avatar', new Blob(['hello world'], { type: 'text/plain' }), 'hello.txt')

    const res = await $fetch('/api/_actions/upload-avatar', {
      method: 'POST',
      body: fd,
    })
    expect(res.success).toBe(true)
    expect(res.data.filename).toBe('hello.txt')
    expect(res.data.size).toBe(11)
  })

  it('rejects an upload with no file', async () => {
    const fd = new FormData()
    fd.append('label', 'avatar')

    const res = await $fetch('/api/_actions/upload-avatar', {
      method: 'POST',
      body: fd,
    })
    expect(res.success).toBe(false)
    expect(res.error.code).toBe('NO_FILE')
  })

  // ── OpenAPI ─────────────────────────────────────────────────

  it('serves an OpenAPI document', async () => {
    const doc = await $fetch<{ openapi: string, info: { title: string }, paths: Record<string, unknown> }>('/_actions/openapi.json')
    expect(doc.openapi).toMatch(/^3\./)
    expect(doc.info.title).toBe('nuxt-actions example API')
    expect(doc.paths).toBeTypeOf('object')
  })
})
