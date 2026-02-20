import { readBody, getQuery, getHeader } from 'h3'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineAction, createActionError, formatStandardIssues } from '../../src/runtime/server/utils/defineAction'
import type { StandardSchemaV1 } from '../../src/runtime/types'

// Mock h3 functions
vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getHeader: vi.fn(),
}))

function createMockEvent(method = 'POST'): { method: string, path: string } {
  return { method, path: '/api/test' }
}

/**
 * Helper to create a mock Standard Schema compliant object.
 */
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

describe('defineAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('input validation (Standard Schema)', () => {
    it('validates input and returns data on success', async () => {
      vi.mocked(readBody).mockResolvedValue({ name: 'John' })

      const schema = createMockSchema((value) => {
        const v = value as { name?: string }
        if (v.name && v.name.length >= 1) return { value: v as { name: string } }
        return { issues: [{ message: 'Name is required', path: ['name'] }] }
      })

      const handler = defineAction({
        input: schema,
        handler: async ({ input }) => ({ greeting: `Hello, ${(input as { name: string }).name}` }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toEqual({
        success: true,
        data: { greeting: 'Hello, John' },
      })
    })

    it('returns validation error for invalid input', async () => {
      vi.mocked(readBody).mockResolvedValue({ name: '' })

      const schema = createMockSchema((value) => {
        const v = value as { name?: string }
        if (v.name && v.name.length >= 1) return { value: v as { name: string } }
        return { issues: [{ message: 'Name is required', path: ['name'] }] }
      })

      const handler = defineAction({
        input: schema,
        handler: async ({ input }) => input,
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          statusCode: 422,
        },
      })
      expect((result.error as Record<string, unknown>).fieldErrors).toHaveProperty('name')
    })

    it('returns validation error with nested path field errors', async () => {
      vi.mocked(readBody).mockResolvedValue({ user: { email: 'not-an-email' } })

      const schema = createMockSchema(() => {
        return {
          issues: [{
            message: 'Invalid email',
            path: [{ key: 'user' }, { key: 'email' }],
          }],
        }
      })

      const handler = defineAction({
        input: schema,
        handler: async ({ input }) => input,
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toMatchObject({ success: false })
      const fieldErrors = (result.error as Record<string, unknown>).fieldErrors as Record<string, string[]>
      expect(fieldErrors['user.email']).toBeDefined()
    })

    it('works without input schema', async () => {
      vi.mocked(readBody).mockResolvedValue({ anything: 'goes' })

      const handler = defineAction({
        handler: async () => ({ ok: true }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toEqual({ success: true, data: { ok: true } })
    })

    it('uses transformed data from schema validation', async () => {
      vi.mocked(readBody).mockResolvedValue({ count: '5' })

      const schema = createMockSchema((value) => {
        const v = value as { count: string }
        return { value: { count: Number(v.count) } }
      })

      const handler = defineAction({
        input: schema,
        handler: async ({ input }) => ({ count: (input as { count: number }).count }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toEqual({ success: true, data: { count: 5 } })
    })

    it('supports async validation', async () => {
      vi.mocked(readBody).mockResolvedValue({ token: 'valid' })

      const schema: StandardSchemaV1 = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async (value) => {
            await new Promise(resolve => setTimeout(resolve, 1))
            return { value }
          },
        },
      }

      const handler = defineAction({
        input: schema,
        handler: async ({ input }) => ({ received: input }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toEqual({
        success: true,
        data: { received: { token: 'valid' } },
      })
    })

    it('handles issues without path (maps to _root)', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const schema = createMockSchema(() => {
        return { issues: [{ message: 'Invalid input' }] }
      })

      const handler = defineAction({
        input: schema,
        handler: async ({ input }) => input,
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      const fieldErrors = (result.error as Record<string, unknown>).fieldErrors as Record<string, string[]>
      expect(fieldErrors['_root']).toEqual(['Invalid input'])
    })
  })

  describe('output schema validation', () => {
    it('validates output and returns data on success', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const outputSchema = createMockSchema((value) => {
        return { value: value as { id: number } }
      })

      const handler = defineAction({
        outputSchema,
        handler: async () => ({ id: 1 }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toEqual({ success: true, data: { id: 1 } })
    })

    it('returns OUTPUT_VALIDATION_ERROR when output is invalid', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const outputSchema = createMockSchema(() => {
        return { issues: [{ message: 'id must be a number', path: ['id'] }] }
      })

      const handler = defineAction({
        outputSchema,
        handler: async () => ({ id: 'not-a-number' }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'OUTPUT_VALIDATION_ERROR',
          message: 'Output validation failed',
          statusCode: 500,
        },
      })
    })
  })

  describe('input parsing', () => {
    it('reads body for POST requests', async () => {
      vi.mocked(readBody).mockResolvedValue({ data: 'post' })

      const handler = defineAction({
        handler: async ({ input }) => input,
      })

      await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('POST'))
      expect(readBody).toHaveBeenCalled()
      expect(getQuery).not.toHaveBeenCalled()
    })

    it('reads query for GET requests', async () => {
      vi.mocked(getQuery).mockReturnValue({ q: 'search' })

      const handler = defineAction({
        handler: async ({ input }) => input,
      })

      await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('GET'))
      expect(getQuery).toHaveBeenCalled()
    })

    it('reads query for HEAD requests', async () => {
      vi.mocked(getQuery).mockReturnValue({})

      const handler = defineAction({
        handler: async ({ input }) => input,
      })

      await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('HEAD'))
      expect(getQuery).toHaveBeenCalled()
    })

    it('returns empty object when body read fails (non-JSON)', async () => {
      vi.mocked(readBody).mockRejectedValue(new Error('No body'))
      vi.mocked(getHeader).mockReturnValue(undefined)

      const handler = defineAction({
        handler: async ({ input }) => ({ received: input }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toEqual({
        success: true,
        data: { received: {} },
      })
    })

    it('returns PARSE_ERROR when JSON body is malformed', async () => {
      vi.mocked(readBody).mockRejectedValue(new SyntaxError('Unexpected token'))
      vi.mocked(getHeader).mockReturnValue('application/json')

      const handler = defineAction({
        handler: async ({ input }) => ({ received: input }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
          statusCode: 400,
        },
      })
    })

    it('returns empty object when body is null', async () => {
      vi.mocked(readBody).mockResolvedValue(null)

      const handler = defineAction({
        handler: async ({ input }) => ({ received: input }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toEqual({
        success: true,
        data: { received: {} },
      })
    })
  })

  describe('middleware', () => {
    it('runs single middleware and passes context', async () => {
      vi.mocked(readBody).mockResolvedValue({ data: 'test' })

      const inputSchema = createMockSchema(value => ({ value: value as { data: string } }))

      const authMiddleware = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
        return next({ ctx: { userId: 42 } })
      }

      const handler = defineAction({
        input: inputSchema,
        middleware: [authMiddleware as never],
        handler: async ({ input, ctx }) => ({
          data: (input as { data: string }).data,
          userId: (ctx as Record<string, unknown>).userId,
        }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toEqual({
        success: true,
        data: { data: 'test', userId: 42 },
      })
    })

    it('runs multiple middleware and merges context', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const mw1 = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
        return next({ ctx: { a: 1 } })
      }
      const mw2 = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
        return next({ ctx: { b: 2 } })
      }

      const handler = defineAction({
        middleware: [mw1 as never, mw2 as never],
        handler: async ({ ctx }) => ctx,
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toEqual({
        success: true,
        data: { a: 1, b: 2 },
      })
    })

    it('middleware receives event', async () => {
      vi.mocked(readBody).mockResolvedValue({})
      let receivedEvent: unknown = null

      const mw = async ({ event, next }: { event: unknown, next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
        receivedEvent = event
        return next()
      }

      const handler = defineAction({
        middleware: [mw as never],
        handler: async () => ({}),
      })

      const mockEvent = createMockEvent()
      await (handler as (event: unknown) => Promise<unknown>)(mockEvent)
      expect(receivedEvent).toBe(mockEvent)
    })

    it('middleware receives metadata', async () => {
      vi.mocked(readBody).mockResolvedValue({})
      let receivedMetadata: unknown = null

      const mw = async ({ metadata, next }: { metadata: unknown, next: (opts?: unknown) => Promise<unknown> }) => {
        receivedMetadata = metadata
        return next()
      }

      const handler = defineAction({
        middleware: [mw as never],
        metadata: { role: 'admin', action: 'create' },
        handler: async () => ({ ok: true }),
      })

      await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(receivedMetadata).toEqual({ role: 'admin', action: 'create' })
    })

    it('middleware receives empty metadata when not provided', async () => {
      vi.mocked(readBody).mockResolvedValue({})
      let receivedMetadata: unknown = null

      const mw = async ({ metadata, next }: { metadata: unknown, next: (opts?: unknown) => Promise<unknown> }) => {
        receivedMetadata = metadata
        return next()
      }

      const handler = defineAction({
        middleware: [mw as never],
        handler: async () => ({ ok: true }),
      })

      await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(receivedMetadata).toEqual({})
    })

    it('middleware without ctx does not break chain', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const mw = async ({ next }: { next: (opts?: unknown) => Promise<unknown> }) => {
        return next()
      }

      const handler = defineAction({
        middleware: [mw as never],
        handler: async ({ ctx }) => ({ ctx }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
      expect(result).toEqual({ success: true, data: { ctx: {} } })
    })
  })

  describe('error handling', () => {
    it('catches ActionError (from createActionError)', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const handler = defineAction({
        handler: async () => {
          throw createActionError({
            code: 'FORBIDDEN',
            message: 'Access denied',
            statusCode: 403,
          })
        },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          statusCode: 403,
        },
      })
    })

    it('catches H3 errors with statusCode', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const handler = defineAction({
        handler: async () => {
          const err = new Error('Not found') as Error & { statusCode: number, statusMessage: string }
          err.statusCode = 404
          err.statusMessage = 'Resource not found'
          throw err
        },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Resource not found',
          statusCode: 404,
        },
      })
    })

    it('catches H3 errors falling back to "Server error" when statusMessage is absent', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const handler = defineAction({
        handler: async () => {
          const err = { statusCode: 503, message: 'Internal connection string leaked' }
          throw err
        },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Server error',
          statusCode: 503,
        },
      })
    })

    it('catches H3 errors with fallback message', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const handler = defineAction({
        handler: async () => {
          throw { statusCode: 500 }
        },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Server error',
          statusCode: 500,
        },
      })
    })

    it('catches regular Error without leaking message', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const handler = defineAction({
        handler: async () => {
          throw new Error('Secret database connection string leaked!')
        },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          statusCode: 500,
        },
      })
    })

    it('catches unknown non-Error throw', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const handler = defineAction({
        handler: async () => {
          throw 'string error'
        },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          statusCode: 500,
        },
      })
    })

    it('catches null throw', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const handler = defineAction({
        handler: async () => {
          throw null
        },
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          statusCode: 500,
        },
      })
    })

    it('catches middleware error', async () => {
      vi.mocked(readBody).mockResolvedValue({})

      const mw = async () => {
        throw createActionError({
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          statusCode: 429,
        })
      }

      const handler = defineAction({
        middleware: [mw as never],
        handler: async () => ({ ok: true }),
      })

      const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          statusCode: 429,
        },
      })
    })
  })
})

