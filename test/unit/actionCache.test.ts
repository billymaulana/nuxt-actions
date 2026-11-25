import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { createMemoryActionCacheStore, invalidateActionCache, setActionCacheStore } from '../../src/runtime/server/utils/actionCache'
import { callAction } from '../../src/runtime/server/utils/callAction'
import { createActionClient } from '../../src/runtime/server/utils/createActionClient'
import { createActionError, defineAction } from '../../src/runtime/server/utils/defineAction'
import { defineMiddleware } from '../../src/runtime/server/utils/defineMiddleware'
import type { ActionCacheEntry, ActionCacheStore } from '../../src/runtime/types'

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

function request(method = 'GET', waitUntil?: (promise: Promise<unknown>) => void) {
  return { method, path: '/api/_actions/report', headers: {}, waitUntil } as never
}

const route = { path: 'report' }
const empty = z.object({}).optional()

function counter() {
  let calls = 0
  return {
    handler: vi.fn(async ({ input }: { input: unknown }) => ({ call: ++calls, input })),
  }
}

beforeEach(() => {
  setActionCacheStore(createMemoryActionCacheStore())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createMemoryActionCacheStore', () => {
  it('returns an entry until its ttl runs out', async () => {
    vi.useFakeTimers()
    const store = createMemoryActionCacheStore()
    await store.set('a', { value: 1, staleAt: 0 }, 1000)

    expect(await store.get('a')).toEqual({ value: 1, staleAt: 0 })
    vi.advanceTimersByTime(1000)
    expect(await store.get('a')).toBeUndefined()
  })

  it('deletes one key and clears by prefix', async () => {
    const store = createMemoryActionCacheStore()
    await store.set('list:_:1', { value: 1, staleAt: 0 }, 1000)
    await store.set('list:_:2', { value: 2, staleAt: 0 }, 1000)
    await store.set('other:_:1', { value: 3, staleAt: 0 }, 1000)

    await store.delete('list:_:1')
    expect(await store.get('list:_:1')).toBeUndefined()
    await store.clear('list:')
    expect(await store.get('list:_:2')).toBeUndefined()
    expect(await store.get('other:_:1')).toEqual({ value: 3, staleAt: 0 })
  })

  it('keeps a copy, so changing the stored value later does not change the cache', async () => {
    const store = createMemoryActionCacheStore()
    const value = { items: [1] }
    await store.set('a', { value, staleAt: 0 }, 1000)
    value.items.push(2)

    expect(await store.get('a')).toEqual({ value: { items: [1] }, staleAt: 0 })
  })

  it('evicts the oldest entries past maxEntries', async () => {
    const store = createMemoryActionCacheStore({ maxEntries: 2 })
    await store.set('a', { value: 1, staleAt: 0 }, 1000)
    await store.set('b', { value: 2, staleAt: 0 }, 1000)
    await store.set('c', { value: 3, staleAt: 0 }, 1000)

    expect(await store.get('a')).toBeUndefined()
    expect(await store.get('c')).toEqual({ value: 3, staleAt: 0 })
  })
})

