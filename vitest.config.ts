import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/runtime/**/*.ts'],
      exclude: ['src/runtime/types.ts'],
      reporter: ['text', 'text-summary', 'json', 'lcov'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