describe('createActionError', () => {
  it('creates error with all fields', () => {
    const error = createActionError({
      code: 'TEST',
      message: 'Test error',
      statusCode: 418,
      fieldErrors: { field: ['error1'] },
    })
    expect(error.code).toBe('TEST')
    expect(error.message).toBe('Test error')
    expect(error.statusCode).toBe(418)
    expect(error.fieldErrors).toEqual({ field: ['error1'] })
  })

  it('defaults statusCode to 400', () => {
    const error = createActionError({
      code: 'BAD',
      message: 'Bad request',
    })
    expect(error.statusCode).toBe(400)
  })

  it('has __isActionError marker', () => {
    const error = createActionError({ code: 'X', message: 'x' })
    expect((error as unknown as Record<string, unknown>).__isActionError).toBe(true)
  })

  it('does not include fieldErrors when not provided', () => {
    const error = createActionError({ code: 'X', message: 'x' })
    expect(error.fieldErrors).toBeUndefined()
  })
})

describe('formatStandardIssues', () => {
  it('formats issues with string paths', () => {
    const result = formatStandardIssues([
      { message: 'Required', path: ['name'] },
      { message: 'Too short', path: ['name'] },
      { message: 'Invalid', path: ['email'] },
    ])
    expect(result).toEqual({
      name: ['Required', 'Too short'],
      email: ['Invalid'],
    })
  })

  it('formats issues with PathSegment objects', () => {
    const result = formatStandardIssues([
      { message: 'Invalid email', path: [{ key: 'user' }, { key: 'email' }] },
    ])
    expect(result).toEqual({
      'user.email': ['Invalid email'],
    })
  })

  it('maps issues without path to _root', () => {
    const result = formatStandardIssues([
      { message: 'Invalid input' },
    ])
    expect(result).toEqual({
      _root: ['Invalid input'],
    })
  })

  it('handles mixed path types', () => {
    const result = formatStandardIssues([
      { message: 'Error 1', path: ['items', { key: 0 }, { key: 'name' }] },
    ])
    expect(result).toEqual({
      'items.0.name': ['Error 1'],
    })
  })

  it('handles empty path array (maps to _root)', () => {
    const result = formatStandardIssues([
      { message: 'Bad input', path: [] },
    ])
    expect(result).toEqual({
      _root: ['Bad input'],
    })
  })

  it('is safe against prototype pollution via __proto__ path', () => {
    const result = formatStandardIssues([
      { message: 'polluted', path: ['__proto__'] },
    ])
    // Should NOT pollute Object.prototype
    expect(({} as Record<string, unknown>).__proto__).not.toEqual(['polluted'])
    // Should still store the value under the key
    expect(result['__proto__']).toEqual(['polluted'])
  })
})

