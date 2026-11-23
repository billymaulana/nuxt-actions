import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/runtime/**/*.ts'],
      exclude: ['src/runtime/types.ts'],
      reporter: ['text', 'text-summary', 'json', 'lcov'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: {
      '#nuxt-actions/nitro-compact': resolve('./src/runtime/server/internal/nitro2.ts'),
    },
  },
})
