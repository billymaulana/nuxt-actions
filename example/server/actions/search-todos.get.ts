import { z } from 'zod'

const allTodos = [
  { id: 1, title: 'Learn Nuxt', done: true },
  { id: 2, title: 'Build app', done: false },
  { id: 3, title: 'Write tests', done: false },
  { id: 4, title: 'Deploy to production', done: false },
  { id: 5, title: 'Set up CI/CD', done: true },
]

export default defineAction({
  input: z.object({
    q: z.string().optional().default(''),
  }),
  handler: async ({ input }) => {
    const q = input.q.toLowerCase()
    const items = q
      ? allTodos.filter(t => t.title.toLowerCase().includes(q))
      : allTodos

    return { items, total: items.length }
  },
})
