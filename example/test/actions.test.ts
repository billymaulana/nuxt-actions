import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-actions CRUD', async () => {
  await setup({
    server: true,
  })

  it('lists todos', async () => {
    const res = await $fetch('/api/_actions/list-todos')
    expect(res.success).toBe(true)
    expect(res.data).toHaveProperty('items')
    expect(res.data.items).toHaveLength(2)
    expect(res.data.items[0].title).toBe('Learn Nuxt')
  })

  it('creates a todo with valid input', async () => {
    const res = await $fetch('/api/_actions/create-todo', {
      method: 'POST',
      body: { title: 'Integration test todo' },
    })
    expect(res.success).toBe(true)
    expect(res.data).toHaveProperty('id')
    expect(res.data.title).toBe('Integration test todo')
    expect(res.data.done).toBe(false)
  })

  it('rejects creating a todo with empty title', async () => {
    const res = await $fetch('/api/_actions/create-todo', {
      method: 'POST',
      body: { title: '' },
    })

    expect(res.success).toBe(false)
    expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  it('toggles a todo', async () => {
    const res = await $fetch('/api/_actions/toggle-todo', {
      method: 'POST',
      body: { id: 1, done: true },
    })
    expect(res.success).toBe(true)
    expect(res.data.id).toBe(1)
    expect(res.data.done).toBe(true)
    expect(res.data).toHaveProperty('updatedAt')
  })

  it('searches todos with query', async () => {
    const res = await $fetch('/api/_actions/search-todos?q=Nuxt')
    expect(res.success).toBe(true)
    expect(res.data).toHaveProperty('items')
    expect(res.data).toHaveProperty('total')
    expect(res.data.items.length).toBeGreaterThanOrEqual(1)
  })

  it('returns all todos when search query is empty', async () => {
    const res = await $fetch('/api/_actions/search-todos')
    expect(res.success).toBe(true)
    expect(res.data.items).toHaveLength(5)
    expect(res.data.total).toBe(5)
  })
})
