<p align="center">
  <img src=".github/assets/logo.svg" width="120" height="120" alt="nuxt-actions logo">
</p>

<h1 align="center">nuxt-actions</h1>

<p align="center">
  <a href="https://npmjs.com/package/nuxt-actions"><img src="https://img.shields.io/npm/v/nuxt-actions/latest.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm version"></a>
  <a href="https://npm.chart.dev/nuxt-actions"><img src="https://img.shields.io/npm/dm/nuxt-actions.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm downloads"></a>
  <a href="https://npmjs.com/package/nuxt-actions"><img src="https://img.shields.io/npm/l/nuxt-actions.svg?style=flat&colorA=020420&colorB=00DC82" alt="License"></a>
  <a href="https://nuxt.com"><img src="https://img.shields.io/badge/Nuxt-020420?logo=nuxt" alt="Nuxt"></a>
  <a href="https://codecov.io/gh/billymaulana/nuxt-actions"><img src="https://codecov.io/gh/billymaulana/nuxt-actions/graph/badge.svg" alt="codecov"></a>
</p>

<p align="center">
  <a href="https://billymaulana.github.io/nuxt-actions/">Documentation</a> |
  <a href="https://stackblitz.com/github/billymaulana/nuxt-actions-example">Playground</a> |
  <a href="https://github.com/billymaulana/nuxt-actions-example">Example</a>
</p>

<p align="center">
Type-safe server actions for Nuxt with <a href="https://standardschema.dev/">Standard Schema</a> validation, middleware, builder pattern, and optimistic updates.
</p>

<p align="center">
Works with <strong>Zod</strong>, <strong>Valibot</strong>, <strong>ArkType</strong>, and any Standard Schema compliant library.
</p>

---

- [Release Notes](/CHANGELOG.md)

## Features

- **Standard Schema** - Use Zod, Valibot, ArkType, or any compliant validation library
- **E2E Type Inference** - Import typed action references from `#actions` with zero manual generics
- **Builder Pattern** - `createActionClient()` for composing actions with shared middleware
- **Optimistic Updates** - `useOptimisticAction` with race-safe rollback
- **SSR Queries** - `useActionQuery` wraps `useAsyncData` for SSR, caching, and reactive re-fetching
- **Streaming Actions** - `defineStreamAction` + `useStreamAction` for real-time AI/streaming use cases
- **Retry/Backoff** - Native ofetch retry with `retry: true | number | { count, delay, statusCodes }`
- **Request Deduplication** - `dedupe: 'cancel' | 'defer'` to prevent duplicate requests
- **Custom Headers** - Per-request auth tokens via static headers or function
- **HMR Type Updates** - Action file changes update types without restarting dev server
- **DevTools Tab** - Nuxt DevTools integration showing registered actions
- **Security Hardened** - Prototype pollution protection, error message sanitization, double `next()` prevention
- **Output Validation** - Validate server responses, not just inputs
- **Middleware Chain** - Reusable, composable middleware with typed context accumulation
- **Type Tests** - 24 compile-time type tests verifying type inference correctness
- **Zero Config** - Auto-imported, works out of the box

## Quick Setup

Install the module:

```bash
npx nuxi module add nuxt-actions
```

Then install your preferred validation library:

```bash
# Zod (most popular)
pnpm add zod

# Valibot (smallest bundle)
pnpm add valibot

# ArkType (fastest runtime)
pnpm add arktype
```

That's it! All utilities are auto-imported.

## Usage

### Simple Mode: `defineAction`

Create type-safe API routes with automatic input validation:

```ts
// server/api/todos.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    const todo = await db.todo.create({ data: input })
    return todo
  },
})
```

Works with **any** Standard Schema library:

```ts
// With Valibot
import * as v from 'valibot'

export default defineAction({
  input: v.object({ title: v.pipe(v.string(), v.minLength(1)) }),
  handler: async ({ input }) => ({ id: Date.now(), title: input.title }),
})
```

```ts
// With ArkType
import { type } from 'arktype'

export default defineAction({
  input: type({ title: 'string > 0' }),
  handler: async ({ input }) => ({ id: Date.now(), title: input.title }),
})
```

### Builder Mode: `createActionClient`

Share middleware, metadata, and configuration across actions:

```ts
// server/utils/action-clients.ts
export const authClient = createActionClient()
  .use(authMiddleware)
  .use(rateLimitMiddleware)

export const adminClient = createActionClient()
  .use(authMiddleware)
  .use(adminMiddleware)
```

```ts
// server/api/admin/users.get.ts
import { z } from 'zod'
import { adminClient } from '~/server/utils/action-clients'

export default adminClient
  .schema(z.object({
    page: z.coerce.number().default(1),
  }))
  .metadata({ role: 'admin', action: 'list-users' })
  .action(async ({ input, ctx }) => {
    // ctx.user and ctx.isAdmin available from middleware chain
    return await db.user.findMany({
      skip: (input.page - 1) * 10,
      take: 10,
    })
  })
```

### Output Schema Validation

Validate what your server returns, not just what it receives:

