import { getCookie, getRequestHeader, getRequestURL } from 'nuxt/server'

export default defineAction({
  handler: async ({ event }) => ({
    method: event.req.method,
    path: getRequestURL(event).pathname,
    agent: getRequestHeader(event, 'user-agent'),
    theme: getCookie(event, 'theme'),
  }),
})
