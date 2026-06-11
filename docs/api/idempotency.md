# Idempotency

Replay protection for actions, keyed by the `Idempotency-Key` request header. Configured via the `idempotency` option on [`defineAction`](/api/define-action) or the `.idempotency()` builder step on [`createActionClient`](/api/create-action-client).

## Configuration

### Signature

```ts
interface IdempotencyConfig {
  ttl?: number
  header?: string
  required?: boolean
  key?: (event: H3Event) => string | null | undefined | Promise<string | null | undefined>
  scope?: (event: H3Event) => string | Promise<string>
  store?: IdempotencyStore
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `86_400_000` (24h) | How long a stored result stays replayable, in milliseconds. |
| `header` | `string` | `'Idempotency-Key'` | Request header carrying the key. |
| `required` | `boolean` | `false` | Reject keyless requests with `400 IDEMPOTENCY_KEY_REQUIRED`. |
| `key` | `(event) => string \| null` | header lookup | Custom key resolver. Return `null`/`undefined` for "no key". |
| `scope` | `(event) => string` | none | Identity component mixed into the store key (e.g. session user id). Replay skips middleware/auth, so per-user actions should always set this. |
| `store` | `IdempotencyStore` | bounded in-memory | Pluggable storage for stored results. |

## Behavior

- **Replay**: a duplicate key with the same payload returns the stored result without running the handler, and sets the `idempotency-replayed: true` response header.
- **Conflict**: a duplicate key with a *different* payload returns `422 IDEMPOTENCY_KEY_REUSE`. Payloads are compared by a stable fingerprint of the raw input.
- **Concurrency**: a duplicate that arrives while the first request is still executing awaits that execution (per process) — the handler never runs twice.
- **Failures are not stored**: a failed result may be retried with the same key.
- Keys are scoped per action path; the same key on two different actions never collides.

## Examples

### defineAction option

```ts
export default defineAction({
  input: z.object({ amount: z.number().positive() }),
  idempotency: { ttl: 60_000, required: true },
  handler: async ({ input }) => chargeCustomer(input),
})
```

### Builder

```ts
export default createActionClient()
  .use(authMiddleware)
  .idempotency()
  .schema(z.object({ amount: z.number() }))
  .action(async ({ input, ctx }) => transfer(ctx.user, input.amount))
```

### Client

```ts
import { pay } from '#actions'

const key = crypto.randomUUID()
const { execute } = useAction(pay, {
  headers: { 'Idempotency-Key': key },
})
```

## IdempotencyStore

### Signature

```ts
interface IdempotencyRecord {
  fingerprint: string
  result: ActionResult<unknown>
}

interface IdempotencyStore {
  get: (key: string) => Promise<IdempotencyRecord | null | undefined> | IdempotencyRecord | null | undefined
  set: (key: string, record: IdempotencyRecord, ttlMs: number) => Promise<void> | void
}
```

### createMemoryIdempotencyStore()

The default store: per-process, in-memory, TTL-checked on read, and bounded — when `maxEntries` (default 10,000) is exceeded, the oldest entries are evicted. Store writes are best-effort: a rejecting `set()` never fails the action response. Auto-imported in server code, useful when several actions should share one explicit store instance:

```ts
// server/utils/payments.ts
export const paymentStore = createMemoryIdempotencyStore()
```

```ts
export default defineAction({
  idempotency: { store: paymentStore },
  handler: async ({ input }) => pay(input),
})
```

For multi-instance deployments, implement the two-method interface over shared storage (Redis, database) — see the [guide](/guide/idempotency#custom-storage).

## Error Codes

| Code | Status | When |
|------|--------|------|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | `required: true` and no key present |
| `IDEMPOTENCY_KEY_REUSE` | 422 | Same key, different payload |
| `IDEMPOTENCY_STORE_ERROR` | 503 | The store (or a key/scope resolver) failed — fails closed without running the handler |

## See Also

- [Idempotency guide](/guide/idempotency) -- semantics, custom storage, and the database caveat
- [defineAction](/api/define-action) -- the option lives here
- [createActionClient](/api/create-action-client) -- builder integration
