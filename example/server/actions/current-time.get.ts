export default defineAction({
  handler: () => ({
    time: new Date().toISOString(),
    timestamp: Date.now(),
  }),
})