describe('defineAction cache', () => {
  it('serves the second GET with the same input from the cache', async () => {
    const { handler } = counter()
    const action = defineAction({ input: z.object({ page: z.number() }), cache: { maxAge: 60 }, handler })

    const first = await action._execute({ page: 1 }, request(), route)
    const second = await action._execute({ page: 1 }, request(), route)

    expect(first).toEqual({ success: true, data: { call: 1, input: { page: 1 } } })
    expect(second).toEqual(first)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('keeps results for different inputs apart', async () => {
    const { handler } = counter()
    const action = defineAction({ input: z.object({ page: z.number() }), cache: { maxAge: 60 }, handler })

    await action._execute({ page: 1 }, request(), route)
    const other = await action._execute({ page: 2 }, request(), route)

    expect(other).toMatchObject({ success: true, data: { call: 2 } })
  })

  it('caches HEAD requests but not other methods', async () => {
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    await action._execute(undefined, request('HEAD'), route)
    await action._execute(undefined, request('HEAD'), route)
    await action._execute(undefined, request('POST'), route)
    await action._execute(undefined, request('POST'), route)

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('does not cache without the route path', async () => {
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    await action._execute(undefined, request())
    await action._execute(undefined, request())

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('runs the handler again once maxAge has passed', async () => {
    vi.useFakeTimers()
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    await action._execute(undefined, request(), route)
    vi.advanceTimersByTime(59_999)
    await action._execute(undefined, request(), route)
    vi.advanceTimersByTime(1)
    const fresh = await action._execute(undefined, request(), route)

    expect(fresh).toMatchObject({ data: { call: 2 } })
  })

  it('serves a stale result with swr and refreshes it in the background', async () => {
    vi.useFakeTimers()
    const { handler } = counter()
    const waitUntil = vi.fn()
    const action = defineAction({ input: empty, cache: { maxAge: 60, swr: true }, handler })

    await action._execute(undefined, request(), route)
    vi.advanceTimersByTime(60_000)
    const stale = await action._execute(undefined, request('GET', waitUntil), route)

    expect(stale).toMatchObject({ data: { call: 1 } })
    expect(waitUntil).toHaveBeenCalledTimes(1)
    await waitUntil.mock.calls[0]![0]
    expect(await action._execute(undefined, request(), route)).toMatchObject({ data: { call: 2 } })
  })

  it('stops serving a stale result after staleMaxAge', async () => {
    vi.useFakeTimers()
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60, swr: true, staleMaxAge: 30 }, handler })

    await action._execute(undefined, request(), route)
    vi.advanceTimersByTime(90_000)

    expect(await action._execute(undefined, request(), route)).toMatchObject({ data: { call: 2 } })
  })

  it('runs one background refresh for concurrent stale requests', async () => {
    vi.useFakeTimers()
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60, swr: true }, handler })

    await action._execute(undefined, request(), route)
    vi.advanceTimersByTime(60_000)
    await Promise.all([
      action._execute(undefined, request(), route),
      action._execute(undefined, request(), route),
      action._execute(undefined, request(), route),
    ])
    await vi.runAllTimersAsync()

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('runs the handler once for concurrent misses', async () => {
    let release!: () => void
    const handler = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => {
      release = () => resolve({ ok: true })
    }))
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    const pending = Promise.all([
      action._execute(undefined, request(), route),
      action._execute(undefined, request(), route),
    ])
    await vi.waitFor(() => expect(handler).toHaveBeenCalled())
    release()

    expect(await pending).toEqual([{ success: true, data: { ok: true } }, { success: true, data: { ok: true } }])
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('starts over instead of waiting on a computation that has run longer than maxAge', async () => {
    vi.useFakeTimers()
    const handler = vi.fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({ ok: true })
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    void action._execute(undefined, request(), route)
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(action._execute(undefined, request(), route)).resolves.toEqual({ success: true, data: { ok: true } })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('keeps the newer computation when a replaced one settles late', async () => {
    vi.useFakeTimers()
    let failFirst!: () => void
    let finishSecond!: () => void
    const handler = vi.fn()
      .mockReturnValueOnce(new Promise((_resolve, reject) => {
        failFirst = () => reject(createActionError({ code: 'SLOW', message: 'Too slow' }))
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        finishSecond = () => resolve({ ok: true })
      }))
      .mockResolvedValue({ ok: 'unexpected' })
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    const first = action._execute(undefined, request(), route)
    await vi.advanceTimersByTimeAsync(60_000)
    const second = action._execute(undefined, request(), route)
    await vi.advanceTimersByTimeAsync(0)
    failFirst()
    await first
    const third = action._execute(undefined, request(), route)
    await vi.advanceTimersByTimeAsync(0)
    finishSecond()

    expect(await third).toEqual({ success: true, data: { ok: true } })
    expect(await second).toEqual({ success: true, data: { ok: true } })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failure', async () => {
    const handler = vi.fn()
      .mockRejectedValueOnce(createActionError({ code: 'BUSY', message: 'Try later', statusCode: 503 }))
      .mockResolvedValueOnce({ ok: true })
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    expect(await action._execute(undefined, request(), route)).toMatchObject({ success: false, error: { code: 'BUSY' } })
    expect(await action._execute(undefined, request(), route)).toEqual({ success: true, data: { ok: true } })
  })

  it('does not cache an output validation failure', async () => {
    const handler = vi.fn()
      .mockResolvedValueOnce({ id: 'bad' })
      .mockResolvedValueOnce({ id: 1 })
    const action = defineAction({ input: empty, outputSchema: z.object({ id: z.number() }), cache: { maxAge: 60 }, handler })

    expect(await action._execute(undefined, request(), route)).toMatchObject({ success: false, error: { code: 'OUTPUT_VALIDATION_ERROR' } })
    expect(await action._execute(undefined, request(), route)).toEqual({ success: true, data: { id: 1 } })
  })

  it('still runs middleware on a cache hit', async () => {
    const guard = vi.fn(async ({ next }) => next())
    const { handler } = counter()
    const action = defineAction({ input: empty, middleware: [defineMiddleware(guard)], cache: { maxAge: 60 }, handler })

    await action._execute(undefined, request(), route)
    await action._execute(undefined, request(), route)

    expect(guard).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('keeps results per key and gives key the validated input and the context', async () => {
    let user = 'ada'
    const key = vi.fn(({ ctx }: { ctx: { user: string } }) => ctx.user)
    const withUser = defineMiddleware(async ({ next }) => next({ ctx: { user } }))
    const { handler } = counter()
    const action = defineAction({
      input: z.object({ page: z.coerce.number() }),
      middleware: [withUser],
      cache: { maxAge: 60, key: key as never },
      handler,
    })

    await action._execute({ page: '1' }, request(), route)
    user = 'grace'
    const forGrace = await action._execute({ page: '1' }, request(), route)

    expect(forGrace).toMatchObject({ data: { call: 2 } })
    expect(key).toHaveBeenCalledWith(expect.objectContaining({ input: { page: 1 }, ctx: { user: 'ada' } }))
  })

  it('runs the handler when the store fails', async () => {
    setActionCacheStore({
      get: () => Promise.reject(new Error('Redis is down')),
      set: () => {
        throw new Error('Redis is down')
      },
      delete: () => {},
      clear: () => {},
    })
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    expect(await action._execute(undefined, request(), route)).toMatchObject({ success: true, data: { call: 1 } })
    expect(await action._execute(undefined, request(), route)).toMatchObject({ success: true, data: { call: 2 } })
  })

  it('is skipped by callAction', async () => {
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    await callAction(request(), action)
    await callAction(request(), action)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('serves the result as it was when it was cached', async () => {
    const todos = [{ id: 1 }]
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler: async () => todos })

    await action._execute(undefined, request(), route)
    todos.push({ id: 2 })

    expect(await action._execute(undefined, request(), route)).toEqual({ success: true, data: [{ id: 1 }] })
  })

  it('accepts an async key', async () => {
    const { handler } = counter()
    let user = 'ada'
    const action = defineAction({ input: empty, cache: { maxAge: 60, key: async () => user }, handler })

    await action._execute(undefined, request(), route)
    user = 'grace'
    await action._execute(undefined, request(), route)
    user = 'ada'
    await action._execute(undefined, request(), route)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('stores a swr result for maxAge plus staleMaxAge', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const set = vi.fn()
    setActionCacheStore({ get: () => undefined, set, delete: () => {}, clear: () => {} })

    await defineAction({ input: empty, cache: { maxAge: 60, swr: true }, handler: async () => 'a' })._execute(undefined, request(), route)
    await defineAction({ input: empty, cache: { maxAge: 60, swr: true, staleMaxAge: 30 }, handler: async () => 'b' })._execute(undefined, request(), route)

    expect(set.mock.calls.map(call => [call[1], call[2]])).toEqual([
      [{ value: 'a', staleAt: 61_000 }, 120_000],
      [{ value: 'b', staleAt: 61_000 }, 90_000],
    ])
  })

  it('rejects a maxAge or staleMaxAge that is not a usable number of seconds', () => {
    const handler = async () => 1
    for (const maxAge of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => defineAction({ input: empty, cache: { maxAge }, handler })).toThrow(/maxAge/)
    }
    expect(() => defineAction({ input: empty, cache: { maxAge: 60, swr: true, staleMaxAge: -1 }, handler })).toThrow(/staleMaxAge/)
    expect(() => defineAction({ input: empty, cache: { maxAge: 60, swr: true, staleMaxAge: Number.NaN }, handler })).toThrow(/staleMaxAge/)
    expect(() => defineAction({ input: empty, cache: { maxAge: 60, swr: true, staleMaxAge: 0 }, handler })).not.toThrow()
  })

  it('is available on the builder', async () => {
    const { handler } = counter()
    const action = createActionClient().cache({ maxAge: 60 }).schema(empty).action(handler)
    const withSchema = createActionClient().schema(z.object({ page: z.number() })).cache({ maxAge: 60 }).action(handler)

    await action._execute(undefined, request(), route)
    await action._execute(undefined, request(), route)
    await withSchema._execute({ page: 1 }, request(), { path: 'paged' })
    await withSchema._execute({ page: 1 }, request(), { path: 'paged' })

    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('invalidateActionCache', () => {
  async function seed() {
    let user = 'ada'
    const withUser = defineMiddleware(async ({ next }) => next({ ctx: { user } }))
    const { handler } = counter()
    const action = defineAction({
      input: z.object({ page: z.number() }),
      middleware: [withUser],
      cache: { maxAge: 60, key: ({ ctx }) => (ctx as { user: string }).user },
      handler,
    })
    const as = async (who: string, page: number) => {
      user = who
      return action._execute({ page }, request(), route)
    }
    await as('ada', 1)
    await as('ada', 2)
    await as('grace', 1)
    return { as, handler }
  }

  it('drops every result of an action', async () => {
    const { as, handler } = await seed()
    await invalidateActionCache('report')

    await as('ada', 1)
    await as('grace', 1)

    expect(handler).toHaveBeenCalledTimes(5)
  })

  it('drops the results of one key', async () => {
    const { as, handler } = await seed()
    await invalidateActionCache('report', { key: 'ada' })

    await as('ada', 1)
    await as('ada', 2)
    await as('grace', 1)

    expect(handler).toHaveBeenCalledTimes(5)
  })

  it('drops one input for one key', async () => {
    const { as, handler } = await seed()
    await invalidateActionCache('report', { key: 'ada', input: { page: 1 } })

    await as('ada', 1)
    await as('ada', 2)

    expect(handler).toHaveBeenCalledTimes(4)
  })

  it('drops one input of an action without a key', async () => {
    const { handler } = counter()
    const action = defineAction({ input: z.object({ page: z.number() }), cache: { maxAge: 60 }, handler })
    await action._execute({ page: 1 }, request(), route)
    await action._execute({ page: 2 }, request(), route)

    await invalidateActionCache('report', { input: { page: 1 } })
    await action._execute({ page: 1 }, request(), route)
    await action._execute({ page: 2 }, request(), route)

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('accepts the route path as well as the action path', async () => {
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })
    await action._execute(undefined, request(), { path: 'todos/list' })

    await invalidateActionCache('/api/_actions/todos/list')
    await action._execute(undefined, request(), { path: 'todos/list' })
    await invalidateActionCache('/todos/list')
    await action._execute(undefined, request(), { path: 'todos/list' })

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('keeps keys with the separator or the no-key marker apart', async () => {
    let keyValue: string | undefined = 'a:b'
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60, key: () => keyValue }, handler })
    await action._execute(undefined, request(), route)
    await invalidateActionCache('report', { key: 'a' })
    await action._execute(undefined, request(), route)
    keyValue = '_'
    await action._execute(undefined, request(), route)
    keyValue = undefined
    const anonymous = await action._execute(undefined, request(), route)

    expect(anonymous).toMatchObject({ data: { call: 3 } })
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('keeps entries apart in a store that treats "/" as ":"', async () => {
    const entries = new Map<string, ActionCacheEntry>()
    const normalize = (key: string) => key.replace(/[/\\]/g, ':')
    setActionCacheStore({
      get: key => entries.get(normalize(key)),
      set: (key, entry) => {
        entries.set(normalize(key), entry)
      },
      delete: (key) => {
        entries.delete(normalize(key))
      },
      clear: () => {},
    })
    const { handler } = counter()
    let keyValue = 'c'
    const action = defineAction({ input: empty, cache: { maxAge: 60, key: () => keyValue }, handler })

    await action._execute(undefined, request(), { path: 'a/b' })
    keyValue = 'b/c'
    const other = await action._execute(undefined, request(), { path: 'a' })

    expect(other).toMatchObject({ data: { call: 2 } })
  })

  it('rejects when the store fails', async () => {
    setActionCacheStore({
      get: () => undefined,
      set: () => {},
      delete: () => {},
      clear: () => Promise.reject(new Error('Redis is down')),
    })

    await expect(invalidateActionCache('report')).rejects.toThrow('Redis is down')
  })

  it('does not mix an empty key with no key', async () => {
    const { handler } = counter()
    let keyValue: string | undefined = ''
    const action = defineAction({ input: empty, cache: { maxAge: 60, key: () => keyValue }, handler })

    await action._execute(undefined, request(), route)
    keyValue = undefined
    await action._execute(undefined, request(), route)

    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('setActionCacheStore', () => {
  it('rejects something that is not a cache store', () => {
    expect(() => setActionCacheStore({ getItem: () => null } as never)).toThrow(/get, set, delete, and clear/)
  })

  it('uses the custom store', async () => {
    const entries = new Map<string, unknown>()
    const store: ActionCacheStore = {
      get: vi.fn(key => entries.get(key) as never),
      set: vi.fn((key, entry) => {
        entries.set(key, entry)
      }),
      delete: vi.fn(),
      clear: vi.fn(),
    }
    setActionCacheStore(store)
    const { handler } = counter()
    const action = defineAction({ input: empty, cache: { maxAge: 60 }, handler })

    await action._execute(undefined, request(), route)
    await action._execute(undefined, request(), route)

    expect(store.set).toHaveBeenCalledTimes(1)
    expect(vi.mocked(store.set).mock.calls[0]![2]).toBe(60_000)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
