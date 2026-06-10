# defineAuthMiddleware()

Auth middleware preset for `createActionClient`. Resolves the current user into `ctx.user`, or rejects with a `401` when no user is found.

## Signature

```ts
function defineAuthMiddleware<TUser>(
  resolve: (event: H3Event) => TUser | null | undefined | Promise<TUser | null | undefined>,
  opts?: AuthMiddlewareOptions,
): ActionMiddleware
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resolve` | `(event: H3Event) => TUser \| null \| undefined \| Promise<...>` | Yes | Resolves the current user from the request. Return `null`/`undefined` for anonymous. |
| `opts` | `AuthMiddlewareOptions` | No | See below. |

### AuthMiddlewareOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `optional` | `boolean` | `false` | Allow anonymous access. When `true`, `ctx.user` is `null` instead of a 401. |
| `message` | `string` | `'Authentication required'` | Error message used for the 401 rejection. |

## Behavior

On a failed check the action returns the standard error envelope with code `UNAUTHORIZED` and status `401`. On success the resolved user is merged into the handler context as `ctx.user`.

## Examples

### Protect an action

```ts
import { getUserSession } from '#imports'

const authed = createActionClient()
  .use(defineAuthMiddleware(event => getUserSession(event).then(s => s.user ?? null)))

export default authed
  .schema(z.object({ title: z.string() }))
  .action(async ({ input, ctx }) => {
    return { author: ctx.user.id, title: input.title }
  })
```

### Custom session source (header / bearer token)

```ts
import { getHeader } from 'h3'

export default createActionClient()
  .use(defineAuthMiddleware((event) => {
    const id = getHeader(event, 'x-user-id')
    return id ? { id, name: `User ${id}` } : null
  }))
  .action(async ({ ctx }) => ({ user: ctx.user }))
```

### Optional auth

```ts
const maybeAuthed = createActionClient()
  .use(defineAuthMiddleware(resolveUser, { optional: true })) // ctx.user may be null
```

## Auto-Import

`defineAuthMiddleware` is auto-imported in `server/actions/` files when the `nuxt-actions` module is installed. No manual import is needed.

## See Also

- [Authentication guide](/guide/auth) — the full workflow with session sources
- [createActionClient](/api/create-action-client) — the builder this middleware plugs into
- [defineMiddleware](/api/define-middleware) — write custom middleware with typed context
