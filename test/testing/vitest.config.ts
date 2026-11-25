import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { nuxtActionsTesting } from '../../src/runtime/testing'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [nuxtActionsTesting()],
  test: {
    include: ['test/testing/**/*.test.ts'],
  },
})
