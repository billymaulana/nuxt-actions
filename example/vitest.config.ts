import { defineConfig } from 'vitest/config'
import { nuxtActionsTesting } from 'nuxt-actions/testing'

export default defineConfig({
  plugins: [nuxtActionsTesting()],
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
