import { z } from 'zod'

const existingTitles = ['Buy milk', 'Walk dog']

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    if (existingTitles.includes(input.title)) {
      returnValidationErrors({ title: ['This todo already exists'] })
    }
    return { id: Date.now(), title: input.title, done: false }
  },
})
