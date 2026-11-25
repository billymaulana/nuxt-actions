import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { callAction } from '../../src/runtime/server/utils/callAction'
import { defineAction } from '../../src/runtime/server/utils/defineAction'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { defineMiddleware } from '../../src/runtime/server/utils/defineMiddleware'
import { defineStreamAction } from '../../src/runtime/server/utils/defineStreamAction'

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: vi.fn((event: { headers?: Record<string, string> }, name: string) => event.headers?.[name.toLowerCase()]),
  getQuery: vi.fn(() => ({})),
  readBody: vi.fn(),
  readMultipartFormData: vi.fn(),
  createEventStream: vi.fn(),
  setHeader: vi.fn(),
  getRequestIP: vi.fn(() => '127.0.0.1'),
}))

const event = { method: 'POST', path: '/api/report', headers: {} } as never

describe('callAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates the input and returns the handler result', async () => {
    const double = defineAction({
      input: z.object({ value: z.number() }),
      handler: async ({ input }) => ({ doubled: input.value * 2 }),
    })

    await expect(callAction(event, double, { value: 21 })).resolves.toEqual({ success: true, data: { doubled: 42 } })
  })

  it('returns a validation error without running the handler', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const action = defineAction({ input: z.object({ value: z.number() }), handler })

    const result = await callAction(event, action, { value: 'nope' } as never)

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR', statusCode: 422 } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs the middleware with the given event and passes its context on', async () => {
    const seen: unknown[] = []
    const withUser = defineMiddleware(async ({ event: received, next }) => {
      seen.push(received)
      return next({ ctx: { userId: 7 } })
    })
    const action = defineAction({
      middleware: [withUser],
      handler: async ({ ctx }) => ({ userId: (ctx as { userId: number }).userId }),
    })

    await expect(callAction(event, action, undefined)).resolves.toEqual({ success: true, data: { userId: 7 } })
    expect(seen).toEqual([event])
  })

  it('validates the output', async () => {
    const action = defineAction({
      outputSchema: z.object({ id: z.number() }),
      handler: async () => ({ id: 'not a number' }) as never,
    })

    await expect(callAction(event, action, undefined)).resolves.toMatchObject({ success: false, error: { code: 'OUTPUT_VALIDATION_ERROR' } })
  })

  it('returns errors thrown by the handler as a result', async () => {
    const action = defineAction({
      handler: async () => {
        throw createError()
      },
    })

    await expect(callAction(event, action, undefined)).resolves.toMatchObject({ success: false, error: { code: 'NOPE', statusCode: 409 } })
  })

  it('skips idempotency replay even when the request carries a key', async () => {
    const handler = vi.fn(async () => ({ charged: true }))
    const action = defineAction({ idempotency: { required: true }, handler })
    const keyed = { method: 'POST', path: '/api/report', headers: { 'idempotency-key': 'abc' } } as never

    await callAction(keyed, action, undefined)
    await callAction(keyed, action, undefined)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('works with actions built by createActionClient', async () => {
    const action = createActionClient()
      .schema(z.object({ name: z.string() }))
      .action(async ({ input }) => `Hello ${input.name}`)

    await expect(callAction(event, action, { name: 'Ada' })).resolves.toEqual({ success: true, data: 'Hello Ada' })
  })

  it('throws a TypeError for something that is not an action', () => {
    const stream = defineStreamAction({ handler: async () => {} })

    expect(() => callAction(event, stream as never, undefined)).toThrow(TypeError)
    expect(() => callAction(event, (() => {}) as never, undefined)).toThrow(/defineAction or createActionClient/)
  })
})

function createError() {
  return Object.assign(Object.create(null), { code: 'NOPE', message: 'Not allowed', statusCode: 409 })
}