describe('phantom _types and _execute', () => {
  it('defineAction return has _types phantom property', () => {
    const handler = defineAction({
      handler: async () => ({ ok: true }),
    })

    expect(handler).toHaveProperty('_types')
    expect(handler).toHaveProperty('_execute')
    expect(typeof handler._execute).toBe('function')
  })

  it('_execute can be called directly with rawInput and event', async () => {
    vi.mocked(readBody).mockResolvedValue({ name: 'Direct' })

    const schema = createMockSchema(value => ({ value: value as { name: string } }))

    const handler = defineAction({
      input: schema,
      handler: async ({ input }) => ({ greeting: `Hello, ${(input as { name: string }).name}` }),
    })

    const result = await handler._execute({ name: 'Direct' }, createMockEvent() as never)
    expect(result).toEqual({
      success: true,
      data: { greeting: 'Hello, Direct' },
    })
  })
})

describe('handleServerError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses handleServerError for Error instances', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handleServerError: error => ({
        code: 'CUSTOM',
        message: `Caught: ${error.message}`,
        statusCode: 503,
      }),
      handler: async () => {
        throw new Error('DB connection lost')
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'CUSTOM',
        message: 'Caught: DB connection lost',
        statusCode: 503,
      },
    })
  })

  it('handleServerError defaults statusCode to 500 when omitted', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handleServerError: error => ({
        code: 'CUSTOM',
        message: error.message,
      }),
      handler: async () => {
        throw new Error('oops')
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect((result.error as Record<string, unknown>).statusCode).toBe(500)
  })

  it('handleServerError takes priority over H3 error path for Error instances', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handleServerError: error => ({
        code: 'HANDLED',
        message: `Custom: ${error.message}`,
        statusCode: 502,
      }),
      handler: async () => {
        // An Error with statusCode — should go to handleServerError, not H3 path
        const err = new Error('gateway timeout') as Error & { statusCode: number }
        err.statusCode = 504
        throw err
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'HANDLED',
        message: 'Custom: gateway timeout',
        statusCode: 502,
      },
    })
  })

  it('does not use handleServerError for non-Error throws', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handleServerError = vi.fn()

    const handler = defineAction({
      handleServerError,
      handler: async () => {
        throw 'string error'
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(handleServerError).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      },
    })
  })

  it('does not use handleServerError for ActionError', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handleServerError = vi.fn()

    const handler = defineAction({
      handleServerError,
      handler: async () => {
        throw createActionError({
          code: 'FORBIDDEN',
          message: 'Denied',
          statusCode: 403,
        })
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(handleServerError).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'FORBIDDEN',
        statusCode: 403,
      },
    })
  })
})

