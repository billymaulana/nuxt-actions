/* eslint-disable @typescript-eslint/no-explicit-any */
import { readBody } from 'h3'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { createActionError } from '../../src/runtime/server/utils/defineAction'
import type { StandardSchemaV1 } from '../../src/runtime/types'

// Mock h3 functions
vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: vi.fn(),
  getQuery: vi.fn(),
}))

function createMockEvent(method = 'POST'): { method: string, path: string } {
  return { method, path: '/api/test' }
}

function createMockSchema<TOutput>(
  validateFn: (value: unknown) => StandardSchemaV1.Result<TOutput>,
): StandardSchemaV1<unknown, TOutput> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validateFn,
    },
  }
}

describe('createActionClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a basic action with schema', async () => {
    vi.mocked(readBody).mockResolvedValue({ title: 'Hello' })

    const schema = createMockSchema(value => ({ value: value as { title: string } }))

    const client = createActionClient()
    const handler = client
      .schema(schema)
      .action(async ({ input }) => ({ id: 1, title: (input as { title: string }).title }))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toEqual({
      success: true,
      data: { id: 1, title: 'Hello' },
    })
  })

  it('chains middleware and passes context', async () => {
    vi.mocked(readBody).mockResolvedValue({ data: 'test' })

    const authMiddleware = async ({ next }: any) => {
      return next({ ctx: { userId: 42 } })
    }

    const logMiddleware = async ({ next }: any) => {
      return next({ ctx: { logged: true } })
    }

    const schema = createMockSchema(value => ({ value: value as { data: string } }))

    const client = createActionClient()
      .use(authMiddleware as any)
      .use(logMiddleware as any)

    const handler = client
      .schema(schema)
      .action(async ({ input, ctx }) => ({
        data: (input as { data: string }).data,
        userId: (ctx as any).userId,
        logged: (ctx as any).logged,
      }))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toEqual({
      success: true,
      data: { data: 'test', userId: 42, logged: true },
    })
  })

  it('supports initial middleware in constructor', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const mw = async ({ next }: any) => next({ ctx: { init: true } })
    const schema = createMockSchema(value => ({ value }))

    const client = createActionClient({ middleware: [mw as any] })
    const handler = client
      .schema(schema)
      .action(async ({ ctx }) => ({ init: (ctx as any).init }))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toEqual({ success: true, data: { init: true } })
  })

  it('supports output schema validation', async () => {
    vi.mocked(readBody).mockResolvedValue({ name: 'test' })

    const inputSchema = createMockSchema(value => ({ value: value as { name: string } }))
    const outputSchema = createMockSchema((value) => {
      const v = value as { id?: number }
      if (typeof v.id !== 'number') {
        return { issues: [{ message: 'id must be a number', path: ['id'] }] }
      }
      return { value: v as { id: number } }
    })

    const handler = createActionClient()
      .schema(inputSchema)
      .outputSchema(outputSchema)
      .action(async () => ({ id: 'not-a-number' }))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'OUTPUT_VALIDATION_ERROR',
      },
    })
  })

  it('supports metadata', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const schema = createMockSchema(value => ({ value }))

    // Metadata doesn't affect behavior directly, but should not break the chain
    const handler = createActionClient()
      .metadata({ role: 'admin' })
      .schema(schema)
      .metadata({ action: 'create' })
      .action(async () => ({ ok: true }))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toEqual({ success: true, data: { ok: true } })
  })

  it('is immutable — creating new builders does not affect previous ones', async () => {
    vi.mocked(readBody).mockResolvedValue({ data: 'test' })

    const mw1 = async ({ next }: any) => next({ ctx: { a: 1 } })
    const mw2 = async ({ next }: any) => next({ ctx: { b: 2 } })

    const base = createActionClient().use(mw1 as any)
    const branch1 = base.use(mw2 as any)

    const schema = createMockSchema(value => ({ value }))

    // base should only have mw1
    const handler1 = base
      .schema(schema)
      .action(async ({ ctx }) => ctx)

    const result1 = await (handler1 as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result1).toEqual({ success: true, data: { a: 1 } })

    // branch1 should have both mw1 and mw2
    const handler2 = branch1
      .schema(schema)
      .action(async ({ ctx }) => ctx)

    const result2 = await (handler2 as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result2).toEqual({ success: true, data: { a: 1, b: 2 } })
  })

  it('handles validation errors in schema', async () => {
    vi.mocked(readBody).mockResolvedValue({ name: '' })

    const schema = createMockSchema(() => {
      return { issues: [{ message: 'Name is required', path: ['name'] }] }
    })

    const handler = createActionClient()
      .schema(schema)
      .action(async ({ input }) => input)

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        statusCode: 422,
      },
    })
  })

  it('creates an action without schema (schema-less)', async () => {
    const handler = createActionClient()
      .action(async () => ([
        { id: '1', title: 'Learn Nuxt', done: true },
        { id: '2', title: 'Build app', done: false },
      ]))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('GET'))
    expect(result).toEqual({
      success: true,
      data: [
        { id: '1', title: 'Learn Nuxt', done: true },
        { id: '2', title: 'Build app', done: false },
      ],
    })
  })

  it('creates schema-less action with middleware', async () => {
    const mw = async ({ next }: any) => next({ ctx: { userId: 42 } })

    const handler = createActionClient()
      .use(mw as any)
      .action(async ({ ctx }) => ({
        userId: (ctx as any).userId,
      }))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('GET'))
    expect(result).toEqual({
      success: true,
      data: { userId: 42 },
    })
  })

  it('handles middleware errors', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const mw = async () => {
      throw createActionError({
        code: 'UNAUTHORIZED',
        message: 'Not allowed',
        statusCode: 401,
      })
    }

    const schema = createMockSchema(value => ({ value }))

    const handler = createActionClient()
      .use(mw as any)
      .schema(schema)
      .action(async () => ({ ok: true }))

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        statusCode: 401,
      },
    })
  })

  it('uses handleServerError for unknown errors', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = createActionClient({
      handleServerError: error => ({
        code: 'CUSTOM_ERROR',
        message: `Handled: ${error.message}`,
        statusCode: 503,
      }),
    })
      .action(async () => {
        throw new Error('Database connection failed')
      })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'CUSTOM_ERROR',
        message: 'Handled: Database connection failed',
        statusCode: 503,
      },
    })
  })

  it('handleServerError does not interfere with ActionError', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = createActionClient({
      handleServerError: () => ({
        code: 'SHOULD_NOT_REACH',
        message: 'This should not be called',
      }),
    })
      .action(async () => {
        throw createActionError({
          code: 'FORBIDDEN',
          message: 'Access denied',
          statusCode: 403,
        })
      })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied',
        statusCode: 403,
      },
    })
  })
})
