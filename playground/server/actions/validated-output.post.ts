import { z } from 'zod'

/**
 * Demonstrates output schema validation.
 * The server validates both input AND output shape.
 */
export default defineAction({
  input: z.object({
    name: z.string().min(1),
    role: z.enum(['admin', 'user', 'guest']),
  }),
  outputSchema: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    permissions: z.array(z.string()),
  }),
  handler: async ({ input }) => {
    const permissionMap: Record<string, string[]> = {
      admin: ['read', 'write', 'delete', 'manage'],
      user: ['read', 'write'],
      guest: ['read'],
    }

    return {
      id: Math.floor(Math.random() * 10000),
      name: input.name,
      role: input.role,
      permissions: permissionMap[input.role],
    }
  },
})
