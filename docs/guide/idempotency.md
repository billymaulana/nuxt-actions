# Idempotency

Double-clicked "Pay now" buttons, mobile retries on flaky networks, and duplicated webhooks all produce the same bug: the handler runs twice. The `idempotency` option makes duplicate requests safe — the first execution's result is stored and **replayed** for every duplicate, so the handler runs exactly once per key.

## Quick Start

Enable it on the action and send an `Idempotency-Key` header from the client:

```ts
// server/actions/pay.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({ amount: z.number().positive(), recipient: z.string() }),
  idempotency: { ttl: 60_000 },
  handler: async ({ input }) => {
    return await chargeCustomer(input)
  },
})
```

```vue
<script setup lang="ts">
import { pay } from '#actions'

const idempotencyKey = crypto.randomUUID()
const { execute, isExecuting } = useAction(pay, {
  headers: { 'Idempotency-Key': idempotencyKey },
})
</script>
```

Spamming the button now replays the stored result — same `txId`, one charge. Generate a fresh key for each new logical operation (e.g. when the form resets).

## Semantics

The behavior follows the industry convention (Stripe-style):

| Situation | Behavior |
|-----------|----------|
| No key sent | Executes normally (unless `required: true`) |
| Known key, same payload | Replays the stored result; handler is **not** run. Response carries an `idempotency-replayed: true` header |
| Known key, different payload | `422 IDEMPOTENCY_KEY_REUSE` — keys are bound to one payload |
| Concurrent duplicate (in flight) | Awaits the original execution; handler runs once |
| Missing key with `required: true` | `400 IDEMPOTENCY_KEY_REQUIRED` |
| First request **failed** | Nothing is stored — the client may retry with the same key |
| Store/resolver outage | `503 IDEMPOTENCY_STORE_ERROR` — fails closed (the handler is not run) rather than risking a double-execution |

Only successful results are stored. Failures stay retryable by design.

## Options

```ts
idempotency: {
  /* How long results stay replayable. Default: 24 hours */
  ttl: 86_400_000,
  /* Header carrying the key. Default: 'Idempotency-Key' */
  header: 'Idempotency-Key',
  /* Reject requests without a key. Default: false */
  required: true,
  /* Resolve the key from anywhere — overrides the header lookup */
  key: event => getHeader(event, 'x-request-id'),
  /* Mix an identity into the key — REQUIRED for per-user actions, see below */
  scope: async event => (await getUserSession(event)).user?.id ?? 'anon',
  /* Pluggable storage — default is per-process in-memory with TTL pruning */
  store: myStore,
}
```

## With the Builder

`createActionClient` chains `.idempotency()` like any other builder step:

```ts
export default createActionClient()
  .use(authMiddleware)
  .idempotency({ required: true })
  .schema(z.object({ amount: z.number() }))
  .action(async ({ input, ctx }) => transfer(ctx.user, input.amount))
```

## Custom Storage

The default store is in-memory and per-process — duplicates are only detected by the instance that served the first request. For multi-instance deployments, plug in shared storage:

```ts
// server/utils/idempotency-store.ts
import { useStorage } from '#imports'
import type { IdempotencyRecord, IdempotencyStore } from 'nuxt-actions/types'

export function redisIdempotencyStore(): IdempotencyStore {
  const storage = useStorage('redis')
  return {
    async get(key) {
      return await storage.getItem<IdempotencyRecord>(`idem:${key}`)
    },
    async set(key, record, ttlMs) {
      await storage.setItem(`idem:${key}`, record, { ttl: Math.ceil(ttlMs / 1000) })
    },
  }
}
```

Store writes are best-effort: if `set()` rejects, the successful result is still returned to the client (only the replay guarantee degrades). The bundled in-memory store is bounded (10,000 entries, oldest evicted) so unauthenticated key floods cannot exhaust memory.

## Scope Keys Per User

Replay happens **before** validation and middleware: a replayed request does not re-run auth or rate limiting. Without a scope, any client presenting the same key on the same action would receive the stored result. For any action touching per-user data, bind the key to an identity:

```ts
idempotency: {
  scope: async event => (await getUserSession(event)).user?.id ?? 'anon',
}
```

::: warning Hard guarantees need the database
Idempotency replay is a best-effort UX and load shield. For money movement, pair it with a unique constraint on the transaction reference in your database — that is the only guarantee that survives storage loss and race conditions across regions.
:::

## Why an Option, Not Middleware?

Middleware in nuxt-actions runs strictly **before** the handler and never sees the response, so it cannot capture a result to replay later. Idempotency lives in `defineAction` itself — the one place that controls both the request (to check the key) and the response (to store it).

## Next Steps

- [Error Handling](/guide/error-handling) -- `IDEMPOTENCY_KEY_REUSE` and friends in the typed code union
- [Idempotency API](/api/idempotency) -- Full option and store reference
- [Security](/guide/security) -- Rate limiting and CSRF for the same actions
