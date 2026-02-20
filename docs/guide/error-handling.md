# Error Handling

Every error in `nuxt-actions` follows a single, predictable structure -- whether it comes from input validation, middleware, your handler, or a network failure. This consistency means your client code can handle all errors the same way, and you never need to guess at the shape of an error response.

::: tip Working example
See error handling patterns in the [example /errors page](https://github.com/billymaulana/nuxt-actions-example/blob/master/pages/errors.vue) -- includes custom error codes, field-level errors, and error recovery.
:::

## The ActionError Structure

All errors conform to the `ActionError` interface:

```ts
interface ActionError {
  code: string                          // Machine-readable error identifier
  message: string                       // Human-readable description
  statusCode: number                    // HTTP status code
  fieldErrors?: Record<string, string[]> // Per-field validation messages
}
```

Every action response uses a discriminated union, so you always know whether you have data or an error:

```ts
// Success
{ success: true, data: { /* your return value */ } }

// Error
{ success: false, error: { code, message, statusCode, fieldErrors? } }
```

## Creating Errors with createActionError

`createActionError` is an auto-imported server utility for throwing structured errors from handlers and middleware. It produces an object that the runtime recognizes and returns to the client in the standard format.

### Basic usage

```ts
// server/api/todos/[id].delete.ts
export default defineAction({
  input: z.object({ id: z.coerce.number() }),
  handler: async ({ input }) => {
    const todo = await db.todo.findUnique({ where: { id: input.id } })

    if (!todo) {
      throw createActionError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
        statusCode: 404,
      })
    }

    await db.todo.delete({ where: { id: input.id } })
    return { deleted: true }
  },
})
```

### With field errors

When you need to communicate per-field problems that go beyond schema validation (such as uniqueness checks), attach `fieldErrors`:

```ts
// server/api/auth/register.post.ts
export default defineAction({
  input: z.object({
    email: z.string().email(),
    username: z.string().min(3).max(20),
    password: z.string().min(8),
  }),
  handler: async ({ input }) => {
    const existing = await db.user.findFirst({
      where: {
        OR: [
          { email: input.email },
          { username: input.username },
        ],
      },
    })

    if (existing) {
      const fieldErrors: Record<string, string[]> = {}

      if (existing.email === input.email) {
        fieldErrors.email = ['This email is already registered']
      }
      if (existing.username === input.username) {
        fieldErrors.username = ['This username is already taken']
      }

      throw createActionError({
        code: 'DUPLICATE_ENTRY',
        message: 'An account with this email or username already exists',
        statusCode: 422,
        fieldErrors,
      })
    }

    const user = await db.user.create({ data: input })
    return { id: user.id, email: user.email }
  },
})
```

### Default statusCode

If you omit `statusCode`, it defaults to `400`:

```ts
throw createActionError({
  code: 'INVALID_STATE',
  message: 'Order has already been shipped',
  // statusCode defaults to 400
})
```

## Automatic Validation Errors

When input fails schema validation, the module automatically returns a `VALIDATION_ERROR` with `statusCode: 422`. You do not need to write any error-handling code for this case.

Given this action:

```ts
export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
    email: z.string().email('Invalid email format'),
    age: z.number().min(0, 'Age must be positive'),
  }),
  handler: async ({ input }) => input,
})
```

Sending `{ title: "", email: "not-an-email", age: -5 }` produces:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "statusCode": 422,
    "fieldErrors": {
      "title": ["Title is required"],
      "email": ["Invalid email format"],
      "age": ["Age must be positive"]
    }
  }
}
```

The `fieldErrors` keys match the field paths from your schema, using dot notation for nested fields (for example, `address.city`). A special `_root` key is used for issues that do not map to a specific field.

## Error Categories

The module produces errors from several sources. Understanding these categories helps you handle them appropriately on the client.

| Code | Status | Source | Description |
|------|--------|--------|-------------|
| `VALIDATION_ERROR` | 422 | Input schema | Schema validation failed. Contains `fieldErrors`. |
| `OUTPUT_VALIDATION_ERROR` | 500 | Output schema | Server return value did not match the output schema. |
| `PARSE_ERROR` | 400 | Request body | Malformed JSON in the request body. |
| `INTERNAL_ERROR` | 500 | Unhandled throw | An unexpected error occurred in the handler. |
| `SERVER_ERROR` | varies | H3 `createError` | An H3 error was thrown (from Nuxt utilities). |
| `FETCH_ERROR` | 500 | Network | Client-side: the HTTP request itself failed (network error, timeout). |
| Custom codes | Custom | Your code | Any error you create with `createActionError`. |

## Security: Internal Errors Are Never Leaked

When an unhandled exception occurs in your handler or middleware -- a database connection error, a null reference, or anything you did not explicitly throw with `createActionError` -- the module returns a generic response:

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "statusCode": 500
  }
}
```

