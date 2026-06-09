export type JsonSchema = Record<string, unknown>

interface StandardLike {
  '~standard'?: { vendor?: string }
  'toJsonSchema'?: () => JsonSchema
}

const GENERIC: JsonSchema = { type: 'object' }

export async function toJsonSchema(schema: unknown): Promise<JsonSchema> {
  const s = schema as StandardLike | undefined
  const vendor = s?.['~standard']?.vendor
  try {
    if (vendor === 'arktype' && typeof s?.toJsonSchema === 'function') {
      return s.toJsonSchema() as JsonSchema
    }
    if (vendor === 'zod') {
      const z = await import('zod') as { toJSONSchema?: (x: unknown) => JsonSchema }
      if (typeof z.toJSONSchema === 'function') return z.toJSONSchema(schema)
    }
    if (vendor === 'valibot') {
      const specifier = '@valibot/to-json-schema'
      const mod = await import(specifier).catch(() => null) as { toJsonSchema?: (x: unknown) => JsonSchema } | null
      if (mod && typeof mod.toJsonSchema === 'function') return mod.toJsonSchema(schema)
    }
  }
  catch {
    return { ...GENERIC }
  }
  return { ...GENERIC }
}

export interface ActionMeta {
  name: string
  path: string
  method: string
}

export interface OpenApiInfo {
  title: string
  version: string
  description?: string
}

interface BuildArgs {
  actions: ActionMeta[]
  schemas: Record<string, { input?: JsonSchema, output?: JsonSchema }>
  info: OpenApiInfo
}

function responseEnvelope(output?: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: output ?? {},
      error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          statusCode: { type: 'number' },
        },
      },
    },
  }
}

function queryParams(input?: JsonSchema): Array<Record<string, unknown>> {
  const props = (input?.properties as Record<string, JsonSchema> | undefined) ?? {}
  const required = (input?.required as string[] | undefined) ?? []
  return Object.entries(props).map(([name, schema]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema,
  }))
}

export function buildOpenApiDocument(args: BuildArgs): {
  openapi: string
  info: OpenApiInfo
  paths: Record<string, Record<string, Record<string, unknown>>>
} {
  const paths: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const action of args.actions) {
    const schema = args.schemas[action.name] ?? {}
    const verb = action.method.toLowerCase()
    const isBody = verb === 'post' || verb === 'put' || verb === 'patch'
    const operation: Record<string, unknown> = {
      operationId: action.name,
      tags: ['actions'],
      responses: {
        200: {
          description: 'Action result',
          content: { 'application/json': { schema: responseEnvelope(schema.output) } },
        },
      },
    }
    if (isBody && schema.input) {
      operation.requestBody = {
        content: { 'application/json': { schema: schema.input } },
      }
    }
    else if (!isBody && schema.input) {
      operation.parameters = queryParams(schema.input)
    }
    paths[`/api/_actions/${action.path}`] = { [verb]: operation }
  }
  return { openapi: '3.1.0', info: args.info, paths }
}

export async function collectSchemas(
  actions: Array<ActionMeta & { action?: { _input?: unknown, _outputSchema?: unknown } }>,
): Promise<Record<string, { input?: JsonSchema, output?: JsonSchema }>> {
  const out: Record<string, { input?: JsonSchema, output?: JsonSchema }> = {}
  for (const a of actions) {
    const input = a.action?._input ? await toJsonSchema(a.action._input) : undefined
    const output = a.action?._outputSchema ? await toJsonSchema(a.action._outputSchema) : undefined
    out[a.name] = { input, output }
  }
  return out
}