describe('edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects non-Standard-Schema input with helpful error', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      input: { notASchema: true } as never,
      handler: async ({ input }) => input,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      },
    })
  })

  it('prevents middleware from calling next() twice', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const badMiddleware = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      await next({ ctx: { a: 1 } })
      await next({ ctx: { b: 2 } }) // Should throw
    }

    const handler = defineAction({
      middleware: [badMiddleware as never],
      handler: async () => ({ ok: true }),
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      },
    })
  })

  it('detects plain error objects with code + message (structural detection)', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handler: async () => {
        // Throw a plain object with code + message but without __isActionError
        throw { code: 'NOT_FOUND', message: 'User not found', statusCode: 404 }
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'User not found',
        statusCode: 404,
      },
    })
  })

  it('structural detection requires statusCode (code + message alone is not enough)', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handler: async () => {
        // Object with code + message but no statusCode should NOT match
        throw { code: 'DB_ERROR', message: 'connection to postgres://user:pass@host failed' }
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        statusCode: 500,
      },
    })
  })

  it('does NOT treat plain objects with stack as action errors', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handler: async () => {
        throw { code: 'DB_ERR', message: 'secret connection string', statusCode: 500, stack: 'fake stack' }
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    // Has statusCode → matches H3 error path, returns 'Server error' (no statusMessage)
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error',
        statusCode: 500,
      },
    })
  })

  it('does NOT treat Error instances as action errors via structural detection', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handler: async () => {
        // Error instances have stack traces — they should NOT match structural detection
        const err = new Error('Secret internal error')
        ;(err as Error & { code: string }).code = 'ENOENT'
        throw err
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    // Should fall through to INTERNAL_ERROR, not expose the error message
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        statusCode: 500,
      },
    })
  })

  it('isActionError uses hasOwnProperty (not prototype chain)', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handler: async () => {
        // Throw an object that has __isActionError on prototype (NOT own property)
        const proto = { __isActionError: true }
        const fakeThrownValue = Object.create(proto)
        fakeThrownValue.statusCode = 999
        throw fakeThrownValue
      },
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    // Should NOT be treated as ActionError because __isActionError is on prototype
    // Instead should match the H3 error path (has statusCode)
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        statusCode: 999,
      },
    })
  })

  it('handler returning null is wrapped in success response', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handler: async () => null,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toEqual({ success: true, data: null })
  })

  it('handler returning undefined is wrapped in success response', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const handler = defineAction({
      handler: async () => undefined,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('reads body for PUT requests', async () => {
    vi.mocked(readBody).mockResolvedValue({ data: 'put' })

    const handler = defineAction({
      handler: async ({ input }) => input,
    })

    await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('PUT'))
    expect(readBody).toHaveBeenCalled()
    expect(getQuery).not.toHaveBeenCalled()
  })

  it('reads body for PATCH requests', async () => {
    vi.mocked(readBody).mockResolvedValue({ data: 'patch' })

    const handler = defineAction({
      handler: async ({ input }) => input,
    })

    await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('PATCH'))
    expect(readBody).toHaveBeenCalled()
  })

  it('reads body for DELETE requests', async () => {
    vi.mocked(readBody).mockResolvedValue({ data: 'delete' })

    const handler = defineAction({
      handler: async ({ input }) => input,
    })

    await (handler as (event: unknown) => Promise<unknown>)(createMockEvent('DELETE'))
    expect(readBody).toHaveBeenCalled()
  })

  it('re-throws non-ActionError from parseInput (GET with getQuery failure)', async () => {
    vi.mocked(getQuery).mockImplementation(() => {
      throw new Error('getQuery exploded')
    })

    const handler = defineAction({
      handler: async ({ input }) => input,
    })

    await expect(
      (handler as (event: unknown) => Promise<unknown>)(createMockEvent('GET')),
    ).rejects.toThrow('getQuery exploded')
  })
})