The actual error message, stack trace, and any sensitive details are **never** sent to the client. In development mode (`import.meta.dev`), the full error is printed to the server console for debugging.

This means you should always use `createActionError` for errors you want the client to see, and let unexpected errors be caught by the safety net.

## Handling Errors on the Client

### Using the error ref

The `error` ref from `useAction` is reactive and holds the most recent `ActionError` (or `null` when no error has occurred):

```vue
<script setup lang="ts">
const { execute, error, status } = useAction<
  { title: string },
  { id: number; title: string }
>('/api/todos', { method: 'POST' })
</script>

<template>
  <form @submit.prevent="execute({ title })">
    <input v-model="title" />
    <button :disabled="status === 'executing'">Create</button>

    <div v-if="error" class="error">
      <p>{{ error.message }}</p>
    </div>
  </form>
</template>
```

### Using the onError callback

The `onError` callback fires whenever an action fails. This is ideal for toast notifications or side effects that should not be rendered inline:

```ts
const { execute } = useAction<{ id: number }, void>('/api/todos', {
  method: 'DELETE',
  onError(error) {
    toast.error(error.message)
  },
  onSuccess() {
    toast.success('Todo deleted')
  },
})
```

### Using executeAsync with try/catch

`executeAsync` returns data directly on success or **throws** the `ActionError` on failure. Use it when you prefer imperative control flow:

```ts
const { executeAsync } = useAction<
  { email: string; password: string },
  { token: string }
>('/api/auth/login')

async function login() {
  try {
    const { token } = await executeAsync({
      email: email.value,
      password: password.value,
    })
    localStorage.setItem('token', token)
    router.push('/dashboard')
  } catch (err) {
    // err is typed as ActionError
    const error = err as ActionError
    if (error.code === 'INVALID_CREDENTIALS') {
      formError.value = error.message
    } else {
      toast.error('Something went wrong')
    }
  }
}
```

### Displaying field errors

Field errors from validation (or custom `fieldErrors`) map directly to form fields. Here is a complete pattern:

```vue
<script setup lang="ts">
import type { ActionError } from 'nuxt-actions'

const form = reactive({
  email: '',
  username: '',
  password: '',
})

const fieldErrors = ref<Record<string, string[]>>({})
const generalError = ref('')

const { execute, status } = useAction<
  typeof form,
  { id: number; email: string }
>('/api/auth/register', {
  method: 'POST',
  onError(error: ActionError) {
    if (error.fieldErrors) {
      fieldErrors.value = error.fieldErrors
      generalError.value = ''
    } else {
      fieldErrors.value = {}
      generalError.value = error.message
    }
  },
  onSuccess(data) {
    router.push('/welcome')
  },
})

function getFieldError(field: string): string | undefined {
  return fieldErrors.value[field]?.[0]
}

async function submit() {
  fieldErrors.value = {}
  generalError.value = ''
  await execute(form)
}
</script>

<template>
  <form @submit.prevent="submit">
    <div class="field">
      <label for="email">Email</label>
      <input id="email" v-model="form.email" type="email" />
      <span v-if="getFieldError('email')" class="field-error">
        {{ getFieldError('email') }}
      </span>
    </div>

    <div class="field">
      <label for="username">Username</label>
      <input id="username" v-model="form.username" />
      <span v-if="getFieldError('username')" class="field-error">
        {{ getFieldError('username') }}
      </span>
    </div>

    <div class="field">
      <label for="password">Password</label>
      <input id="password" v-model="form.password" type="password" />
      <span v-if="getFieldError('password')" class="field-error">
        {{ getFieldError('password') }}
      </span>
    </div>

    <p v-if="generalError" class="general-error">{{ generalError }}</p>

    <button type="submit" :disabled="status === 'executing'">
      {{ status === 'executing' ? 'Creating account...' : 'Register' }}
    </button>
  </form>
</template>

<style scoped>
.field-error {
  color: #e53e3e;
  font-size: 0.875rem;
}
.general-error {
  color: #e53e3e;
  padding: 0.5rem;
  background: #fff5f5;
  border-radius: 4px;
}
</style>
```

