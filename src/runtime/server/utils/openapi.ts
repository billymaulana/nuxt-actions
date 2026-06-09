export type JsonSchema = Record<string, unknown>

interface StandardLike {
  '~standard'?: { vendor?: string }
  toJsonSchema?: () => JsonSchema
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
