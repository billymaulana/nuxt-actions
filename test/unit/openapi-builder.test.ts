import { buildOpenApiDocument, collectSchemas } from '../../src/runtime/server/utils/openapi'
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const actions = [
  { name: 'createTodo', path: 'create-todo', method: 'POST' },
  { name: 'listTodos', path: 'list-todos', method: 'GET' },
]
const schemas = {
  createTodo: { input: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }, output: { type: 'object' } },
  listTodos: { input: { type: 'object', properties: { q: { type: 'string' } } }, output: { type: 'object' } },
}

describe('buildOpenApiDocument', () => {
  it('produces a 3.1 doc with info and paths', () => {
    const doc = buildOpenApiDocument({ actions, schemas, info: { title: 'X', version: '9.9.9' } })
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toMatchObject({ title: 'X', version: '9.9.9' })
    expect(doc.paths['/api/_actions/create-todo']).toBeDefined()
    expect(doc.paths['/api/_actions/list-todos']).toBeDefined()
  })

  it('uses requestBody for POST and query params for GET', () => {
    const doc = buildOpenApiDocument({ actions, schemas, info: { title: 'X', version: '1' } })
    const post = doc.paths['/api/_actions/create-todo'].post as Record<string, never>
    expect((post as { operationId: string }).operationId).toBe('createTodo')
    expect((post as { requestBody: { content: Record<string, { schema: unknown }> } }).requestBody.content['application/json'].schema).toMatchObject({ type: 'object' })
    const get = doc.paths['/api/_actions/list-todos'].get as { parameters: Array<Record<string, unknown>>, requestBody?: unknown }
    expect(get.parameters[0]).toMatchObject({ name: 'q', in: 'query' })
    expect(get.requestBody).toBeUndefined()
  })

  it('wraps responses in the action result envelope', () => {
    const doc = buildOpenApiDocument({ actions, schemas, info: { title: 'X', version: '1' } })
    const post = doc.paths['/api/_actions/create-todo'].post as {
      responses: Record<string, { content: Record<string, { schema: { properties: Record<string, unknown> } }> }>
    }
    const schema = post.responses['200'].content['application/json'].schema
    expect(schema.properties.success).toMatchObject({ type: 'boolean' })
    expect(schema.properties.data).toBeDefined()
    expect(schema.properties.error).toBeDefined()
  })

  it('handles empty actions', () => {
    const doc = buildOpenApiDocument({ actions: [], schemas: {}, info: { title: 'X', version: '1' } })
    expect(doc.paths).toEqual({})
  })
})

describe('collectSchemas', () => {
  it('converts each action input schema', async () => {
    const out = await collectSchemas([
      { name: 'createTodo', path: 'create-todo', method: 'POST', action: { _input: z.object({ title: z.string() }) } },
    ])
    expect(out.createTodo.input).toMatchObject({ type: 'object' })
  })

  it('leaves input undefined when the action has no input schema', async () => {
    const out = await collectSchemas([
      { name: 'ping', path: 'ping', method: 'GET', action: {} },
    ])
    expect(out.ping.input).toBeUndefined()
  })
})
