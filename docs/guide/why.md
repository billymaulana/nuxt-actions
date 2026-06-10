# Why nuxt-actions?

## The Problem

Nuxt provides excellent primitives for fetching data -- `useFetch`, `useAsyncData`, `$fetch` -- but offers no built-in pattern for **mutations and actions**. When you need to create a todo, update a user profile, or process a payment, you are on your own.

This leads to repetitive, error-prone code across every server route:

### Manual validation in every route

```ts
// server/api/todos.post.ts -- without nuxt-actions
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Manual validation -- repeated in every route
  if (!body.title || typeof body.title !== 'string') {
    throw createError({ statusCode: 422, message: 'Title is required' })
  }
  if (body.title.length > 200) {
    throw createError({ statusCode: 422, message: 'Title too long' })
  }

  const todo = await db.todo.create({ data: { title: body.title } })
  return todo
})
```

### No type safety for inputs

The `body` variable above is `unknown`. You get no autocomplete, no compile-time checks, and no guarantee that the data matches what you expect. Bugs hide until runtime.

### No middleware pattern

Authentication, rate limiting, and logging must be duplicated or wired up manually in every route. There is no composable way to say "this action requires auth" and have the context flow through.

### Inconsistent error handling

Some routes return `{ error: "..." }`, others throw `createError`, others return HTTP status codes with no body. The client has to guess the format.

### No optimistic updates

Instant UI feedback for mutations requires manual snapshot/rollback logic in every component. Most teams skip it entirely.

## The Solution

`nuxt-actions` solves all of these problems with a single, cohesive API:

```ts
// server/api/todos.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1).max(200),
  }),
  handler: async ({ input }) => {
    return await db.todo.create({ data: { title: input.title } })
  },
})
```

```vue
<script setup lang="ts">
const { execute, data, error, status } = useAction<
  { title: string },
  { id: number; title: string }
>('/api/todos')

await execute({ title: 'Buy milk' })
</script>
```

That is the entire implementation -- server and client. You get validated input, typed handler parameters, a consistent error format, and reactive state management.

## How a Request Flows

Every action call follows the same pipeline. There is no protocol layer and no client to configure -- it is a regular Nitro HTTP request with validation, middleware, and typing built in:

```
 Vue Component
      │  execute(input)            reactive state: data / error / status
      ▼
 useAction() ───────────── retry · dedupe · debounce · abort · transform
      │  $fetch (HTTP POST/GET)
      ▼
 /api/_actions/<name> ──── generated Nitro route
      │
      ▼
 middleware chain ───────── auth · rate limit · CSRF · custom (typed ctx)
      │  next({ ctx })
      ▼
 input schema ───────────── Standard Schema validation (Zod/Valibot/ArkType)
      │  typed input
      ▼
 handler({ input, ctx }) ── your business logic
      │
      ▼
 output schema (optional) ─ response validation
      │
      ▼
 ActionResult envelope ──── { success, data } | { success, error }
```

Because the boundary is plain HTTP, every action also works with `curl`, Postman, OpenAPI tooling, and any non-Nuxt client.

## What You Get

- **Automatic input validation** with field-level errors, powered by any [Standard Schema](/guide/standard-schema) library
- **Type-safe handlers** where `input` is inferred from your schema
- **Middleware chains** that accumulate typed context (auth, rate limiting, logging)
- **Builder pattern** for sharing middleware across actions with `createActionClient`
- **Output validation** to prevent data leaks and enforce API contracts
- **Optimistic updates** with automatic rollback via `useOptimisticAction`
- **Consistent error format** across all actions: `{ success, data }` or `{ success, error }`
- **Polling, infinite scroll, batch actions** for advanced data fetching patterns
- **Built-in security middleware (CSRF, rate limiting)** with zero-config defaults
- **Auto-imported utilities** -- no manual imports for `defineAction`, `useAction`, or `defineMiddleware`

## Comparison

