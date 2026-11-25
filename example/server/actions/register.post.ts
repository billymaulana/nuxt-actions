import { z } from 'zod'

export default defineAction({
  input: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
  handler: async ({ input }) => {
    // Simulate server delay
    await new Promise(r => setTimeout(r, 500))

    // Simulate duplicate email check
    if (input.email === 'taken@example.com') {
      throw createActionError({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        statusCode: 422,
        fieldErrors: {
          email: ['This email is already registered'],
        },
      })
    }

    return {
      id: Math.floor(Math.random() * 10000),
      name: input.name,
      email: input.email,
    }
  },
})
