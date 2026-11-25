---
description: "API reference for originMiddleware: reject cross-site mutations from the Fetch Metadata and Origin headers, with no token to issue or send."
---

# originMiddleware()

Rejects requests that change data when they come from another site. It reads the `Sec-Fetch-Site` header that browsers send, and falls back to `Origin` for browsers that do not send it yet. There is no token to issue, store, or send back, so client code needs no changes.

## Type Signature

```ts
function originMiddleware(config?: OriginConfig): ActionMiddleware
```

### Parameters

```ts
interface OriginConfig {
  /** Extra origins to trust, compared without case or a trailing slash, for example 'https://admin.example.com' */
  allowedOrigins?: string[]
  /** Reject mutations that carry neither Sec-Fetch-Site nor Origin. Default: false */
  requireOrigin?: boolean
  /** Error message. Default: 'Cross-origin request rejected' */
  message?: string
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `allowedOrigins` | `string[]` | No | `[]` | Origins that may call the action from another site |
| `requireOrigin` | `boolean` | No | `false` | Reject mutations without either header |
| `message` | `string` | No | `'Cross-origin request rejected'` | Error message for rejected requests |

---

## Behavior

`GET`, `HEAD`, and `OPTIONS` pass without a check. For `POST`, `PUT`, `PATCH`, and `DELETE`:

1. `Sec-Fetch-Site: same-origin` passes, and so does `none`, which the browser sends when the user started the request, for example from a bookmark.
2. An `Origin` listed in `allowedOrigins` passes.
3. Without `Sec-Fetch-Site`, an `Origin` whose host matches the request host passes. This covers browsers that do not send Fetch Metadata.
4. Everything else that names a source is rejected: another `Origin`, `Origin: null` (sandboxed frames, some redirects), a malformed `Origin`, and `Sec-Fetch-Site` values `same-site` and `cross-site`. A `cross-site` request is rejected even when its `Origin` host matches, such as an `http` page posting to the `https` site.
5. A request with neither header passes, because browsers always send one of them on a cross-site mutation. Calls from curl or another server look like this. Set `requireOrigin: true` to reject them.

Rejected requests fail with `CSRF_ERROR` and status `403`, the same code [csrfMiddleware](/api/csrf-middleware) uses.

The request host comes from the `Host` header. `X-Forwarded-Host` is not trusted, because a client can set it. Behind a proxy that rewrites `Host`, list your public origin in `allowedOrigins`, so browsers without Fetch Metadata still pass.

Each check is constant time: a header read, a `Set` lookup for `allowedOrigins`, and for the host fallback one URL parse. The middleware keeps no state.

Only the request's own method counts. An action called with [callAction](/api/call-action) from a GET route is not checked, because the outer request is not a mutation; expose mutations only through POST, PUT, PATCH, or DELETE routes.

::: tip Which CSRF middleware?
`originMiddleware` protects every browser that sends `Sec-Fetch-Site` (Chrome and Edge 76+, Firefox 90+, Safari 16.4+) and older browsers through `Origin`, with nothing to wire up on the client. Use [csrfMiddleware](/api/csrf-middleware) when you also need a token, for example to protect form posts from browsers that send neither header.
:::

---

## Examples

### Protect Every Mutation of a Client

```ts
// server/utils/clients.ts
export const actionClient = createActionClient()
  .use(originMiddleware())
```

```ts
// server/actions/todos/create.post.ts
export default actionClient
  .schema(z.object({ title: z.string().min(1) }))
  .action(async ({ input }) => db.todos.create(input))
```

### Allow a Second Site

```ts
export default defineAction({
  middleware: [originMiddleware({ allowedOrigins: ['https://admin.example.com'] })],
  input: z.object({ id: z.number() }),
  handler: async ({ input }) => db.todos.delete(input.id),
})
```

### Browser-Only Actions

```ts
// Reject calls that do not come from a browser at all
const browserOnly = originMiddleware({ requireOrigin: true })
```

---

## Auto-Import

`originMiddleware` is auto-imported in the `server/` directory when the module is installed.

## See Also

- [csrfMiddleware](/api/csrf-middleware) -- Token-based CSRF protection
- [Security Guide](/guide/security) -- Security best practices
- [Testing](/guide/testing) -- Test the origin check with `runAction`
