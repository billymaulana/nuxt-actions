import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, it, expect } from 'vitest'
import * as runtime from '../../src/runtime/testing/runtime'

const H3_HELPERS = [
  'createError',
  'deleteCookie',
  'getCookie',
  'getHeader',
  'getHeaders',
  'getQuery',
  'getRequestHeader',
  'getRequestHeaders',
  'getRequestHost',
  'getRequestIP',
  'getRequestURL',
  'parseCookies',
  'readBody',
  'setCookie',
  'setHeader',
  'setResponseHeader',
  'setResponseStatus',
] as const

const utilFiles = readdirSync(fileURLToPath(new URL('../../src/runtime/server/utils/', import.meta.url)))
  .filter(file => file.endsWith('.ts'))
  .map(file => file.slice(0, -'.ts'.length))

const installed: string[] = []

afterAll(() => {
  for (const name of installed) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('testing setup', () => {
  it('installs every server util as a global, the way Nitro auto-imports them', async () => {
    await import('../../src/runtime/testing/setup')

    expect(utilFiles.length).toBeGreaterThan(10)
    for (const file of utilFiles) {
      const module = await import(`../../src/runtime/server/utils/${file}.ts`) as Record<string, unknown>
      for (const [name, value] of Object.entries(module)) {
        installed.push(name)
        expect(Reflect.get(globalThis, name), `${file}: ${name}`).toBe(value)
      }
    }
  })

  it('installs the common h3 helpers, bound to test events', async () => {
    await import('../../src/runtime/testing/setup')

    for (const name of H3_HELPERS) {
      installed.push(name)
      expect(Reflect.get(globalThis, name), name).toBe(runtime[name])
    }
  })
})