```ts
export default defineAction({
  input: z.object({ id: z.string() }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
  handler: async ({ input }) => {
    return await db.user.findUnique({ where: { id: input.id } })
  },
})
```

### Client: `useAction`

Call server actions from Vue components with reactive state:

```vue
<script setup lang="ts">
const { execute, executeAsync, data, error, status, reset } = useAction<
  { title: string },
  { id: number; title: string }
>('/api/todos', {
  method: 'POST',
  onExecute(input) {
    console.log('Sending:', input)
  },
  onSuccess(data) {
    toast.success(`Created: ${data.title}`)
  },
  onError(error) {
    toast.error(error.message)
  },
})

// Option 1: Full result with success/error
async function handleSubmit(title: string) {
  const result = await execute({ title })
  if (result.success) console.log(result.data)
}

// Option 2: Direct data (throws on error)
async function handleSubmitAsync(title: string) {
  try {
    const todo = await executeAsync({ title })
    console.log(todo)
  } catch (err) {
    // err is ActionError
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit('Buy milk')">
    <button :disabled="status === 'executing'">
      {{ status === 'executing' ? 'Creating...' : 'Add Todo' }}
    </button>
    <p v-if="error" class="error">{{ error.message }}</p>
  </form>
</template>
```

### Optimistic Updates: `useOptimisticAction`

Instant UI updates with automatic rollback on server error:

```vue
<script setup lang="ts">
const todos = ref([
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Walk dog', done: true },
])

const { execute, optimisticData } = useOptimisticAction('/api/todos/toggle', {
  method: 'PATCH',
  currentData: todos,
  updateFn: (input, current) =>
    current.map(t => t.id === input.id ? { ...t, done: !t.done } : t),
  onError(error) {
    toast.error('Failed to update - changes reverted')
  },
})
</script>

<template>
  <ul>
    <li v-for="todo in optimisticData" :key="todo.id">
      <input
        type="checkbox"
        :checked="todo.done"
        @change="execute({ id: todo.id })"
      >
      {{ todo.title }}
    </li>
  </ul>
</template>
```

### Middleware

Create reusable middleware for cross-cutting concerns:

```ts
// server/utils/auth.ts
export const authMiddleware = defineMiddleware(async ({ event, next }) => {
  const session = await getUserSession(event)
  if (!session) {
    throw createActionError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      statusCode: 401,
    })
  }
  return next({ ctx: { user: session.user } })
})
```

Publish standalone middleware as npm packages:

```ts
// Published as `nuxt-actions-ratelimit`
export const rateLimitMiddleware = createMiddleware(async ({ event, next }) => {
  await checkRateLimit(event)
  return next()
})
```

### Error Handling

Throw typed errors from handlers or middleware:

