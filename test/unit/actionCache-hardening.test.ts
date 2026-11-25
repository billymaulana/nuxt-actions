import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { entryKey } from '../../src/runtime/server/internal/actionCache'
import { createMemoryActionCacheStore, invalidateActionCache, setActionCacheStore } from '../../src/runtime/server/utils/actionCache'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { defineAction } from '../../src/runtime/server/utils/defineAction'
import type { ActionCacheEntry } from '../../src/runtime/types'

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: vi.fn(),
  getQuery: vi.fn(() => ({})),
  readBody: vi.fn(),
  readMultipartFormData: vi.fn(),
  createEventStream: vi.fn(),
  setHeader: vi.fn(),
  getRequestIP: vi.fn(() => '127.0.0.1'),
}))

function request(method = 'GET', path = '/api/_actions/report') {
  return { method, path, headers: {} } as never
}

const route = { path: 'report' }
const empty = z.object({}).optional()

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  setActionCacheStore(createMemoryActionCacheStore())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('invalidation while a result is being computed', () => {
  it('does not store a result computed before an invalidation, and later requests compute again', async () => {
    let version = 1
    const finish: Array<() => void> = []
    const handler = vi.fn(() => {
      const seen = version
      const run = deferred<{ version: number }>()
      finish.push(() => run.resolve({ version: seen }))
      return run.promise
    })
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    const before = action._execute(undefined, request(), route)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    version = 2
    await invalidateActionCache('report')
    const after = action._execute(undefined, request(), route)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
    finish[0]!()
    finish[1]!()

    expect(await before).toEqual({ success: true, data: { version: 1 } })
    expect(await after).toEqual({ success: true, data: { version: 2 } })
    expect(await action._execute(undefined, request(), route)).toEqual({ success: true, data: { version: 2 } })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('does not store the result being computed for one input once that input is invalidated', async () => {
    let version = 1
    const finish = new Map<number, () => void>()
    const handler = vi.fn(({ input }: { input: { page: number } }) => {
      const seen = version
      const run = deferred<string>()
      finish.set(handler.mock.calls.length, () => run.resolve(`v${seen} p${input.page}`))
      return run.promise
    })
    const action = defineAction({ input: z.object({ page: z.number() }), cache: { maxAge: 60 }, handler })

    const firstPage = action._execute({ page: 1 }, request(), route)
    const secondPage = action._execute({ page: 2 }, request(), route)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2))
    version = 2
    await invalidateActionCache('report', { input: { page: 1 } })
    finish.get(1)!()
    finish.get(2)!()
    expect(await firstPage).toMatchObject({ data: 'v1 p1' })
    expect(await secondPage).toMatchObject({ data: 'v1 p2' })

    const firstAgain = action._execute({ page: 1 }, request(), route)
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(3))
    finish.get(3)!()
    expect(await firstAgain).toMatchObject({ data: 'v2 p1' })
    expect(await action._execute({ page: 2 }, request(), route)).toMatchObject({ data: 'v1 p2' })
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('removes a result whose store write was still running when the cache was invalidated', async () => {
    const entries = new Map<string, ActionCacheEntry>()
    let finishWrite: (() => void) | undefined
    setActionCacheStore({
      get: key => entries.get(key),
      set: (key, entry) => new Promise<void>((resolve) => {
        finishWrite = () => {
          entries.set(key, entry)
          resolve()
        }
      }),
      delete: (key) => {
        entries.delete(key)
      },
      clear: (prefix) => {
        for (const key of [...entries.keys()]) {
          if (key.startsWith(prefix)) entries.delete(key)
        }
      },
    })
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler: async () => 'value' })

    const pending = action._execute(undefined, request(), route)
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'))
    await invalidateActionCache('report')
    finishWrite!()
    await pending

    expect(entries.size).toBe(0)
  })

  it('does not let a computation that was replaced overwrite the newer result', async () => {
    vi.useFakeTimers()
    const finish: Array<(value: { version: number }) => void> = []
    const handler = vi.fn(() => {
      const run = deferred<{ version: number }>()
      finish.push(run.resolve)
      return run.promise
    })
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    const stuck = action._execute(undefined, request(), route)
    await vi.advanceTimersByTimeAsync(60_000)
    const replacement = action._execute(undefined, request(), route)
    await vi.advanceTimersByTimeAsync(0)
    finish[1]!({ version: 2 })
    expect(await replacement).toEqual({ success: true, data: { version: 2 } })
    finish[0]!({ version: 1 })
    expect(await stuck).toEqual({ success: true, data: { version: 1 } })

    expect(await action._execute(undefined, request(), route)).toEqual({ success: true, data: { version: 2 } })
    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('cache keys', () => {
  it('keys an input by its JSON form, so different URLs are cached apart', async () => {
    const handler = vi.fn(async ({ input }: { input: { url: URL } }) => input.url.hostname)
    const action = defineAction({
      input: z.object({ url: z.string().transform(value => new URL(value)) }),
      cache: { maxAge: 60 },
      handler,
    })

    const results = [
      await action._execute({ url: 'https://evil.example/phish' }, request(), route),
      await action._execute({ url: 'https://docs.example.com/guide' }, request(), route),
      await action._execute({ url: 'https://evil.example/phish' }, request(), route),
    ]

    expect(results.map(result => result.success && result.data)).toEqual(['evil.example', 'docs.example.com', 'evil.example'])
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('runs without the cache when the input has no JSON form', async () => {
    class Secret {
      readonly #value: string
      constructor(value: string) {
        this.#value = value
      }

      reveal() {
        return this.#value
      }
    }
    const handler = vi.fn(async ({ input }: { input: { secret: Secret } }) => input.secret.reveal())
    const action = defineAction({
      input: z.object({ secret: z.string().transform(value => new Secret(value)) }),
      cache: { maxAge: 60 },
      handler,
    })

    const results = [
      await action._execute({ secret: 'a' }, request(), route),
      await action._execute({ secret: 'b' }, request(), route),
      await action._execute({ secret: 'a' }, request(), route),
    ]

    expect(results.map(result => result.success && result.data)).toEqual(['a', 'b', 'a'])
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('tells apart values that JSON would merge, and ignores the order of keys and members', () => {
    const key = (input: unknown) => entryKey('p', undefined, input)
    const distinct = [
      { n: null },
      { n: undefined },
      {},
      { n: Number.NaN },
      { n: Number.POSITIVE_INFINITY },
      { n: Number.NEGATIVE_INFINITY },
      { n: 1 },
      { n: '1' },
      { n: 1n },
      { d: new Date('2026-01-01T00:00:00.000Z') },
      { d: '2026-01-01T00:00:00.000Z' },
      { l: [1, 2] },
      { l: { 0: 1, 1: 2 } },
      { m: new Map([['a', 1]]) },
      { m: { a: 1 } },
      { s: new Set([1]) },
      { s: [1] },
      { r: /a/g },
      { r: '/a/g' },
      { d: new Date('not a date') },
      { b: true },
      { b: 'true' },
    ]

    expect(new Set(distinct.map(key)).size).toBe(distinct.length)
    expect(key({ a: 1, b: 2 })).toBe(key({ b: 2, a: 1 }))
    expect(key(new Map([['a', 1], ['b', 2]]))).toBe(key(new Map([['b', 2], ['a', 1]])))
    expect(key(new Set([1, 2]))).toBe(key(new Set([2, 1])))
    expect(key([undefined, 1])).not.toBe(key([null, 1]))
    expect(key(Object.assign(Object.create(null), { a: 1 }))).toBe(key({ a: 1 }))
  })

  it('cannot key an input that is cyclic or holds a function or symbol', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => entryKey('p', undefined, cyclic)).toThrow(TypeError)
    expect(() => entryKey('p', undefined, { run: () => 1 })).toThrow(TypeError)
    expect(() => entryKey('p', undefined, { tag: Symbol('x') })).toThrow(TypeError)
    expect(() => entryKey('p', undefined, { bytes: new Uint8Array([1]) })).toThrow(TypeError)
  })

  it('fails loudly when key returns something other than a string', async () => {
    const action = defineAction({ input: empty, cache: { maxAge: 60, key: (() => 42) as never }, handler: async () => 'value' })

    expect(await action._execute(undefined, request(), route)).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } })
  })

  it('rejects invalidation with an input that cannot be keyed', async () => {
    await expect(invalidateActionCache('report', { input: { run: () => 1 } })).rejects.toThrow(/cannot be used as a cache key/)
  })

  it('escapes ? and # so stores that cut keys there keep entries apart', async () => {
    const entries = new Map<string, ActionCacheEntry>()
    const cut = (key: string) => key.split(/[?#]/)[0]!
    setActionCacheStore({
      get: key => entries.get(cut(key)),
      set: (key, entry) => {
        entries.set(cut(key), entry)
      },
      delete: (key) => {
        entries.delete(cut(key))
      },
      clear: () => {},
    })
    let team = 'team?blue'
    const handler = vi.fn(async ({ input }: { input: { page: number } }) => `${team} ${input.page}`)
    const action = defineAction({ input: z.object({ page: z.number() }), cache: { maxAge: 60, key: () => team }, handler })

    const first = await action._execute({ page: 1 }, request(), route)
    const second = await action._execute({ page: 2 }, request(), route)
    team = 'team#red'
    const third = await action._execute({ page: 1 }, request(), route)
    const fourth = await action._execute({ page: 2 }, request(), route)

    expect([first, second, third, fourth].map(result => result.success && result.data)).toEqual(['team?blue 1', 'team?blue 2', 'team#red 1', 'team#red 2'])
  })
})

describe('the cache option', () => {
  it('needs an input schema, so a client cannot fill the cache with new query parameters', () => {
    const handler = async () => 1

    expect(() => defineAction({ cache: { maxAge: 60 }, handler })).toThrow(/input schema/)
    expect(() => createActionClient().cache({ maxAge: 60 }).action(handler)).toThrow(/input schema/)
    expect(() => defineAction({ input: z.object({}), cache: { maxAge: 60 }, handler })).not.toThrow()
  })

  it('caches a defineAction used as a regular route by its URL path', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })
    const get = (path: string) => (action as unknown as (event: never) => Promise<unknown>)(request('GET', path))

    await get('/api/products?page=1')
    await get('/api/products/')
    expect(handler).toHaveBeenCalledTimes(1)

    await invalidateActionCache('/api/products')
    await get('/api/products')
    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('the memory store', () => {
  it('stores the JSON form of a value, as the response and a shared store would', async () => {
    class Money {
      readonly format: () => string
      constructor(readonly cents: number) {
        this.format = () => `$${(cents / 100).toFixed(2)}`
      }

      toJSON() {
        return (this.cents / 100).toFixed(2)
      }
    }
    const store = createMemoryActionCacheStore()

    await store.set('a', { value: { price: new Money(150), at: new Date('2026-01-01T00:00:00.000Z') }, staleAt: 0 }, 1000)

    expect(await store.get('a')).toEqual({ value: { price: '1.50', at: '2026-01-01T00:00:00.000Z' }, staleAt: 0 })
  })
})
