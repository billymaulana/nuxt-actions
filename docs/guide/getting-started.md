# Getting Started

This guide walks you through installing `nuxt-actions`, creating your first type-safe server action, and calling it from a Vue component. By the end you will have a working form that validates input on the server, returns typed data, and handles errors gracefully on the client.

## Prerequisites

- Nuxt 3.0 or later (Nuxt 4 is fully supported)
- Node.js 18+
- One of the supported validation libraries (see below)

## Installation

### Step 1 -- Add the module

The fastest way is `nuxi`:

```bash
npx nuxi module add nuxt-actions
```

Or install manually with your preferred package manager:

::: code-group

```bash [pnpm]
pnpm add nuxt-actions
```

```bash [npm]
npm install nuxt-actions
```

```bash [yarn]
yarn add nuxt-actions
```

:::

### Step 2 -- Install a validation library

`nuxt-actions` works with any library that implements the [Standard Schema](https://standardschema.dev/) interface. Pick the one you prefer:

::: code-group

```bash [Zod]
pnpm add zod
```

```bash [Valibot]
pnpm add valibot
```

```bash [ArkType]
pnpm add arktype
```

:::

::: info Minimum versions
Zod 3.24+, Valibot 1.0+, and ArkType 2.1+ are required. These are the first versions of each library that ship with Standard Schema support.
:::

### Step 3 -- Register the module

If you used `nuxi module add`, this step is already done. Otherwise, add the module to your `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-actions'],
})
```

That is all the configuration required. Every server utility (`defineAction`, `createActionClient`, `defineMiddleware`, `createMiddleware`, `createActionError`) is auto-imported in your `server/` directory, and every client composable (`useAction`, `useOptimisticAction`) is auto-imported in your Vue components and pages.

## Configuration

The module exposes a single option under the `actions` key:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-actions'],

  actions: {
    // Disable the module entirely (useful for conditional loading)
    enabled: true, // default
  },
})
```

In most projects you will not need to change any options.

## Your First Action

### 1. Define a server action

Create a new file in your `server/api/` directory. The file name determines the route path and HTTP method:

```ts
// server/api/contacts.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Must be a valid email address'),
    message: z.string().min(10, 'Message must be at least 10 characters'),
  }),
  handler: async ({ input, event }) => {
    // input is fully typed: { name: string; email: string; message: string }
    const contact = await $fetch('https://api.example.com/contacts', {
      method: 'POST',
      body: input,
    })

    return {
      id: contact.id,
      submittedAt: new Date().toISOString(),
    }
  },
})
```

This single file gives you:

- **Input validation** -- The request body is validated against the Zod schema before the handler runs. If validation fails, a `422` response is returned with field-level error messages.
- **Type inference** -- The `input` parameter inside the handler is typed as `{ name: string; email: string; message: string }` with no manual type annotations.
- **Consistent response format** -- The handler return value is wrapped in `{ success: true, data: ... }`. Errors are wrapped in `{ success: false, error: ... }`.

### 2. Call it from a component

```vue
<!-- pages/contact.vue -->
<script setup lang="ts">
interface ContactInput {
  name: string
  email: string
  message: string
}

interface ContactResult {
  id: string
  submittedAt: string
}

const form = reactive<ContactInput>({
  name: '',
  email: '',
  message: '',
})

const { execute, data, error, status, reset } = useAction<ContactInput, ContactResult>(
  '/api/contacts',
  {
    onSuccess(result) {
      // Reset the form after successful submission
      Object.assign(form, { name: '', email: '', message: '' })
    },
  },
)

async function submit() {
  await execute({ ...form })
}
</script>

