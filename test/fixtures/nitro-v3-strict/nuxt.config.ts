import { fileURLToPath } from 'node:url'
import NuxtActions from '../../../src/module'

const basicDir = fileURLToPath(new URL('../basic/', import.meta.url))

export default defineNuxtConfig({
  modules: [
    NuxtActions,
  ],
  srcDir: basicDir,
  serverDir: `${basicDir}server`,
  compatibilityDate: 'latest',
  actions: {
    openapi: { ui: true },
  },
  nitroLegacy: false,
})
