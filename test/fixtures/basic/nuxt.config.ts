import NuxtActions from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    NuxtActions,
  ],
  compatibilityDate: 'latest',
  actions: {
    openapi: { ui: true },
  },
})
