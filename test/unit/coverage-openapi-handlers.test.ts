import { describe, it, expect, vi } from 'vitest'
import { setHeader } from 'h3'
import { z } from 'zod'

vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  setHeader: vi.fn(),
}))

vi.mock('#actions-openapi-registry', () => ({
  actions: [
    {
      name: 'createTodo',
      path: 'create-todo',
      method: 'POST',
      action: { _input: z.object({ title: z.string() }) },
    },
    { name: 'ping', path: 'ping', method: 'GET', action: {} },
  ],
  info: { title: 'Registry API', version: '2.0.0' },
  swaggerHtml: '<html><body>swagger-ui</body></html>',
}))

interface OpenApiDoc {
  openapi: string
  info: { title: string, version: string }
  paths: Record<string, Record<string, Record<string, unknown>>>
}

describe('openapi-json handler', () => {
  it('builds the OpenAPI document from the registry actions and info', async () => {
    const { default: handler } = await import('../../src/runtime/server/openapi-json')
    const doc = await (handler as unknown as () => Promise<OpenApiDoc>)()

    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toEqual({ title: 'Registry API', version: '2.0.0' })
    expect(Object.keys(doc.paths)).toEqual([
      '/api/_actions/create-todo',
      '/api/_actions/ping',
    ])
  })

  it('includes converted input schemas as requestBody for body methods', async () => {
    const { default: handler } = await import('../../src/runtime/server/openapi-json')
    const doc = await (handler as unknown as () => Promise<OpenApiDoc>)()

    const post = doc.paths['/api/_actions/create-todo'].post as {
      operationId: string
      requestBody: { content: Record<string, { schema: Record<string, unknown> }> }
    }
    expect(post.operationId).toBe('createTodo')
    expect(post.requestBody.content['application/json'].schema).toMatchObject({
      type: 'object',
      properties: { title: { type: 'string' } },
    })

    const get = doc.paths['/api/_actions/ping'].get as {
      operationId: string
      requestBody?: unknown
      parameters?: unknown
    }
    expect(get.operationId).toBe('ping')
    expect(get.requestBody).toBeUndefined()
    expect(get.parameters).toBeUndefined()
  })
})

describe('openapi-ui handler', () => {
  it('serves the swagger html with a text/html content type', async () => {
    const { default: handler } = await import('../../src/runtime/server/openapi-ui')
    const event = { path: '/api/_actions/openapi' }
    const result = (handler as unknown as (event: unknown) => unknown)(event)

    expect(setHeader).toHaveBeenCalledWith(event, 'content-type', 'text/html')
    expect(result).toBe('<html><body>swagger-ui</body></html>')
  })
})
