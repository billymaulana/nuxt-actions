import { taskStore } from '../utils/task-store'

export default defineAction({
  handler: async () => {
    return taskStore.stats()
  },
})
