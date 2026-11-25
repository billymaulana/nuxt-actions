export default defineAction({
  handler: async () => {
    return {
      items: [
        { id: 1, title: 'Learn Nuxt', done: true },
        { id: 2, title: 'Build app', done: false },
      ],
    }
  },
})
