import { z } from 'zod'

const allTodos = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: `Todo item #${i + 1}`,
  done: i % 3 === 0,
}))

export default defineAction({
  input: z.object({
    pageParam: z.coerce.number().optional().default(1),
    limit: z.coerce.number().optional().default(5),
  }),
  handler: async ({ input }) => {
    const { pageParam: page, limit } = input
    const start = (page - 1) * limit
    const end = start + limit
    const items = allTodos.slice(start, end)
    const hasMore = end < allTodos.length

    return {
      items,
      nextPage: hasMore ? page + 1 : null,
    }
  },
})
