---
layout: home

hero:
  name: nuxt-actions
  text: Type-Safe Server Actions for Nuxt
  tagline: Validated inputs, middleware chains, builder pattern, and optimistic updates. Works with Zod, Valibot, and ArkType through Standard Schema.
  image:
    src: /logo.svg
    alt: nuxt-actions
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Examples
      link: https://github.com/billymaulana/nuxt-actions-example
    - theme: alt
      text: Playground
      link: https://stackblitz.com/github/billymaulana/nuxt-actions-example

features:
  - icon: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5l-9-4m0 4a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m5.13 12A9.69 9.69 0 0 1 12 20.92A9.69 9.69 0 0 1 6.87 17c-.34-.5-.55-1.08-.55-1.7C6.32 13.45 8.71 12 12 12s5.68 1.45 5.68 3.3c0 .62-.2 1.2-.55 1.7"/></svg>
    title: Standard Schema Validation
    details: Use Zod, Valibot, ArkType, or any Standard Schema library. No vendor lock-in, no adapters.
  - icon: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v2H3v16h16v-8h2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m4 10l4-4l2 2l-4 4H7v-2m10-8V1h2v4h4v2h-4v4h-2V7h-4V5h4Z"/></svg>
    title: Builder Pattern
    details: Compose actions with shared middleware, schemas, and metadata using createActionClient().
  - icon: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89l.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7s-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9m-1 5v5l4.25 2.52l.77-1.28l-3.52-2.09V8z"/></svg>
    title: Optimistic Updates
    details: useOptimisticAction composable with instant UI feedback and automatic rollback on server error.
  - icon: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1L21 5v6c0 5.55-3.84 10.74-9 12c-5.16-1.26-9-6.45-9-12V5l9-4m-1 6v2h2V7h-2m0 4v6h2v-6h-2Z"/></svg>
    title: Middleware Chain
    details: Reusable, composable middleware with typed context accumulation. Publishable as npm packages.
  - icon: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="m17.66 11.2l-.06-.17l-2.68-6.22C14.69 4.33 14.2 4 13.66 4H10.3c-.54 0-1.03.33-1.26.8L6.36 11.02l-.06.17a2.99 2.99 0 0 0 2.96 3.49h1.27l-.31 1.79l-.02.15c0 .23.1.46.25.64l.64.55l3.97-3.96a.998.998 0 0 0 .29-.71c0-.15-.03-.29-.09-.42m-8.64.14L12 4.78l2.97 6.56H9.02Z"/></svg>
    title: Output Validation
    details: Validate server responses, not just inputs. Catch data leaks and contract violations before they reach the client.
  - icon: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9Z"/></svg>
    title: Zero Config
    details: Install, add to nuxt.config modules, done. All utilities -- defineAction, useAction, defineMiddleware -- are auto-imported.
---

<div class="vp-doc" style="max-width: 688px; margin: 2rem auto; padding: 0 24px;">

## Quick Example

Define a validated server action:

```ts
// server/api/todos.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    return await db.todo.create({ data: { title: input.title } })
  },
})
```

Call it from any component:

```vue
<script setup lang="ts">
const { execute, data, error, status } = useAction<
  { title: string },
  { id: number; title: string }
>('/api/todos')

async function addTodo() {
  await execute({ title: 'Buy milk' })
}
</script>

<template>
  <button @click="addTodo" :disabled="status === 'executing'">
    Add Todo
  </button>
  <p v-if="data">Created: {{ data.title }}</p>
  <p v-if="error" class="error">{{ error.message }}</p>
</template>
```

You get validated input, typed handler parameters, reactive state management, and a consistent error format -- with zero configuration.

<div style="text-align: center; margin-top: 2rem;">
  <a href="/guide/getting-started" class="VPButton medium brand" style="display: inline-block;">Read the full guide</a>
</div>

</div>
