import { describe, it, expect, vi } from 'vitest'
import { toJsonSchema, collectSchemas, buildOpenApiDocument } from '../../src/runtime/server/utils/openapi'
import type { StandardSchemaV1 } from '../../src/runtime/types'

function arktypeLikeSchema(json: Record<string, unknown>): StandardSchemaV1 & { toJsonSchema: () => Record<string, unknown> } {
  return {
    '~standard': {
      version: 1,
      vendor: 'arktype',
      validate: (value: unknown) => ({ value }),
    },
    'toJsonSchema': () => json,
  }
}

describe('toJsonSchema vendor fallbacks', () => {
  it('returns a generic schema when the arktype converter throws', async () => {
    const schema = {
      '~standard': { version: 1, vendor: 'arktype', validate: (value: unknown) => ({ value }) },
      'toJsonSchema': () => {
        throw new Error('cyclic type is not representable')
      },
    }

    expect(await toJsonSchema(schema)).toEqual({ type: 'object' })
  })

  it('returns a generic schema when an arktype schema lacks a converter', async () => {
    const schema = {
      '~standard': { version: 1, vendor: 'arktype', validate: (value: unknown) => ({ value }) },
    }

    expect(await toJsonSchema(schema)).toEqual({ type: 'object' })
  })

  it('returns a generic schema when the zod runtime lacks toJSONSchema', async () => {
    vi.doMock('zod', () => ({}))
    try {
      const schema = {
        '~standard': { version: 1, vendor: 'zod', validate: (value: unknown) => ({ value }) },
      }
      expect(await toJsonSchema(schema)).toEqual({ type: 'object' })
    }
    finally {
      vi.doUnmock('zod')
    }
  })

  it('uses the valibot converter when it is available', async () => {
    vi.doMock('@valibot/to-json-schema', () => ({
      toJsonSchema: () => ({ type: 'object', properties: { title: { type: 'string' } } }),
    }))
    try {
      const schema = {
        '~standard': { version: 1, vendor: 'valibot', validate: (value: unknown) => ({ value }) },
      }
      expect(await toJsonSchema(schema)).toEqual({
        type: 'object',
        properties: { title: { type: 'string' } },
      })
    }
    finally {
      vi.doUnmock('@valibot/to-json-schema')
    }
  })

  it('ignores a valibot converter module without the expected export', async () => {
    vi.doMock('@valibot/to-json-schema', () => ({}))
    try {
      const schema = {
        '~standard': { version: 1, vendor: 'valibot', validate: (value: unknown) => ({ value }) },
      }
      expect(await toJsonSchema(schema)).toEqual({ type: 'object' })
    }
    finally {
      vi.doUnmock('@valibot/to-json-schema')
    }
  })
})

describe('collectSchemas output schemas', () => {
  it('converts the output schema when an action declares one', async () => {
    const out = await collectSchemas([
      {
        name: 'createTodo',
        path: 'create-todo',
        method: 'POST',
        action: {
          _input: arktypeLikeSchema({ type: 'object', properties: { title: { type: 'string' } } }),
          _outputSchema: arktypeLikeSchema({ type: 'object', properties: { id: { type: 'number' } } }),
        },
      },
    ])

    expect(out.createTodo.input).toEqual({ type: 'object', properties: { title: { type: 'string' } } })
    expect(out.createTodo.output).toEqual({ type: 'object', properties: { id: { type: 'number' } } })
  })

  it('handles actions without an attached handler module', async () => {
    const out = await collectSchemas([
      { name: 'ping', path: 'ping', method: 'GET' },
    ])

    expect(out.ping).toEqual({ input: undefined, output: undefined })
  })
})

describe('buildOpenApiDocument verb and schema fallbacks', () => {
  const info = { title: 'X', version: '1' }

  it('treats PUT and PATCH as body verbs', () => {
    const doc = buildOpenApiDocument({
      actions: [
        { name: 'updateTodo', path: 'update-todo', method: 'PUT' },
        { name: 'patchTodo', path: 'patch-todo', method: 'PATCH' },
      ],
      schemas: {
        updateTodo: { input: { type: 'object' } },
        patchTodo: { input: { type: 'object' } },
      },
      info,
    })

    const put = doc.paths['/api/_actions/update-todo'].put as { requestBody?: unknown, parameters?: unknown }
    const patch = doc.paths['/api/_actions/patch-todo'].patch as { requestBody?: unknown, parameters?: unknown }
    expect(put.requestBody).toBeDefined()
    expect(put.parameters).toBeUndefined()
    expect(patch.requestBody).toBeDefined()
    expect(patch.parameters).toBeUndefined()
  })

  it('omits request body and parameters when actions have no schemas', () => {
    const doc = buildOpenApiDocument({
      actions: [
        { name: 'reset', path: 'reset', method: 'POST' },
        { name: 'ping', path: 'ping', method: 'GET' },
      ],
      schemas: {},
      info,
    })

    const post = doc.paths['/api/_actions/reset'].post as {
      requestBody?: unknown
      parameters?: unknown
      responses: Record<string, { content: Record<string, { schema: { properties: Record<string, unknown> } }> }>
    }
    expect(post.requestBody).toBeUndefined()
    expect(post.parameters).toBeUndefined()
    expect(post.responses['200'].content['application/json'].schema.properties.data).toEqual({})

    const get = doc.paths['/api/_actions/ping'].get as { requestBody?: unknown, parameters?: unknown }
    expect(get.requestBody).toBeUndefined()
    expect(get.parameters).toBeUndefined()
  })

  it('produces no query parameters for a GET input without properties', () => {
    const doc = buildOpenApiDocument({
      actions: [{ name: 'search', path: 'search', method: 'GET' }],
      schemas: { search: { input: { type: 'object' } } },
      info,
    })

    const get = doc.paths['/api/_actions/search'].get as { parameters: unknown[] }
    expect(get.parameters).toEqual([])
  })
})
