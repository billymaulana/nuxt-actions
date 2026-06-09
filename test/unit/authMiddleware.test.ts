import { defineAuthMiddleware } from '../../src/runtime/server/utils/authMiddleware'
import { describe, it, expect, vi } from 'vitest'

const fakeEvent = {} as never
const next = vi.fn(async (opts?: { ctx: Record<string, unknown> }) => opts?.ctx ?? {})

describe('defineAuthMiddleware', () => {
  it('sets ctx.user via next when a user is resolved', async () => {
    next.mockClear()
    const mw = defineAuthMiddleware(() => ({ id: 1 }))
    await mw({ event: fakeEvent, ctx: {}, metadata: {}, next } as never)
    expect(next).toHaveBeenCalledWith({ ctx: { user: { id: 1 } } })
  })

  it('throws 401 when no user and not optional', async () => {
    const mw = defineAuthMiddleware(() => null)
    await expect(mw({ event: fakeEvent, ctx: {}, metadata: {}, next } as never))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
  })

  it('allows anonymous when optional, with user null', async () => {
    next.mockClear()
    const mw = defineAuthMiddleware(() => null, { optional: true })
    await mw({ event: fakeEvent, ctx: {}, metadata: {}, next } as never)
    expect(next).toHaveBeenCalledWith({ ctx: { user: null } })
  })
})
