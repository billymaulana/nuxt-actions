---
description: "API reference for csrfMiddleware: issue a token cookie on safe requests and validate it on every mutation, with configurable names."
---

# csrfMiddleware()

CSRF token protection middleware for mutation actions. Generates cryptographic tokens on safe requests and validates them on mutations.

## Type Signature

```ts
function csrfMiddleware(config?: CsrfConfig): ActionMiddleware
```

### Parameters

```ts
interface CsrfConfig {
  /** Cookie name for the CSRF token. Default: '_csrf' */
  cookieName?: string
  /** Header name for the CSRF token. Default: 'x-csrf-token' */
  headerName?: string
  /** Token length in bytes. Default: 32 */
  tokenLength?: number
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cookieName` | `string` | No | `'_csrf'` | Cookie name for the token |
| `headerName` | `string` | No | `'x-csrf-token'` | Header name for the token |
| `tokenLength` | `number` | No | `32` | Token length in bytes |

---

## How It Works

1. **Safe requests** (GET, HEAD, OPTIONS): Keeps the token already stored in the cookie when it is well formed, otherwise generates a new one with `crypto.randomBytes`. The token is set as a `secure`, `sameSite: strict` cookie that client code can read, and passed to the handler as `ctx.csrfToken`.

2. **Mutation requests** (POST, PUT, PATCH, DELETE): Validates that:
   - The CSRF token cookie exists
   - The request header contains the token
   - Cookie and header values match (using timing-safe comparison)
   - The token is well formed: hex, with the length set by `tokenLength`

   The verified token is passed to the handler as `ctx.csrfToken`.

3. **On failure**: Throws an `ActionError` with code `CSRF_ERROR` and HTTP status `403`. The message says whether the token was missing, did not match, or was invalid.

The cookie is readable by design: this is the double-submit cookie pattern, where a cross-site page can send the cookie but cannot read it to fill the header.

::: tip Use a `__Host-` cookie name in production
`csrfMiddleware({ cookieName: '__Host-csrf' })` stops a sibling subdomain from overwriting the token cookie. Browsers only accept `__Host-` cookies that are `Secure`, use `Path=/`, and set no `Domain`, which this cookie already does, so nothing else needs to change.
:::

::: warning Plain HTTP
The cookie is always `Secure`. Every browser stores it over HTTPS, and Chrome and Firefox also accept it on `http://localhost`. Safari does not ([WebKit bug 232088](https://bugs.webkit.org/show_bug.cgi?id=232088)), and no browser accepts it on another plain-HTTP host, such as a LAN address used to test from a phone. There, the cookie is dropped and every mutation fails with `CSRF token missing`. Run `nuxt dev --https` to test CSRF-protected actions in those cases.
:::

---

## Client Integration

The cookie is created by the first safe request to an action that uses `csrfMiddleware`, and later safe requests keep the same token. Issue the token once, then send it back in the header on every mutation:

```ts
// server/actions/csrf.get.ts
export default defineAction({
  middleware: [csrfMiddleware()],
  handler: async ({ ctx }) => ({ token: ctx.csrfToken }),
})
```

```ts
// In a component or composable
import { csrf, createTodo } from '#actions'

function getCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('_csrf='))
    ?.split('=')[1] ?? ''
}

const { executeAsync: issueCsrfToken } = useAction(csrf)
onMounted(() => {
  if (!getCsrfToken()) issueCsrfToken()
})

const { execute } = useAction(createTodo, {
  headers: () => ({ 'x-csrf-token': getCsrfToken() }),
})
```

The `csrf` action also returns the token in its response, for clients that cannot read cookies.

---

## Examples

### Basic Usage

```ts
const protectedAction = createActionClient()
  .use(csrfMiddleware())
  .schema(z.object({ title: z.string() }))
  .action(async ({ input }) => {
    return db.createPost(input)
  })
```

### Custom Configuration

```ts
const protectedAction = createActionClient()
  .use(csrfMiddleware({
    cookieName: '__csrf',
    headerName: 'x-xsrf-token',
    tokenLength: 64,
  }))
```

### Combined with Rate Limiting

```ts
const secureAction = createActionClient()
  .use(rateLimitMiddleware({ limit: 20, window: 60000 }))
  .use(csrfMiddleware())
  .use(authMiddleware)
```

---

::: warning Mutations behind a GET route
`originMiddleware` and `csrfMiddleware` check the request's method, and only mutations are checked. When `callAction` runs an action from a GET route or from server middleware, the action's middleware sees that outer request, so a mutation reached that way is not protected. Expose a mutation only through a POST, PUT, PATCH, or DELETE route.
:::

## Auto-Import

`csrfMiddleware` is auto-imported in the `server/` directory when the module is installed.

## See Also

- [rateLimitMiddleware](/api/rate-limit-middleware) -- Rate limiting middleware
- [defineMiddleware](/api/define-middleware) -- Custom middleware creation
- [Security Guide](/guide/security) -- Security best practices