describe('middleware deep merge context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deep merges nested context objects from multiple middleware', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const mw1 = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      return next({ ctx: { user: { id: 1, name: 'John' } } })
    }
    const mw2 = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      return next({ ctx: { user: { role: 'admin' } } })
    }

    const handler = defineAction({
      middleware: [mw1 as never, mw2 as never],
      handler: async ({ ctx }) => ctx,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toEqual({
      success: true,
      data: { user: { id: 1, name: 'John', role: 'admin' } },
    })
  })

  it('guards against __proto__ pollution in middleware context', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const mw = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      // Attempt prototype pollution via __proto__ key
      return next({ ctx: { __proto__: { isAdmin: true } } })
    }

    const handler = defineAction({
      middleware: [mw as never],
      handler: async ({ ctx }) => ctx,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    // The __proto__ key should be silently dropped, not merged
    expect(result).toEqual({ success: true, data: {} })
    // Object.prototype should NOT be polluted
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  it('guards against constructor pollution in middleware context', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const mw = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      return next({ ctx: { constructor: { polluted: true } } })
    }

    const handler = defineAction({
      middleware: [mw as never],
      handler: async ({ ctx }) => ctx,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    // The constructor key should be silently dropped
    expect(result).toEqual({ success: true, data: {} })
  })

  it('guards against prototype pollution in middleware context', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const mw = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      return next({ ctx: { prototype: { polluted: true } } })
    }

    const handler = defineAction({
      middleware: [mw as never],
      handler: async ({ ctx }) => ctx,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    // The prototype key should be silently dropped
    expect(result).toEqual({ success: true, data: {} })
  })

  it('overwrites arrays in context instead of merging them', async () => {
    vi.mocked(readBody).mockResolvedValue({})

    const mw1 = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      return next({ ctx: { tags: ['a'] } })
    }
    const mw2 = async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
      return next({ ctx: { tags: ['b'] } })
    }

    const handler = defineAction({
      middleware: [mw1 as never, mw2 as never],
      handler: async ({ ctx }) => ctx,
    })

    const result = await (handler as (event: unknown) => Promise<unknown>)(createMockEvent()) as Record<string, unknown>
    expect(result).toEqual({
      success: true,
      data: { tags: ['b'] },
    })
  })
})

describe('middleware next() warning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs a console.warn when middleware does not call next()', async () => {
    vi.mocked(readBody).mockResolvedValue({})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const silentMiddleware = async (_opts: { next: (opts?: unknown) => Promise<unknown> }) => {
      // Deliberately does not call next()
    }

    const handler = defineAction({
      middleware: [silentMiddleware as never],
      handler: async () => ({ ok: true }),
    })

    await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('did not call next()'))

    warnSpy.mockRestore()
  })

  it('does not log the next() warning when middleware throws', async () => {
    vi.mocked(readBody).mockResolvedValue({})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const throwingMiddleware = async (_opts: { next: (opts?: unknown) => Promise<unknown> }) => {
      throw createActionError({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        statusCode: 429,
      })
    }

    const handler = defineAction({
      middleware: [throwingMiddleware as never],
      handler: async () => ({ ok: true }),
    })

    await (handler as (event: unknown) => Promise<unknown>)(createMockEvent())

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