```ts
throw createActionError({
  code: 'NOT_FOUND',
  message: 'Todo not found',
  statusCode: 404,
})

// With field-level errors
throw createActionError({
  code: 'VALIDATION_ERROR',
  message: 'Duplicate entry',
  statusCode: 422,
  fieldErrors: {
    email: ['Email is already taken'],
  },
})
```

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "statusCode": 422,
    "fieldErrors": {
      "title": ["Title is required"],
      "email": ["Invalid email address"]
    }
  }
}
```

## API Reference

### Server Utilities

#### `defineAction(options)`

| Option | Type | Description |
|--------|------|-------------|
| `input` | `StandardSchema` | Any Standard Schema compliant schema for input validation |
| `outputSchema` | `StandardSchema` | Schema for output validation |
| `middleware` | `ActionMiddleware[]` | Array of middleware functions |
| `metadata` | `Record<string, unknown>` | Metadata for logging/analytics |
| `handler` | `(params) => Promise<T>` | Handler receiving `{ input, event, ctx }` |

#### `createActionClient(options?)`

| Method | Description |
|--------|-------------|
| `.use(middleware)` | Add middleware to the chain |
| `.schema(inputSchema)` | Set input validation schema |
| `.metadata(meta)` | Attach metadata |
| **After `.schema()`:** | |
| `.outputSchema(schema)` | Set output validation schema |
| `.metadata(meta)` | Attach metadata |
| `.action(handler)` | Terminal - creates the event handler |

#### `defineMiddleware(fn)` / `createMiddleware(fn)`

Define a typed middleware function. `createMiddleware` is an alias that signals intent for publishable middleware.

#### `createActionError(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `code` | `string` | required | Error code identifier |
| `message` | `string` | required | Human-readable message |
| `statusCode` | `number` | `400` | HTTP status code |
| `fieldErrors` | `Record<string, string[]>` | - | Field-level errors |

### Client Composables

#### `useAction<TInput, TOutput>(path, options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | `HttpMethod` | `'POST'` | HTTP method |
| `headers` | `Record<string, string> \| () => Record` | - | Static or dynamic headers |
| `retry` | `boolean \| number \| RetryConfig` | `false` | Retry configuration |
| `dedupe` | `'cancel' \| 'defer'` | - | Request deduplication |
| `onExecute` | `(input) => void` | - | Called before fetch |
| `onSuccess` | `(data) => void` | - | Success callback |
| `onError` | `(error) => void` | - | Error callback |
| `onSettled` | `(result) => void` | - | Settled callback |

**Returns:** `{ execute, executeAsync, data, error, status, isIdle, isExecuting, hasSucceeded, hasErrored, reset }`

#### `useOptimisticAction<TInput, TOutput>(path, options)`

| Option | Type | Description |
|--------|------|-------------|
| `method` | `HttpMethod` | HTTP method (default: `'POST'`) |
| `headers` | `Record<string, string> \| () => Record` | Static or dynamic headers |
| `retry` | `boolean \| number \| RetryConfig` | Retry configuration |
| `currentData` | `Ref<TOutput>` | Source of truth data ref |
| `updateFn` | `(input, current) => TOutput` | Optimistic update function |

**Returns:** `{ execute, optimisticData, data, error, status, isIdle, isExecuting, hasSucceeded, hasErrored, reset }`

#### `useActionQuery(action, input?, options?)`

SSR-capable GET action query wrapping `useAsyncData`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `server` | `boolean` | `true` | Run on SSR |
| `lazy` | `boolean` | `false` | Don't block navigation |
| `immediate` | `boolean` | `true` | Execute immediately |
| `default` | `() => T` | - | Default value factory |

**Returns:** `{ data, error, status, pending, refresh, clear }`

#### `useStreamAction(action, options?)`

Client composable for streaming server actions:

| Option | Type | Description |
|--------|------|-------------|
| `onChunk` | `(chunk) => void` | Called for each chunk |
| `onDone` | `(allChunks) => void` | Called when stream completes |
| `onError` | `(error) => void` | Called on error |

**Returns:** `{ execute, stop, chunks, data, status, error }`

#### `defineStreamAction(options)`

Server-side streaming action with SSE:

| Option | Type | Description |
|--------|------|-------------|
| `input` | `StandardSchema` | Input validation schema |
| `middleware` | `ActionMiddleware[]` | Middleware chain |
| `handler` | `({ input, event, ctx, stream }) => void` | Streaming handler |

## Why nuxt-actions?

<table>
<tr>
<th align="left">Feature</th>
<th align="center">nuxt-actions</th>
<th align="center"><a href="https://github.com/wobsoriano/trpc-nuxt">trpc-nuxt</a></th>
<th align="center"><a href="https://github.com/TheEdoRan/next-safe-action">next-safe-action</a></th>
</tr>
<tr><td>Framework</td><td align="center">Nuxt</td><td align="center">Nuxt</td><td align="center">Next.js</td></tr>
<tr><td>Standard Schema (Zod + Valibot + ArkType)</td><td align="center">&#9989;</td><td align="center">Zod only</td><td align="center">Zod / Yup / Valibot</td></tr>
<tr><td>E2E type inference</td><td align="center">&#9989;</td><td align="center">&#9989;</td><td align="center">&#9989;</td></tr>
<tr><td>Builder pattern</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#9989;</td></tr>
<tr><td>Middleware with typed context</td><td align="center">&#9989;</td><td align="center">&#9989;</td><td align="center">&#9989;</td></tr>
<tr><td>Optimistic updates composable</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#9989;</td></tr>
<tr><td>SSR queries</td><td align="center">&#9989;</td><td align="center">&#9989;</td><td align="center">&#10060;</td></tr>
<tr><td>Streaming actions (SSE)</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#10060;</td></tr>
<tr><td>Retry / backoff</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#10060;</td></tr>
<tr><td>Request deduplication</td><td align="center">&#9989;</td><td align="center">&#11093;</td><td align="center">&#10060;</td></tr>
<tr><td>Output schema validation</td><td align="center">&#9989;</td><td align="center">&#9989;</td><td align="center">&#9989;</td></tr>
<tr><td>DevTools integration</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#10060;</td></tr>
<tr><td>HMR type updates</td><td align="center">&#9989;</td><td align="center">&#9989;</td><td align="center">&#10060;</td></tr>
<tr><td>Security hardening (6 layers)</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#10060;</td></tr>
<tr><td>Zero config</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#9989;</td></tr>
<tr><td>Nuxt-native (no protocol layer)</td><td align="center">&#9989;</td><td align="center">&#10060;</td><td align="center">&#10060;</td></tr>
</table>

## Sponsors

If you find this module useful, consider supporting the project:

<a href="https://github.com/sponsors/billymaulana">
  <img src="https://img.shields.io/badge/Sponsor-EA4AAA?logo=github-sponsors&logoColor=white&style=for-the-badge" alt="Sponsor">
</a>

## Contribution

<details>
  <summary>Local development</summary>

  ```bash
  # Install dependencies
  pnpm install

  # Generate type stubs
  pnpm run dev:prepare

  # Develop with the playground
  pnpm run dev

  # Run ESLint
  pnpm run lint

  # Run Vitest
  pnpm run test
  pnpm run test:watch

  # Build the module
  pnpm run prepack
  ```

</details>

## License

[MIT](./LICENSE)
