export default defineNuxtConfig({
  modules: ['nuxt-actions'],
  devtools: { enabled: true },

  app: {
    head: {
      title: 'nuxt-actions examples',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
  },
  compatibilityDate: 'latest',

  actions: {
    openapi: {
      ui: true,
      info: { title: 'nuxt-actions example API', version: '1.5.0' },
    },
  },
})
