<p align="center">
  <img src=".github/assets/logo.svg" width="96" height="96" alt="nuxt-actions logo">
</p>

<h1 align="center">nuxt-actions</h1>

<p align="center">
  Type-safe server actions for Nuxt.<br>
  Validate input with Zod, Valibot, or ArkType, then call the action from any component with types inferred end to end.
</p>

<p align="center">
  <a href="https://npmjs.com/package/nuxt-actions"><img src="https://img.shields.io/npm/v/nuxt-actions/latest.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm version"></a>
  <a href="https://npm.chart.dev/nuxt-actions"><img src="https://img.shields.io/npm/dm/nuxt-actions.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm downloads"></a>
  <a href="https://codecov.io/gh/billymaulana/nuxt-actions"><img src="https://codecov.io/gh/billymaulana/nuxt-actions/graph/badge.svg" alt="Coverage"></a>
  <a href="https://npmjs.com/package/nuxt-actions"><img src="https://img.shields.io/npm/l/nuxt-actions.svg?style=flat&colorA=020420&colorB=00DC82" alt="License"></a>
  <a href="https://nuxt.com"><img src="https://img.shields.io/badge/Nuxt-3.7%2B%20%7C%204-020420?logo=nuxt" alt="Nuxt 3.7+ and 4"></a>
</p>

<p align="center">
  <a href="https://billymaulana.github.io/nuxt-actions/">Documentation</a> |
  <a href="https://billymaulana.github.io/nuxt-actions/guide/getting-started">Getting started</a> |
  <a href="https://github.com/billymaulana/nuxt-actions-example">Examples</a> |
  <a href="https://stackblitz.com/github/billymaulana/nuxt-actions-example">Open in StackBlitz</a> |
  <a href="./CHANGELOG.md">Changelog</a>
</p>

## Why nuxt-actions

Nuxt server routes are flexible, but every endpoint repeats the same work: parse the body, validate it, shape errors, and keep the client's types in sync by hand. nuxt-actions turns that into one file per action:

- **One definition, two sides.** Write the action once in `server/actions/`. The client imports a typed reference from `#actions`, so input and output types follow the server code with no manual generics.
- **Any validation library.** Zod, Valibot, ArkType, or any [Standard Schema](https://standardschema.dev/) library, with field-level errors in one consistent shape.
- **Built for production.** Middleware with typed context, retries, deduplication, optimistic updates, SSR queries, streaming, idempotency, rate limiting, and CSRF protection are part of the module, not something you assemble.

## Quick start

Add the module and a validation library:

```bash
npx nuxi module add nuxt-actions
pnpm add zod
```

Create an action. The file name becomes the endpoint. Actions use POST unless the file name ends in a method suffix such as `.get`:

```ts
// server/actions/create-todo.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title, done: false }
  },
})
```

Call it from a component. `data` is typed as `{ id: number, title: string, done: boolean }`:

```vue
<script setup lang="ts">
import { createTodo } from '#actions'

const { execute, data, error, isExecuting } = useAction(createTodo)
</script>

<template>
  <form @submit.prevent="execute({ title: 'Buy milk' })">
    <button :disabled="isExecuting">Add todo</button>
    <p v-if="data">Created {{ data.title }}</p>
    <p v-if="error">{{ error.fieldErrors?.title?.[0] ?? error.message }}</p>
  </form>
</template>
```

`defineAction`, `useAction`, and the other utilities are auto-imported. The [getting started guide](https://billymaulana.github.io/nuxt-actions/guide/getting-started) walks through the full setup.

## What is included

| Area | Highlights |
| --- | --- |
| Server | [`defineAction`](https://billymaulana.github.io/nuxt-actions/guide/define-action), the [`createActionClient` builder](https://billymaulana.github.io/nuxt-actions/guide/builder-pattern), [middleware](https://billymaulana.github.io/nuxt-actions/guide/middleware) with typed context, [output validation](https://billymaulana.github.io/nuxt-actions/guide/output-validation), [streaming](https://billymaulana.github.io/nuxt-actions/guide/streaming), [file uploads](https://billymaulana.github.io/nuxt-actions/guide/file-uploads), [idempotency](https://billymaulana.github.io/nuxt-actions/guide/idempotency) |
| Client | [`useAction`](https://billymaulana.github.io/nuxt-actions/guide/use-action), [SSR queries](https://billymaulana.github.io/nuxt-actions/guide/action-queries), [cache invalidation](https://billymaulana.github.io/nuxt-actions/guide/cache-invalidation), [optimistic updates](https://billymaulana.github.io/nuxt-actions/guide/optimistic-updates), [infinite queries](https://billymaulana.github.io/nuxt-actions/guide/infinite-queries), [form actions](https://billymaulana.github.io/nuxt-actions/guide/form-actions), [batch actions](https://billymaulana.github.io/nuxt-actions/guide/batch-actions) |
| Production | Retry with backoff, request deduplication and cancellation, [rate limiting and CSRF](https://billymaulana.github.io/nuxt-actions/guide/security), an [auth preset](https://billymaulana.github.io/nuxt-actions/guide/auth), [global hooks](https://billymaulana.github.io/nuxt-actions/guide/observability) |
| Tooling | [OpenAPI 3.1 and Swagger UI](https://billymaulana.github.io/nuxt-actions/guide/openapi), a Nuxt DevTools tab, [`npx nuxt-actions add`](https://billymaulana.github.io/nuxt-actions/guide/cli) scaffolding, type updates on save |

## Compatibility

| | Supported |
| --- | --- |
| Nuxt | 3.7 and later, every Nuxt 4 release |
| Server runtime | Nitro v2, and Nitro v3 on Nuxt 4.7+ ([details](https://billymaulana.github.io/nuxt-actions/guide/server-runtimes)) |
| Validation | Zod 3.24+ and 4, Valibot 1.0+, ArkType 2.1+, any Standard Schema library |
| Node.js | The version your Nuxt release requires (22 or 24 for Nuxt 4.7) |

Every release runs the same end-to-end suite on Nitro v2, Nitro v3, Nitro v3 without `nitroLegacy`, and a Nuxt 5 preview.

## How it compares

| | nuxt-actions | [trpc-nuxt](https://github.com/wobsoriano/trpc-nuxt) | [next-safe-action](https://github.com/TheEdoRan/next-safe-action) |
| --- | --- | --- | --- |
| Framework | Nuxt | Nuxt | Next.js |
| Validation | Any Standard Schema library | Zod | Zod, Yup, Valibot |
| End-to-end type inference | Yes | Yes | Yes |
| Builder pattern | Yes | No | Yes |
| Middleware with typed context | Yes | Yes | Yes |
| Optimistic updates | Yes | No | Yes |
| SSR queries | Yes | Yes | No |
| Streaming (SSE) | Yes | No | No |
| Retry and deduplication | Yes | No | No |
| Uses plain Nuxt server routes | Yes | No, tRPC protocol | Not applicable |

## Contributing

```bash
pnpm install
pnpm run dev:prepare   # build the module stub and generate types
pnpm run dev           # start the playground
pnpm run lint
pnpm run test:unit
pnpm run test:e2e      # Nitro v2, Nitro v3, and Nuxt 5 preview fixtures
pnpm run prepack       # build the module
```

Bug reports and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening one.

## Sponsors

If nuxt-actions saves you time, you can support its development on [GitHub Sponsors](https://github.com/sponsors/billymaulana).

## License

[MIT](./LICENSE)
