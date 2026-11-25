import { z } from 'zod'
import { taskStore } from '../utils/task-store'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    return taskStore.add(input.title)
  },
})
