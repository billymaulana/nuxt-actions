---
description: "Cache the results of GET actions on the server: maxAge, stale-while-revalidate, per-user keys, invalidation after writes, and shared stores."
---

# Caching

An expensive GET action can keep its result on the server and serve it to later requests, instead of running the handler every time.

```ts
// server/actions/products/list.get.ts
export default defineAction({
  input: z.object({ category: z.string() }),
  cache: { maxAge: 60 },
  handler: async ({ input }) => db.products.findMany({ where: { category: input.category } }),
})
```

For the next 60 seconds, a request for the same category gets the stored result without running the handler. The builder has the same option as `.cache()`:

```ts
export default createActionClient()
  .schema(z.object({ category: z.string() }))
  .cache({ maxAge: 60 })
  .action(async ({ input }) => db.products.findMany({ where: { category: input.category } }))
```

## How It Works

- Only `GET` and `HEAD` requests are cached: to an action in `server/actions/`, or to a `defineAction` used as a route in `server/api/`. [`callAction`](/api/call-action) always runs the handler.
- The cache sits after input validation and middleware, so authentication, CSRF checks, and rate limits still run on every request. A hit skips the handler and output validation.
- The cache key is the action path, the value of `key` (below), and a hash of the validated input. For a route in `server/api/` the path is the request path, such as `/api/products`, so each URL of a dynamic route is cached on its own.
- A cached action needs an `input` schema, `z.object({}).optional()` when it takes none, which also keeps `execute()` callable without an argument; `defineAction` throws without one. The schema drops query parameters the action does not know, so `?anything=1` cannot create a new entry. A schema that keeps unknown keys, such as `.passthrough()` or a loose object, gives that protection up.
- The input is keyed by its JSON form, so a `URL` or a `Date` from a transform keys by its value. An input with no JSON form, such as a class instance without `toJSON`, runs without the cache.
- Only successful results are stored. A failed call is never cached.
- Concurrent requests for the same entry share one handler run.
- A hit does not run the handler, so headers or cookies the handler sets are not sent with it. Set those in middleware.

::: warning What the handler reads from the request
Anything the handler reads from `event` and puts into its result, such as the `Host` header, other headers, or cookies, is not part of the key. One request with a forged `Host` would decide the result for everyone. Add such values to `key`, for example `key: ({ event }) => getRequestHost(event)`, or keep them out of cached results.
:::

## Per-User Results

::: warning
When a result depends on who is asking, include their identity in `key`. Otherwise the result of the first user is served to everyone.
:::

```ts
export default createActionClient()
  .use(requireUser)
  .schema(z.object({}).optional())
  .cache({ maxAge: 30, key: ({ ctx }) => String(ctx.user.id) })
  .action(async ({ ctx }) => db.orders.findMany({ where: { userId: ctx.user.id } }))
```

`key` receives `{ input, ctx, event }` after middleware, and may return a promise. Returning `undefined` stores the result without a key.

## Stale-While-Revalidate

```ts
cache: { maxAge: 60, swr: true, staleMaxAge: 300 }
```

With `swr`, a result older than `maxAge` is still served for up to `staleMaxAge` more seconds (default: `maxAge`), while a fresh one is computed in the background. Only one refresh runs per entry at a time. The refresh is handed to `event.waitUntil()` where the platform provides it, so a serverless function finishes it after responding. The handler then runs after the response was sent, so it must not set headers.

## Invalidation

Drop cached results in the action that changes the data:

```ts
// server/actions/products/create.post.ts
export default defineAction({
  input: productSchema,
  handler: async ({ input }) => {
    const product = await db.products.create(input)
    await invalidateActionCache('products/list', { input: { category: product.category } })
    return product
  },
})
```

| Call | Removes |
|------|---------|
| `invalidateActionCache('products/list')` | every result of the action |
| `invalidateActionCache('orders/list', { key: '42' })` | every result stored under key `'42'`, such as one user's |
| `invalidateActionCache('products/list', { input })` | the result for that input, stored without a key |
| `invalidateActionCache('orders/list', { key: '42', input })` | the one result for that key and input |

The path is the action path, `products/list` for `server/actions/products/list.get.ts`; the route path `/api/_actions/products/list` works too. For a route in `server/api/`, pass its request path, such as `/api/products`. `input` is the input as the handler received it, after validation.

A result that is still being computed when you invalidate is not stored, and the next request computes it again. With a shared store and several instances, a result computed on another instance while you invalidate can still be stored, so keep `maxAge` short for data that changes often.

`invalidateActionCache` rejects when the store fails. By then the mutation has already written its data, so failing the request invites a retry that writes twice. Log the failure instead, or pair the mutation with [idempotency](/guide/idempotency):

