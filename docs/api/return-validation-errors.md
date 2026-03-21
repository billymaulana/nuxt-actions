# returnValidationErrors()

Throw structured validation errors from an action handler. The error is returned to the client as `{ success: false, error: { code: 'VALIDATION_ERROR', fieldErrors: { ... } } }`.

## Type Signature

```ts
function returnValidationErrors(
  fieldErrors: Record<string, string[]>,
  message?: string,
): never
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fieldErrors` | `Record<string, string[]>` | Yes | Field names mapped to arrays of error messages |
| `message` | `string` | No | Top-level error message. Default: `'Validation failed'` |

---

## Behavior

Throws an `ActionError` with:
- `code`: `'VALIDATION_ERROR'`
- `statusCode`: `422`
- `fieldErrors`: The provided field errors
- `message`: The provided message or `'Validation failed'`

This error is caught by `defineAction`'s error handling and returned as a standard error response.

---

## Examples

### Check for Duplicate Email

```ts
export default defineAction({
  input: z.object({ email: z.string().email() }),
  handler: async ({ input }) => {
    const existing = await db.findUser(input.email)
    if (existing) {
      returnValidationErrors({ email: ['Email already taken'] })
    }
    return db.createUser(input)
  },
})
```

### Multiple Field Errors

```ts
export default defineAction({
  input: z.object({
    username: z.string(),
    email: z.string().email(),
  }),
  handler: async ({ input }) => {
    const errors: Record<string, string[]> = {}

    if (await db.usernameExists(input.username)) {
      errors.username = ['Username is taken']
    }
    if (await db.emailExists(input.email)) {
      errors.email = ['Email already registered']
    }

    if (Object.keys(errors).length > 0) {
      returnValidationErrors(errors, 'Registration failed')
    }

    return db.createUser(input)
  },
})
```

### vs Schema Validation

Schema validation (`input: z.object(...)`) runs **before** the handler. `returnValidationErrors` is for business logic validation that requires database queries or external API calls **inside** the handler.

```ts
export default defineAction({
  // Schema validation: runs first, catches format errors
  input: z.object({
    email: z.string().email(),
    inviteCode: z.string().min(6),
  }),
  handler: async ({ input }) => {
    // Business validation: runs second, requires DB queries
    const isValidCode = await db.validateInviteCode(input.inviteCode)
    if (!isValidCode) {
      returnValidationErrors({ inviteCode: ['Invalid or expired invite code'] })
    }
    return db.createUser(input)
  },
})
```

---

## Auto-Import

`returnValidationErrors` is auto-imported in the `server/` directory when the module is installed.

## See Also

- [defineAction](/api/define-action) -- Server action definition
- [createActionError](/api/create-action-error) -- General error creation
- [Error Handling Guide](/guide/error-handling) -- Error handling patterns