| Feature | nuxt-actions | [trpc-nuxt](https://github.com/wobsoriano/trpc-nuxt) | [form-actions-nuxt](https://github.com/Hebilicious/form-actions-nuxt) | [nuxt-server-fn](https://github.com/antfu/nuxt-server-fn) |
|---------|:-:|:-:|:-:|:-:|
| Standard Schema (multi-library) | :white_check_mark: | :x: Zod only | :x: | :x: |
| Builder pattern | :white_check_mark: | :x: | :x: | :x: |
| Middleware with typed context | :white_check_mark: | :white_check_mark: | :x: | :x: |
| Optimistic updates composable | :white_check_mark: | :x: | :x: | :x: |
| SSR queries | :white_check_mark: | :white_check_mark: | :x: | :x: |
| Streaming actions (SSE) | :white_check_mark: | :x: | :x: | :x: |
| Retry / backoff | :white_check_mark: | :x: | :x: | :x: |
| Request deduplication | :white_check_mark: | :warning: Via tanstack | :x: | :x: |
| Output schema validation | :white_check_mark: | :white_check_mark: | :x: | :x: |
| DevTools integration | :white_check_mark: | :x: | :x: | :x: |
| HMR type updates | :white_check_mark: | :white_check_mark: | :x: | :x: |
| Security hardening (6 layers) | :white_check_mark: | :x: | :x: | :x: |
| Infinite scroll / pagination | :white_check_mark: | :warning: Via tanstack | :x: | :x: |
| Batch/parallel execution | :white_check_mark: | :x: | :x: | :x: |
| Polling & background refetch | :white_check_mark: | :warning: Via tanstack | :x: | :x: |
| Built-in CSRF middleware | :white_check_mark: | :x: | :x: | :x: |
| Built-in rate limiting | :white_check_mark: | :x: | :x: | :x: |
| Progressive enhancement | :white_check_mark: | :x: | :white_check_mark: | :x: |
| Auto-imported utilities | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: |
| Zero config | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: |
| Nuxt-native (no protocol layer) | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: |
| Actively maintained | :white_check_mark: | :white_check_mark: | :x: 30+ issues | :x: |

::: tip See it in action
Explore the [example repository](https://github.com/billymaulana/nuxt-actions-example) for real-world usage with CRUD, streaming, optimistic updates, middleware, and more.
:::

### vs trpc-nuxt

[trpc-nuxt](https://github.com/wobsoriano/trpc-nuxt) (780+ stars, 6K weekly downloads) brings the full tRPC stack to Nuxt. It is the most established option in this space, but introduces a custom protocol layer, router definitions, and client setup that sit outside Nuxt's conventions.

`nuxt-actions` uses Nuxt's native file-based routing and `$fetch`. There is no router to define, no client to configure, and no protocol overhead. Actions are regular Nitro event handlers -- they work with `curl`, Postman, and any HTTP client without a special adapter.

tRPC also depends on Zod specifically for validation. `nuxt-actions` accepts any Standard Schema library, giving you the freedom to choose Valibot for smaller bundles or ArkType for runtime performance.

### vs form-actions-nuxt

[form-actions-nuxt](https://github.com/Hebilicious/form-actions-nuxt) (136 stars, listed on [nuxt.com/modules](https://nuxt.com/modules/form-actions)) focuses on SvelteKit-inspired HTML form submissions with progressive enhancement. It targets a different use case -- form-centric interactions rather than general-purpose type-safe actions. The project has 30 open issues and has not been actively maintained.

### vs nuxt-server-fn

[nuxt-server-fn](https://github.com/antfu/nuxt-server-fn) (282 stars) by Anthony Fu lets you call server functions from the client as if they were local. It is a clean, minimal idea but has not been updated since its initial release. There is no input validation, no middleware, no optimistic updates, and no error standardization.

## Is This a Replacement For...?

If you arrive from another ecosystem, here is where `nuxt-actions` sits relative to the tools you already know:

**...raw `$fetch` / `useFetch`?** For mutations, yes. `$fetch` gives you a typed HTTP call and nothing else -- validation, error shape, retry, dedupe, cancellation, and loading state are all yours to rebuild per call site. `nuxt-actions` ships those once, server and client, while still using `$fetch` underneath. For pure reads that never mutate, keep using `useFetch`/`useAsyncData`.

**...tRPC?** It solves the same end-to-end typing problem without introducing a protocol. There is no router definition, no client setup, and no custom wire format -- actions are plain Nitro routes you can hit with `curl`, and types flow through the generated `#actions` module instead of a procedure tree. The trade-off: tRPC is framework-agnostic, `nuxt-actions` is deliberately Nuxt-native.

**...React/Next Server Actions?** Same concept -- typed server mutations callable from components -- adapted to Nuxt. Two deliberate differences: the HTTP boundary is explicit (inspectable, cacheable, OpenAPI-documentable) rather than compiler magic, and failures return a discriminated `{ success, error }` envelope instead of thrown exceptions you must catch.

**...TanStack Query?** Complementary, not competing. TanStack Query is a client-side cache manager; `nuxt-actions` is the typed server-action layer with lightweight query/invalidation helpers built on Nuxt's own `useAsyncData` cache. If you need normalized caches and offline persistence, run TanStack Query on top of action calls. For most Nuxt apps, `useActionQuery` + `useActionMutation` cover the read-invalidate loop without another dependency.

## When to Use nuxt-actions

`nuxt-actions` is designed for Nuxt applications that need structured server mutations. It is a good fit when:

- You have more than a handful of POST/PUT/DELETE endpoints
- You want validated, typed inputs without manual boilerplate
- You need shared middleware for auth, rate limiting, or logging
- You want consistent error responses across all actions
- You want optimistic updates without building the rollback logic yourself

If your application only reads data and rarely mutates, the built-in `useFetch` and `useAsyncData` composables are likely sufficient. `nuxt-actions` complements them -- it handles the write side while Nuxt handles the read side.
