import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
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
      '#nuxt-actions/server-runtime': resolve('./src/runtime/server/internal/nitro2.ts'),
    },
  },
})
