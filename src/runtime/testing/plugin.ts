import { fileURLToPath } from 'node:url'

export interface NuxtActionsTestingPlugin {
  name: string
  config: () => {
    resolve: { alias: Record<string, string> }
    test: { setupFiles: string[], server: { deps: { inline: RegExp[] } } }
  }
}

const PACKAGE_FILES = /[/\\]node_modules[/\\]nuxt-actions[/\\]/

export function resolveTestingFiles(moduleUrl: string): { runtime: string, setup: string } {
  const extension = moduleUrl.endsWith('.ts') ? '.ts' : '.js'
  return {
    runtime: fileURLToPath(new URL(`./runtime${extension}`, moduleUrl)),
    setup: fileURLToPath(new URL(`./setup${extension}`, moduleUrl)),
  }
}

/**
 * Vite plugin that lets plain Vitest import action files. It points the
 * server runtime at an in-memory test runtime and installs the nuxt-actions
 * server utils and the common h3 helpers as globals, the way Nitro
 * auto-imports them.
 *
 * @example
 * ```ts
 * // vitest.config.ts
 * import { defineConfig } from 'vitest/config'
 * import { nuxtActionsTesting } from 'nuxt-actions/testing'
 *
 * export default defineConfig({ plugins: [nuxtActionsTesting()] })
 * ```
 */
export function nuxtActionsTesting(): NuxtActionsTestingPlugin {
  const files = resolveTestingFiles(import.meta.url)
  return {
    name: 'nuxt-actions:testing',
    config: () => ({
      resolve: { alias: { '#nuxt-actions/server-runtime': files.runtime } },
      test: {
        setupFiles: [files.setup],
        server: { deps: { inline: [PACKAGE_FILES] } },
      },
    }),
  }
}