<template>
  <form @submit.prevent="submit">
    <div>
      <label for="name">Name</label>
      <input id="name" v-model="form.name" />
      <span v-if="error?.fieldErrors?.name" class="field-error">
        {{ error.fieldErrors.name[0] }}
      </span>
    </div>

    <div>
      <label for="email">Email</label>
      <input id="email" v-model="form.email" type="email" />
      <span v-if="error?.fieldErrors?.email" class="field-error">
        {{ error.fieldErrors.email[0] }}
      </span>
    </div>

    <div>
      <label for="message">Message</label>
      <textarea id="message" v-model="form.message" rows="4" />
      <span v-if="error?.fieldErrors?.message" class="field-error">
        {{ error.fieldErrors.message[0] }}
      </span>
    </div>

    <button type="submit" :disabled="status === 'executing'">
      {{ status === 'executing' ? 'Sending...' : 'Send Message' }}
    </button>

    <div v-if="status === 'success'" class="success-message">
      Message sent successfully (ID: {{ data?.id }})
    </div>

    <div v-if="error && !error.fieldErrors" class="error-message">
      {{ error.message }}
    </div>
  </form>
</template>
```

### 3. Understand the response

Every action returns a discriminated union so the client can handle success and error branches safely:

```ts
// Success response
{
  success: true,
  data: { id: "abc123", submittedAt: "2026-02-18T10:00:00.000Z" }
}

// Validation error response
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Input validation failed",
    statusCode: 422,
    fieldErrors: {
      email: ["Must be a valid email address"],
      message: ["Message must be at least 10 characters"]
    }
  }
}
```

The `useAction` composable parses this for you and exposes reactive `data`, `error`, and `status` refs.

## What `useAction` Returns

| Property | Type | Description |
|---|---|---|
| `execute` | `(input: TInput) => Promise<ActionResult<TOutput>>` | Call the action. Returns the full result object. |
| `executeAsync` | `(input: TInput) => Promise<TOutput>` | Call the action. Returns data directly or throws on error. |
| `data` | `Ref<TOutput \| null>` | The last successful return value. |
| `error` | `Ref<ActionError \| null>` | The last error, if any. Includes `fieldErrors` for validation failures. |
| `status` | `Ref<'idle' \| 'executing' \| 'success' \| 'error'>` | Current lifecycle state. |
| `reset` | `() => void` | Reset `data`, `error`, and `status` back to their initial values. |

## What Gets Auto-Imported

You do not need to write any `import` statements for the module's utilities.

**Server-side** (available in `server/` directory):

- `defineAction` -- Create a validated action handler
- `createActionClient` -- Builder pattern for middleware composition
- `defineMiddleware` -- Create reusable middleware
- `createMiddleware` -- Alias for publishable middleware
- `createActionError` -- Throw typed errors from handlers or middleware

**Client-side** (available in components, pages, composables):

- `useAction` -- Reactive action caller
- `useOptimisticAction` -- Reactive action caller with optimistic updates

## Example Repository

Want to see a complete working application? The **[nuxt-actions-example](https://github.com/billymaulana/nuxt-actions-example)** repository includes:

| Page | Feature | Composable |
|------|---------|------------|
| `/actions` | CRUD with typed refs | `useAction` |
| `/optimistic` | Instant UI + rollback | `useOptimisticAction` |
| `/streaming` | SSE text streaming | `useStreamAction` |
| `/queries` | SSR reactive queries | `useActionQuery` |
| `/middleware` | Auth + field validation | `defineMiddleware` |
| `/builder` | Shared middleware chain | `createActionClient` |
| `/errors` | Error codes + recovery | `createActionError` |

You can also try it instantly in the browser: **[Open in StackBlitz](https://stackblitz.com/github/billymaulana/nuxt-actions-example)**

## Next Steps

You now have a working action with validation and a client that handles loading states and errors. From here:

- **[defineAction](/guide/define-action)** -- Deep dive into server action options, multi-library schemas, output validation, and best practices.
- **[Builder Pattern](/guide/builder-pattern)** -- Share middleware and configuration across actions using `createActionClient`.
- **[Middleware](/guide/middleware)** -- Add authentication, authorization, rate limiting, and logging.
- **[Error Handling](/guide/error-handling)** -- Understand the full error model and how to create domain-specific errors.
- **[Optimistic Updates](/guide/optimistic-updates)** -- Build instant-feeling UIs with `useOptimisticAction`.
- **[Standard Schema](/guide/standard-schema)** -- Learn how the Standard Schema interface works across validation libraries.
