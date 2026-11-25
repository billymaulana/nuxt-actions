import { z } from 'zod'
import { taskStore } from '../utils/task-store'

export default defineAction({
  input: z.object({
    id: z.number(),
  }),
  handler: async ({ input }) => {
    const removed = taskStore.remove(input.id)
    if (!removed) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: `Task ${input.id} not found`,
        statusCode: 404,
      })
    }
    return { id: input.id, removed: true }
  },
})
