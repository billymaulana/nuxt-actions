import { toJsonSchema } from '../../src/runtime/server/utils/openapi'
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'

describe('toJsonSchema', () => {
  it('converts a zod object via native z.toJSONSchema', async () => {
    const out = await toJsonSchema(z.object({ title: z.string() }))
    expect(out).toMatchObject({ type: 'object' })
    expect((out as { properties: Record<string, unknown> }).properties.title).toBeDefined()
  })

  it('converts an arktype schema via native toJsonSchema', async () => {
    const out = await toJsonSchema(type({ title: 'string' }))
    expect(out).toMatchObject({ type: 'object' })
    expect((out as { properties: Record<string, unknown> }).properties.title).toBeDefined()
  })

  it('falls back to generic object for valibot when no converter is installed', async () => {
    const out = await toJsonSchema(v.object({ title: v.string() }))
    expect(out).toEqual({ type: 'object' })
  })

  it('falls back to generic object for undefined / unknown schema', async () => {
    expect(await toJsonSchema(undefined)).toEqual({ type: 'object' })
    expect(await toJsonSchema({})).toEqual({ type: 'object' })
  })
})
