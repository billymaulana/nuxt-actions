import { defineStreamAction } from '../../src/runtime/server/utils/defineStreamAction'
import { createActionError } from '../../src/runtime/server/utils/defineAction'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'

// Mock h3
const mockEventStream = {
  push: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
}

vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: H3Event) => unknown) => handler,
  readBody: vi.fn(),
  getQuery: vi.fn(),
  createEventStream: vi.fn(() => ({
    push: mockEventStream.push,
    close: mockEventStream.close,
    send: mockEventStream.send,
  })),
}))

// Must import after mock
const { readBody, getQuery } = await import('h3')
const mockReadBody = vi.mocked(readBody)
const mockGetQuery = vi.mocked(getQuery)

function createMockEvent(method = 'GET'): H3Event {
  return { method } as unknown as H3Event
}

describe('defineStreamAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventStream.push.mockResolvedValue(undefined)
    mockEventStream.close.mockResolvedValue(undefined)
    mockEventStream.send.mockResolvedValue(undefined)
  })

  describe('basic streaming', () => {
    it('creates an event handler with _isStream marker', () => {
      const action = defineStreamAction({
        handler: async ({ stream }) => {
          await stream.send({ text: 'hello' })
          await stream.close()
        },
      })

      expect(action._isStream).toBe(true)
      expect(action._types).toBeDefined()
    })

    it('parses input for GET requests', async () => {
      mockGetQuery.mockReturnValue({ q: 'test' })

      const handler = vi.fn(async ({ stream }: { stream: { close: () => Promise<void> } }) => {
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      expect(mockGetQuery).toHaveBeenCalled()
    })

    it('parses input for POST requests', async () => {
      mockReadBody.mockResolvedValue({ prompt: 'hello' })

      const handler = vi.fn(async ({ stream }: { stream: { close: () => Promise<void> } }) => {
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('POST'))

      expect(mockReadBody).toHaveBeenCalled()
    })

    it('defaults to empty object when readBody returns null', async () => {
      mockReadBody.mockResolvedValue(null)

      const handler = vi.fn(async ({ input, stream }: { input: unknown, stream: { close: () => Promise<void> } }) => {
        expect(input).toEqual({})
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('POST'))

      await new Promise(r => setTimeout(r, 10))
      expect(handler).toHaveBeenCalled()
    })

    it('passes HEAD requests through GET parsing', async () => {
      mockGetQuery.mockReturnValue({ page: '1' })

      const handler = vi.fn(async ({ stream }: { stream: { close: () => Promise<void> } }) => {
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('HEAD'))

      expect(mockGetQuery).toHaveBeenCalled()
    })
  })

  describe('input validation', () => {
    it('sends error event when validation fails', async () => {
      mockGetQuery.mockReturnValue({})

      const mockSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: vi.fn().mockResolvedValue({
            issues: [{ message: 'Required', path: ['title'] }],
          }),
        },
      }

      const action = defineStreamAction({
        input: mockSchema,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Should push error and close
      expect(mockEventStream.push).toHaveBeenCalledWith(
        expect.stringContaining('VALIDATION_ERROR'),
      )
      expect(mockEventStream.close).toHaveBeenCalled()
    })

    it('awaits push and close before send on validation error', async () => {
      mockGetQuery.mockReturnValue({})
      const callOrder: string[] = []

      mockEventStream.push.mockImplementation(async () => {
        callOrder.push('push')
      })
      mockEventStream.close.mockImplementation(async () => {
        callOrder.push('close')
      })
      mockEventStream.send.mockImplementation(async () => {
        callOrder.push('send')
      })

      const mockSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: vi.fn().mockResolvedValue({
            issues: [{ message: 'Required', path: ['title'] }],
          }),
        },
      }

      const action = defineStreamAction({
        input: mockSchema,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // push and close must complete before send
      expect(callOrder).toEqual(['push', 'close', 'send'])
    })

    it('passes validated input to handler', async () => {
      mockGetQuery.mockReturnValue({ title: 'test' })

      const mockSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: vi.fn().mockResolvedValue({ value: { title: 'test' } }),
        },
      }

      const handler = vi.fn(async ({ input, stream }: { input: unknown, stream: { close: () => Promise<void> } }) => {
        expect(input).toEqual({ title: 'test' })
        await stream.close()
      })

      const action = defineStreamAction({
        input: mockSchema,
        handler,
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      expect(handler).toHaveBeenCalled()
    })

    it('throws TypeError for invalid schema (no ~standard interface)', async () => {
      mockGetQuery.mockReturnValue({})

      const invalidSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          // validate is not a function
          validate: 'not-a-function',
        },
      }

      const action = defineStreamAction({
        input: invalidSchema as never,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>

      // TypeError should be re-thrown, not caught
      await expect(eventHandler(createMockEvent('GET'))).rejects.toThrow(TypeError)
    })

    it('throws TypeError for schema without ~standard property', async () => {
      mockGetQuery.mockReturnValue({})

      const invalidSchema = {} as never

      const action = defineStreamAction({
        input: invalidSchema,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>

      await expect(eventHandler(createMockEvent('GET'))).rejects.toThrow(TypeError)
    })
  })

  describe('middleware', () => {
    it('runs middleware before handler', async () => {
      mockGetQuery.mockReturnValue({})

      const order: string[] = []
      const middleware = vi.fn(async ({ next }: { next: (opts?: { ctx: Record<string, unknown> }) => Promise<unknown> }) => {
        order.push('middleware')
        return next({ ctx: { userId: 1 } })
      })

      const handler = vi.fn(async ({ ctx, stream }: { ctx: unknown, stream: { close: () => Promise<void> } }) => {
        order.push('handler')
        expect(ctx).toEqual({ userId: 1 })
        await stream.close()
      })

      const action = defineStreamAction({
        middleware: [middleware],
        handler,
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      await new Promise(r => setTimeout(r, 10))

      expect(order).toEqual(['middleware', 'handler'])
    })

    it('skips middleware when not provided', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async ({ ctx, stream }: { ctx: unknown, stream: { close: () => Promise<void> } }) => {
        expect(ctx).toEqual({})
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      await new Promise(r => setTimeout(r, 10))
      expect(handler).toHaveBeenCalled()
    })

    it('streams ActionError from middleware as SSE error', async () => {
      mockGetQuery.mockReturnValue({})

      const middleware = vi.fn(async () => {
        throw createActionError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
          statusCode: 401,
        })
      })

      const action = defineStreamAction({
        middleware: [middleware],
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Should push the original ActionError, not generic INTERNAL_ERROR
      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.code).toBe('UNAUTHORIZED')
      expect(parsed.__actions_error.message).toBe('Not authenticated')
      expect(parsed.__actions_error.statusCode).toBe(401)
      expect(mockEventStream.close).toHaveBeenCalled()
    })

    it('uses handleServerError for regular Error from middleware', async () => {
      mockGetQuery.mockReturnValue({})

      const middleware = vi.fn(async () => {
        throw new Error('Database connection failed')
      })

      const handleServerError = vi.fn((err: Error) => ({
        code: 'DB_ERROR',
        message: err.message,
        statusCode: 503,
      }))

      const action = defineStreamAction({
        middleware: [middleware],
        handleServerError,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      expect(handleServerError).toHaveBeenCalled()
      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.code).toBe('DB_ERROR')
      expect(parsed.__actions_error.message).toBe('Database connection failed')
      expect(parsed.__actions_error.statusCode).toBe(503)
    })

    it('returns INTERNAL_ERROR for regular Error without handleServerError', async () => {
      mockGetQuery.mockReturnValue({})

      const middleware = vi.fn(async () => {
        throw new Error('Something broke')
      })

      const action = defineStreamAction({
        middleware: [middleware],
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.code).toBe('INTERNAL_ERROR')
      expect(parsed.__actions_error.message).toBe('An unexpected error occurred')
    })

    it('returns INTERNAL_ERROR for non-Error thrown in setup', async () => {
      mockGetQuery.mockReturnValue({})

      const middleware = vi.fn(async () => {
        throw 'string error'
      })

      const action = defineStreamAction({
        middleware: [middleware],
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('stream sender', () => {
    it('send() pushes JSON-serialized data', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async ({ stream }: { stream: { send: (d: unknown) => Promise<void>, close: () => Promise<void> } }) => {
        await stream.send({ text: 'hello' })
        await stream.send({ text: 'world' })
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Wait for handler to complete
      await new Promise(r => setTimeout(r, 10))

      expect(mockEventStream.push).toHaveBeenCalledWith(JSON.stringify({ text: 'hello' }))
      expect(mockEventStream.push).toHaveBeenCalledWith(JSON.stringify({ text: 'world' }))
    })

    it('close() sends done event and closes stream', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async ({ stream }: { stream: { close: () => Promise<void> } }) => {
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Wait for handler to complete
      await new Promise(r => setTimeout(r, 10))

      // Should push done event before closing
      expect(mockEventStream.push).toHaveBeenCalledWith(JSON.stringify({ __actions_done: true }))
      expect(mockEventStream.close).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('catches handler errors and sends error event', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async () => {
        throw new Error('Handler exploded')
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Wait for error handling
      await new Promise(r => setTimeout(r, 10))

      expect(mockEventStream.push).toHaveBeenCalledWith(
        expect.stringContaining('STREAM_ERROR'),
      )
    })

    it('preserves ActionError from handler', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async () => {
        throw createActionError({
          code: 'RATE_LIMIT',
          message: 'Too many requests',
          statusCode: 429,
        })
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Wait for error handling
      await new Promise(r => setTimeout(r, 10))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.code).toBe('RATE_LIMIT')
      expect(parsed.__actions_error.message).toBe('Too many requests')
      expect(parsed.__actions_error.statusCode).toBe(429)
    })

    it('handles non-Error thrown in handler', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async () => {
        throw 42
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Wait for error handling
      await new Promise(r => setTimeout(r, 10))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.code).toBe('STREAM_ERROR')
      expect(parsed.__actions_error.message).toBe('Stream handler error')
    })

    it('handles push failure during error reporting', async () => {
      mockGetQuery.mockReturnValue({})
      mockEventStream.push.mockRejectedValue(new Error('Stream already closed'))

      const handler = vi.fn(async () => {
        throw new Error('Handler error')
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      // Should not throw even if push fails
      await eventHandler(createMockEvent('GET'))

      // Wait for error handling
      await new Promise(r => setTimeout(r, 10))

      // Push was attempted but failed — close should still be attempted
      expect(mockEventStream.push).toHaveBeenCalled()
    })

    it('handles close failure during error reporting', async () => {
      mockGetQuery.mockReturnValue({})
      mockEventStream.close.mockRejectedValue(new Error('Stream already closed'))

      const handler = vi.fn(async () => {
        throw new Error('Handler error')
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      // Should not throw even if close fails
      await eventHandler(createMockEvent('GET'))

      // Wait for error handling
      await new Promise(r => setTimeout(r, 10))

      expect(mockEventStream.close).toHaveBeenCalled()
    })
  })

  describe('handleServerError callback', () => {
    it('calls handleServerError for setup errors (Error instance)', async () => {
      mockGetQuery.mockReturnValue({})

      const middleware = vi.fn(async () => {
        throw new Error('Auth service down')
      })

      const handleServerError = vi.fn(() => ({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Auth service is temporarily unavailable',
        statusCode: 503,
      }))

      const action = defineStreamAction({
        middleware: [middleware],
        handleServerError,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      expect(handleServerError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('calls handleServerError for handler errors (Error instance)', async () => {
      mockGetQuery.mockReturnValue({})

      const handleServerError = vi.fn(() => ({
        code: 'HANDLER_CUSTOM',
        message: 'Custom handler error',
        statusCode: 503,
      }))

      const handler = vi.fn(async () => {
        throw new Error('Database connection failed')
      })

      const action = defineStreamAction({
        handleServerError,
        handler,
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      // Wait for async error handling
      await new Promise(r => setTimeout(r, 10))

      expect(handleServerError).toHaveBeenCalledWith(expect.any(Error))
      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.code).toBe('HANDLER_CUSTOM')
      expect(parsed.__actions_error.message).toBe('Custom handler error')
      expect(parsed.__actions_error.statusCode).toBe(503)
    })

    it('defaults statusCode to 500 when handleServerError omits it for handler errors', async () => {
      mockGetQuery.mockReturnValue({})

      const handleServerError = vi.fn(() => ({
        code: 'HANDLER_ERR',
        message: 'No status code',
      }))

      const handler = vi.fn(async () => {
        throw new Error('boom')
      })

      const action = defineStreamAction({
        handleServerError,
        handler,
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      await new Promise(r => setTimeout(r, 10))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.statusCode).toBe(500)
    })

    it('defaults statusCode to 500 when handleServerError omits it', async () => {
      mockGetQuery.mockReturnValue({})

      const middleware = vi.fn(async () => {
        throw new Error('Something went wrong')
      })

      const handleServerError = vi.fn(() => ({
        code: 'CUSTOM_ERROR',
        message: 'Something went wrong',
        // No statusCode
      }))

      const action = defineStreamAction({
        middleware: [middleware],
        handleServerError,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed.__actions_error.statusCode).toBe(500)
    })
  })

  describe('namespaced control messages', () => {
    it('uses __actions_done key for done signal', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async ({ stream }: { stream: { close: () => Promise<void> } }) => {
        await stream.close()
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      await new Promise(r => setTimeout(r, 10))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed).toHaveProperty('__actions_done', true)
      expect(parsed).not.toHaveProperty('__done')
    })

    it('uses __actions_error key for error signal', async () => {
      mockGetQuery.mockReturnValue({})

      const handler = vi.fn(async () => {
        throw new Error('test error')
      })

      const action = defineStreamAction({ handler })
      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      await new Promise(r => setTimeout(r, 10))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed).toHaveProperty('__actions_error')
      expect(parsed).not.toHaveProperty('__error')
      expect(parsed.__actions_error.code).toBe('STREAM_ERROR')
    })

    it('uses __actions_error for validation error', async () => {
      mockGetQuery.mockReturnValue({})

      const mockSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: vi.fn().mockResolvedValue({
            issues: [{ message: 'Required', path: ['title'] }],
          }),
        },
      }

      const action = defineStreamAction({
        input: mockSchema,
        handler: async () => {},
      })

      const eventHandler = action as unknown as (event: H3Event) => Promise<unknown>
      await eventHandler(createMockEvent('GET'))

      const pushCall = mockEventStream.push.mock.calls[0][0] as string
      const parsed = JSON.parse(pushCall)
      expect(parsed).toHaveProperty('__actions_error')
      expect(parsed).not.toHaveProperty('__error')
      expect(parsed.__actions_error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('phantom types', () => {
    it('has _types for template generation', () => {
      const action = defineStreamAction({
        handler: async ({ stream }) => {
          await stream.close()
        },
      })

      expect(action._types).toBeDefined()
      expect(action._isStream).toBe(true)
    })
  })
})
