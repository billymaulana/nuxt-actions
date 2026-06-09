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

1. **Safe requests** (GET, HEAD, OPTIONS): Generates a random token via `crypto.randomBytes` and sets it as an `httpOnly`, `secure`, `sameSite: strict` cookie.

2. **Mutation requests** (POST, PUT, PATCH, DELETE): Validates that:
   - The CSRF token cookie exists
   - The request header contains the token
   - Cookie and header values match (using timing-safe comparison)

3. **On mismatch**: Throws an `ActionError` with code `CSRF_ERROR` and HTTP status `403`.

---

## Client Integration

The client must read the CSRF token and include it in mutation requests:

```ts
// Read token from cookie
function getCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('_csrf='))
    ?.split('=')[1] ?? ''
}

// Include in action calls
const { execute } = useAction(createTodo, {
  headers: () => ({ 'x-csrf-token': getCsrfToken() }),
})
```

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

## Auto-Import

`csrfMiddleware` is auto-imported in the `server/` directory when the module is installed.

## See Also

- [rateLimitMiddleware](/api/rate-limit-middleware) -- Rate limiting middleware
- [defineMiddleware](/api/define-middleware) -- Custom middleware creation
- [Security Guide](/guide/security) -- Security best practices
