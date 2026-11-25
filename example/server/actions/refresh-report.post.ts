export default defineAction({
  handler: async () => {
    await invalidateActionCache('cached-report')
    return { invalidated: true }
  },
})
