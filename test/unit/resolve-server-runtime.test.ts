import { describe, it, expect, vi } from 'vitest'
import { resolveServerRuntime } from '../../src/module'

const paths = { nitro2: '/runtime/nitro2', portable: '/runtime/portable' }

describe('resolveServerRuntime', () => {
  it('uses the nitro2 runtime when @nuxt/kit has no resolveServerVariant', () => {
    expect(resolveServerRuntime(paths, undefined)).toBe('/runtime/nitro2')
  })

  it('uses the nitro2 runtime when the host runs neither variant', () => {
    expect(resolveServerRuntime(paths, () => undefined)).toBe('/runtime/nitro2')
  })

  it('falls back to the nitro2 runtime and reports the error when the host rejects the variants', () => {
    const failure = new Error('Unsupported server variant')
    const onError = vi.fn()

    expect(resolveServerRuntime(paths, () => {
      throw failure
    }, onError)).toBe('/runtime/nitro2')
    expect(onError).toHaveBeenCalledWith(failure)
  })

  it('offers both variants to the host and uses its pick', () => {
    const resolveVariant = vi.fn(() => '/runtime/portable')

    expect(resolveServerRuntime(paths, resolveVariant)).toBe('/runtime/portable')
    expect(resolveVariant).toHaveBeenCalledWith({ nitro2: '/runtime/nitro2', nuxt: '/runtime/portable' })
  })
})
