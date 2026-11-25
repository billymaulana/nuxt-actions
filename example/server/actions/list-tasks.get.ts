import { taskStore } from '../utils/task-store'

export default defineAction({
  handler: async () => {
    return { items: taskStore.list() }
  },
})