## Errors from Middleware

Middleware uses the same `createActionError` function. When middleware throws, the error is returned to the client identically to handler errors. This means clients do not need special handling for middleware vs handler errors -- the shape is always `ActionError`.

```ts
// Server: middleware throws
export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const session = await getUserSession(event)
  if (!session) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'Please log in to continue',
      statusCode: 401,
    })
  }
  return next({ ctx: { user: session.user } })
})

// Client: same error handling as any other error
const { execute } = useAction('/api/protected/resource', {
  onError(error) {
    if (error.statusCode === 401) {
      router.push('/login')
    }
  },
})
```

## Best Practices

### Use descriptive, machine-readable error codes

Error codes are meant for programmatic branching, not display. Use `SCREAMING_SNAKE_CASE` and be specific:

```ts
// Preferred: specific and descriptive
throw createActionError({ code: 'EMAIL_ALREADY_EXISTS', message: '...', statusCode: 422 })
throw createActionError({ code: 'INSUFFICIENT_CREDITS', message: '...', statusCode: 403 })
throw createActionError({ code: 'ORDER_ALREADY_SHIPPED', message: '...', statusCode: 409 })

// Avoid: vague codes that don't help client branching
throw createActionError({ code: 'ERROR', message: '...', statusCode: 400 })
throw createActionError({ code: 'FAILED', message: '...', statusCode: 400 })
```

### Always provide a meaningful statusCode

Match the HTTP status code to the nature of the error. This helps HTTP clients, proxies, and monitoring tools classify requests correctly:

| Status | When to use |
|--------|-------------|
| `400` | Malformed request or invalid business logic |
| `401` | Missing or invalid authentication |
| `403` | Authenticated but not authorized |
| `404` | Resource not found |
| `409` | Conflict (duplicate, already exists) |
| `422` | Validation failure (schema or business rule) |
| `429` | Rate limit exceeded |
| `500` | Server-side error (prefer letting the runtime handle these) |

### Use fieldErrors for form validation feedback

When an error relates to specific input fields, always include `fieldErrors` so the client can display per-field messages. This applies to both schema validation (automatic) and business-rule validation (manual):

```ts
// Business-rule validation with fieldErrors
throw createActionError({
  code: 'BOOKING_CONFLICT',
  message: 'The selected time slot is not available',
  statusCode: 422,
  fieldErrors: {
    date: ['This date is fully booked'],
    timeSlot: ['This time slot was just taken by another user'],
  },
})
```

### Handle errors in the onError callback for side effects

Reserve the reactive `error` ref for template rendering. Use `onError` for side effects like toast notifications, redirects, and analytics:

```ts
const { execute, error } = useAction('/api/checkout', {
  onError(err) {
    // Side effects
    analytics.track('checkout_failed', { code: err.code })
    toast.error(err.message)

    // Redirect on auth failure
    if (err.statusCode === 401) {
      router.push('/login')
    }
  },
})
```

### Centralize error handling for common patterns

If many actions need the same error handling (for example, redirecting on 401), extract it into a shared helper:

```ts
// composables/useAuthAction.ts
export function useAuthAction<TInput, TOutput>(
  path: string,
  options: UseActionOptions<TInput, TOutput> = {},
) {
  const router = useRouter()

  return useAction<TInput, TOutput>(path, {
    ...options,
    onError(error) {
      if (error.statusCode === 401) {
        router.push('/login')
        return
      }
      options.onError?.(error)
    },
  })
}
```

## Next Steps

- [useAction](/guide/use-action) -- Full client composable documentation
- [Middleware](/guide/middleware) -- How errors interact with the middleware chain
- [createActionError API](/api/create-action-error) -- Full API reference
