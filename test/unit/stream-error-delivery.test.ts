import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEvent } from 'h3'
import type { H3Event } from 'h3'
import { describe, it, expect } from 'vitest'
import { defineStreamAction } from '../../src/runtime/server/utils/defineStreamAction'
import { createActionError } from '../../src/runtime/server/utils/defineAction'
import type { StandardSchemaV1 } from '../../src/runtime/types'

interface CapturedResponse {
  event: H3Event
  body: () => string
  ended: () => boolean
  headers: Record<string, unknown>
}

function createH3Event(url: string): CapturedResponse {
  const chunks: Uint8Array[] = []
  const headers: Record<string, unknown> = {}
  let ended = false
  const req = Object.assign(new EventEmitter(), { method: 'GET', url, headers: {} })
  const res = {
    statusCode: 200,
    socket: {},
    headersSent: false,
    closed: false,
    setHeader: (name: string, value: unknown) => {
      headers[name.toLowerCase()] = value
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
    write: (chunk: Uint8Array) => {
      chunks.push(chunk)
      return true
    },
    end: () => {
      ended = true
    },
  }
  return {
    event: createEvent(req as unknown as IncomingMessage, res as unknown as ServerResponse),
    body: () => Buffer.concat(chunks).toString('utf-8'),
    ended: () => ended,
    headers,
  }
}

const promptSchema: StandardSchemaV1<{ prompt: string }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => {
      const prompt = (value as { prompt?: unknown }).prompt
      return typeof prompt === 'string'
        ? { value: { prompt } }
        : { issues: [{ message: 'Prompt is required', path: ['prompt'] }] }
    },
  },
}

function settlesWithin(promise: Promise<unknown>, ms: number): Promise<'settled' | 'pending'> {
  return Promise.race([
    promise.then(() => 'settled' as const),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), ms)),
  ])
}

function errorFrame(body: string): { code: string, statusCode: number } {
  const line = body.split('\n').find(candidate => candidate.startsWith('data: '))
  return JSON.parse(line!.slice('data: '.length)).__actions_error
}

describe('stream action error delivery over h3 event streams', () => {
  it('delivers a validation error instead of hanging', async () => {
    const captured = createH3Event('/api/stream')
    const action = defineStreamAction({
      input: promptSchema,
      handler: async ({ stream }) => {
        await stream.close()
      },
    })

    const response = action(captured.event)

    expect(await settlesWithin(response, 1000)).toBe('settled')
    expect(captured.ended()).toBe(true)
    expect(captured.headers['content-type']).toBe('text/event-stream')
    expect(errorFrame(captured.body())).toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 422 })
  })

  it('delivers a middleware rejection instead of hanging', async () => {
    const captured = createH3Event('/api/stream?prompt=hi')
    const action = defineStreamAction({
      input: promptSchema,
      middleware: [async () => {
        throw createActionError({ code: 'UNAUTHORIZED', message: 'Sign in first', statusCode: 401 })
      }],
      handler: async ({ stream }) => {
        await stream.close()
      },
    })

    const response = action(captured.event)

    expect(await settlesWithin(response, 1000)).toBe('settled')
    expect(errorFrame(captured.body())).toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
  })

  it('delivers an unexpected setup error instead of hanging', async () => {
    const captured = createH3Event('/api/stream?prompt=hi')
    const action = defineStreamAction({
      input: promptSchema,
      middleware: [async () => {
        throw new Error('database unavailable')
      }],
      handler: async ({ stream }) => {
        await stream.close()
      },
    })

    const response = action(captured.event)

    expect(await settlesWithin(response, 1000)).toBe('settled')
    expect(errorFrame(captured.body())).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
    })
  })
})
