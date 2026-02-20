import { describe, it, expect } from 'vitest'
import { defineMiddleware, createMiddleware } from '../../src/runtime/server/utils/defineMiddleware'

describe('defineMiddleware', () => {
  it('returns the same function', () => {
    const fn = async ({ next }: { next: () => Promise<unknown> }) => next()
    const middleware = defineMiddleware(fn as never)
    expect(middleware).toBe(fn)
  })

  it('preserves middleware function behavior', async () => {
    const middleware = defineMiddleware(async ({ next }) => {
      return next({ ctx: { test: true } })
    })

    let receivedCtx: unknown = null
    await middleware({
      event: {} as never,
      ctx: {},
      next: async (opts) => {
        receivedCtx = opts?.ctx
        return receivedCtx as Record<string, unknown>
      },
    })

    expect(receivedCtx).toEqual({ test: true })
  })
})

describe('createMiddleware', () => {
  it('is the same function as defineMiddleware', () => {
    expect(createMiddleware).toBe(defineMiddleware)
  })

  it('works identically to defineMiddleware', async () => {
    const middleware = createMiddleware(async ({ next }) => {
      return next({ ctx: { published: true } })
    })

    let receivedCtx: unknown = null
    await middleware({
      event: {} as never,
      ctx: {},
      next: async (opts) => {
        receivedCtx = opts?.ctx
        return receivedCtx as Record<string, unknown>
      },
    })

    expect(receivedCtx).toEqual({ published: true })
  })
})
