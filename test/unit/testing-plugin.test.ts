import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, it, expect } from 'vitest'
import { nuxtActionsTesting } from '../../src/runtime/testing'
import { resolveTestingFiles } from '../../src/runtime/testing/plugin'

describe('nuxtActionsTesting', () => {
  it('points the server runtime at the test runtime and adds the setup file', () => {
    const plugin = nuxtActionsTesting()
    const config = plugin.config()

    expect(plugin.name).toBe('nuxt-actions:testing')
    expect(config.resolve.alias['#nuxt-actions/server-runtime']).toBe(fileURLToPath(new URL('../../src/runtime/testing/runtime.ts', import.meta.url)))
    expect(config.test.setupFiles).toEqual([fileURLToPath(new URL('../../src/runtime/testing/setup.ts', import.meta.url))])
  })

  it('has Vitest process the package so the alias reaches its files', () => {
    const [pattern] = nuxtActionsTesting().config().test.server.deps.inline

    expect(pattern!.test('/app/node_modules/nuxt-actions/dist/runtime/testing/setup.js')).toBe(true)
    expect(pattern!.test('C:\\app\\node_modules\\.pnpm\\nuxt-actions@1.5.0\\node_modules\\nuxt-actions\\dist\\runtime\\server\\utils\\defineAction.js')).toBe(true)
    expect(pattern!.test('/app/node_modules/nuxt-actions-extra/dist/index.js')).toBe(false)
  })

  it('uses the built files next to the built plugin', () => {
    const built = resolve('dist/runtime/testing')

    expect(resolveTestingFiles(pathToFileURL(resolve(built, 'plugin.js')).href)).toEqual({
      runtime: resolve(built, 'runtime.js'),
      setup: resolve(built, 'setup.js'),
    })
  })
})