```ts
await invalidateActionCache('products/list').catch((error) => {
  console.error('Could not invalidate products/list', error)
})
```

Refreshes from the client, such as `refresh()` or `invalidates` in [useActionMutation](/api/use-action-mutation), go through the server cache, so they get the cached result until it is invalidated or expires. There is no option for a client to skip the cache, since that would let anyone run an expensive handler on demand.

## A Shared Store

The default store keeps up to 10,000 entries in the server process and drops the oldest first, so its memory is bounded by 10,000 times the size of a result. It stores the JSON form of each result, the same value the client receives, so a `Date` comes back as a string and `toJSON` is applied, as with a shared store. Put a rate limit in front of a public cached action, and when the app runs on several instances, or on serverless functions, switch to a shared store in a Nitro plugin:

```ts
// server/plugins/action-cache.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!)
const PREFIX = 'action-cache:'

export default defineNitroPlugin(() => {
  setActionCacheStore({
    async get(key) {
      const raw = await redis.get(PREFIX + key)
      return raw ? JSON.parse(raw) : undefined
    },
    async set(key, entry, ttlMs) {
      await redis.set(PREFIX + key, JSON.stringify(entry), 'PX', ttlMs)
    },
    async delete(key) {
      await redis.del(PREFIX + key)
    },
    async clear(prefix) {
      const pattern = `${PREFIX}${prefix.replace(/[*?[\]]/g, '\\$&')}*`
      let cursor = '0'
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500)
        if (keys.length > 0) await redis.del(...keys)
        cursor = next
      } while (cursor !== '0')
    },
  })
})
```

A store drops an entry once `ttlMs` has passed. Keys look like `<path>:<key or _>:<input hash>`, with `%`, `:`, `/`, `\`, `?`, and `#` escaped inside each part, so `clear(prefix)` never reaches another action or another key, even in stores that treat `/` as a separator or cut keys at `?`.

When `get` or `set` throws, the action runs as if nothing were cached, with a warning in development. `invalidateActionCache` passes store errors on to the caller, because a failed invalidation would otherwise leave stale data behind without a trace.

## Route Rules

Nitro's `routeRules` can cache a whole route, but a cached route answers before the action's middleware runs. That only suits public data. The `cache` option keeps authentication and rate limits in front of the cache.

## Cost

| Operation | Time | Space |
|-----------|------|-------|
| Look up a request | linear in the input size to serialize and hash it, plus sorting each object's keys; one store read | - |
| Store a result | one store write; the memory store copies the JSON form of the result, linear in its size | the copied result per entry |
| Concurrent misses for one entry | one handler run | one pending computation per entry |
| Invalidate one input | one hash and one store delete | - |
| Invalidate by path or key | the memory store scans its entries, O(n) | - |

The default store holds at most 10,000 entries, so its memory is at most 10,000 times the size of a result.

## Reference

```ts
interface ActionCacheConfig<TInput = unknown, TCtx = Record<string, unknown>> {
  /** Seconds a result stays fresh. */
  maxAge: number
  /** Serve a stale result while a fresh one is computed in the background. Default: false */
  swr?: boolean
  /** Seconds a stale result may still be served when `swr` is on. Default: maxAge */
  staleMaxAge?: number
  /** Extra part of the cache key, such as the user id. */
  key?: (args: { input: TInput, ctx: TCtx, event: ServerEvent }) => string | undefined | Promise<string | undefined>
}

interface ActionCacheStore {
  get: (key: string) => Promise<ActionCacheEntry | undefined> | ActionCacheEntry | undefined
  set: (key: string, entry: ActionCacheEntry, ttlMs: number) => Promise<void> | void
  delete: (key: string) => Promise<void> | void
  /** Remove every entry whose key starts with `prefix`. */
  clear: (prefix: string) => Promise<void> | void
}

interface ActionCacheEntry<T = unknown> {
  value: T
  /** Epoch milliseconds after which the value is stale. */
  staleAt: number
}

function invalidateActionCache(path: string, options?: { key?: string, input?: unknown }): Promise<void>
function setActionCacheStore(store: ActionCacheStore): void
function createMemoryActionCacheStore(options?: { maxEntries?: number }): ActionCacheStore
```

`maxAge` must be a positive number of seconds, `staleMaxAge` zero or more, and the action needs an `input` schema; `defineAction` throws a `TypeError` when the action file loads otherwise. `setActionCacheStore` throws when the store lacks one of its four functions, and `invalidateActionCache` rejects an `input` that has no JSON form.

`invalidateActionCache`, `setActionCacheStore`, and `createMemoryActionCacheStore` are auto-imported in the `server/` directory. To test cached actions, see [Testing](/guide/testing).
