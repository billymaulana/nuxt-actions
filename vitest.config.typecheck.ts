import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/types/**/*.test-d.ts'],
    typecheck: {
      enabled: true,
      include: ['test/types/**/*.test-d.ts'],
      tsconfig: './test/types/tsconfig.json',
    },
  },
  resolve: {
    alias: {
      '#nuxt-actions/server-runtime': resolve('./src/runtime/server/internal/nitro2.ts'),
    },
  },
})
