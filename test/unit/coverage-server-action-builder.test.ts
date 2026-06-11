import { readMultipartFormData } from 'h3'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { defineAction } from '../../src/runtime/server/utils/defineAction'
import type { StandardSchemaV1, TypedActionHandler } from '../../src/runtime/types'

vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getHeader: vi.fn((event: { headers?: Record<string, string> }, name: string) =>
    event.headers?.[name.toLowerCase()],
  ),
  setHeader: vi.fn((event: { responseHeaders?: Record<string, string> }, name: string, value: string) => {
    if (event.responseHeaders) event.responseHeaders[name] = value
  }),
  readMultipartFormData: vi.fn(),
}))

interface FakeEvent {
  method: string
  path: string
  headers: Record<string, string>
  responseHeaders: Record<string, string>
}

function makeEvent(opts: { key?: string, contentType?: string } = {}): FakeEvent {
  const headers: Record<string, string> = {}
  if (opts.key) headers['idempotency-key'] = opts.key
  if (opts.contentType) headers['content-type'] = opts.contentType
  return { method: 'POST', path: '/api/_actions/test', headers, responseHeaders: {} }
}

let keyCounter = 0

/* Unique keys per test isolate the module-level default idempotency store. */
function uniqueKey(): string {
  keyCounter++
  return `builder-key-${keyCounter}-${Math.random().toString(36).slice(2)}`
}

function passthroughSchema(): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value }),
    },
  }
}

describe('createActionClient schema builder idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replays duplicate requests for schema actions with the default config', async () => {
    const handler = vi.fn().mockResolvedValue({ tx: 7 })
    const action = createActionClient()
      .schema(passthroughSchema())
      .idempotency()
      .action(handler) as unknown as TypedActionHandler

    const key = uniqueKey()
    const first = await action._execute({ amount: 3 }, makeEvent({ key }) as never)
    const replayEvent = makeEvent({ key })
    const second = await action._execute({ amount: 3 }, replayEvent as never)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(first).toEqual({ success: true, data: { tx: 7 } })
    expect(second).toEqual(first)
    expect(replayEvent.responseHeaders['idempotency-replayed']).toBe('true')
  })

  it('rejects missing keys when the schema builder requires idempotency', async () => {
    const handler = vi.fn()
    const action = createActionClient()
      .schema(passthroughSchema())
      .idempotency({ required: true })
      .action(handler) as unknown as TypedActionHandler

    const result = await action._execute({ amount: 1 }, makeEvent() as never)

    expect(handler).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
      expect(result.error.statusCode).toBe(400)
    }
  })

  it('rejects missing keys when the schemaless builder requires idempotency', async () => {
    const handler = vi.fn()
    const action = createActionClient()
      .idempotency({ required: true })
      .action(handler) as unknown as TypedActionHandler

    const result = await action._execute({}, makeEvent() as never)

    expect(handler).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    }
  })
})

describe('defineAction multipart parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('folds multipart fields and files into the action input', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue([
      { name: 'title', data: Buffer.from('hello') },
      { name: 'file', filename: 'a.txt', type: 'text/plain', data: Buffer.from('abc') },
    ])

    const handler = vi.fn(async (args: { input: unknown }) => args.input)
    const action = defineAction({ handler })
    const event = makeEvent({ contentType: 'multipart/form-data; boundary=x' })

    const result = await (action as unknown as (event: unknown) => Promise<unknown>)(event)

    expect(result).toMatchObject({
      success: true,
      data: {
        title: 'hello',
        file: { filename: 'a.txt', type: 'text/plain' },
      },
    })
  })

  it('collects repeated multipart fields into a growing array', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue([
      { name: 'tags', data: Buffer.from('a') },
      { name: 'tags', data: Buffer.from('b') },
      { name: 'tags', data: Buffer.from('c') },
    ])

    const handler = vi.fn(async (args: { input: unknown }) => args.input)
    const action = defineAction({ handler })
    const event = makeEvent({ contentType: 'multipart/form-data; boundary=x' })

    const result = await (action as unknown as (event: unknown) => Promise<unknown>)(event)

    expect(result).toEqual({ success: true, data: { tags: ['a', 'b', 'c'] } })
  })

  it('treats an empty multipart payload as an empty input object', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue(undefined)

    const handler = vi.fn(async (args: { input: unknown }) => args.input)
    const action = defineAction({ handler })
    const event = makeEvent({ contentType: 'multipart/form-data; boundary=x' })

    const result = await (action as unknown as (event: unknown) => Promise<unknown>)(event)

    expect(result).toEqual({ success: true, data: {} })
  })

  it('returns PARSE_ERROR when the multipart payload is malformed', async () => {
    vi.mocked(readMultipartFormData).mockRejectedValue(new Error('bad form'))

    const handler = vi.fn()
    const action = defineAction({ handler })
    const event = makeEvent({ contentType: 'multipart/form-data; boundary=x' })

    const result = await (action as unknown as (event: unknown) => Promise<unknown>)(event)

    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'Invalid multipart form data',
        statusCode: 400,
        fieldErrors: undefined,
        __isActionError: true,
      },
    })
  })
})
