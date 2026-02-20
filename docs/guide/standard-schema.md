# Standard Schema

`nuxt-actions` does not depend on any specific validation library. Instead, it accepts any library that implements the [Standard Schema](https://standardschema.dev/) specification -- a vendor-agnostic interface that lets validation libraries describe themselves in a uniform way.

## What Is Standard Schema?

Standard Schema is a community specification that defines a minimal interface for schema validation. Any library that exposes a `~standard` property with `version`, `vendor`, and `validate` members is compatible:

```ts
interface StandardSchemaV1 {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => Result | Promise<Result>
    readonly types?: { readonly input: unknown; readonly output: unknown }
  }
}
```

The `~standard` prefix is intentional -- it uses a tilde to avoid collisions with user-defined properties while remaining a valid JavaScript identifier. You never need to interact with this interface directly; your validation library exposes it automatically.

## Supported Libraries

Any library that implements Standard Schema v1 works with `nuxt-actions`. The three most popular options today are:

| Library | Minimum Version | Approximate Bundle Size |
|---------|-----------------|-------------------------|
| [Zod](https://zod.dev) | 3.24+ | ~14 kB |
| [Valibot](https://valibot.dev) | 1.0+ | ~1 kB (tree-shakeable) |
| [ArkType](https://arktype.io) | 2.1+ | ~28 kB |

Install whichever you prefer as a project dependency. All three are listed as optional peer dependencies, so you only install what you use.

## Examples

### Zod

```ts
// server/api/todos.post.ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
    priority: z.enum(['low', 'medium', 'high']),
  }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title, priority: input.priority }
  },
})
```

### Valibot

```ts
// server/api/todos.post.ts
import * as v from 'valibot'

export default defineAction({
  input: v.object({
    title: v.pipe(v.string(), v.minLength(1, 'Title is required')),
    priority: v.picklist(['low', 'medium', 'high']),
  }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title, priority: input.priority }
  },
})
```

### ArkType

```ts
// server/api/todos.post.ts
import { type } from 'arktype'

export default defineAction({
  input: type({
    title: 'string > 0',
    priority: "'low' | 'medium' | 'high'",
  }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title, priority: input.priority }
  },
})
```

All three examples produce the same runtime behavior: the input is validated before the handler runs, validation errors are returned as structured `VALIDATION_ERROR` responses, and `input` inside the handler is fully typed.

## How It Works Internally

When you pass a schema to `defineAction`, the module calls `schema['~standard'].validate(rawInput)` at runtime. If the result contains `issues`, a `VALIDATION_ERROR` response is returned with field-level error messages. If validation passes, the validated `value` is forwarded to your handler.

```
Request body ──> ~standard.validate() ──> issues? ──> 422 VALIDATION_ERROR
                                     └──> value  ──> handler({ input: value })
```

Because the module reads the `~standard` interface at runtime, no build-time plugin, adapter, or code generation is required. Add a new schema library to your project and it works immediately.

## Why Standard Schema?

### Vendor-agnostic

Your server actions are not locked into Zod, Valibot, or any other library. If a faster or smaller alternative emerges that implements Standard Schema, you can switch to it without changing any `nuxt-actions` code.

### Future-proof

The Standard Schema specification is backed by the authors of Zod, Valibot, and ArkType. As more libraries adopt the standard, your actions gain compatibility automatically.

### Zero runtime dependency

`nuxt-actions` inlines the Standard Schema TypeScript interface. It has no npm dependency on `@standard-schema/spec` or any validation library at runtime. Your bundle only includes the validation library you chose.

## Mixing Libraries Across Actions

Because each action validates independently, you can use different libraries in different files:

```ts
// server/api/users.post.ts -- uses Zod
import { z } from 'zod'

export default defineAction({
  input: z.object({ name: z.string(), email: z.string().email() }),
  handler: async ({ input }) => {
    return await db.user.create({ data: input })
  },
})
```

```ts
// server/api/posts.post.ts -- uses Valibot
import * as v from 'valibot'

export default defineAction({
  input: v.object({
    title: v.pipe(v.string(), v.minLength(1)),
    body: v.string(),
  }),
  handler: async ({ input }) => {
    return await db.post.create({ data: input })
  },
})
```

This works without any configuration because both libraries expose the same `~standard` interface.

::: tip Best Practice
Pick one validation library per project and use it consistently. Mixing libraries adds bundle size and makes the codebase harder to navigate. The flexibility to mix is there for migration scenarios and monorepos, not as a default workflow.
:::

## Switching Libraries

Migrating from one library to another requires changing only the schema definitions. The `defineAction` calls, `useAction` composables, and middleware remain untouched.

**Before (Zod):**

```ts
import { z } from 'zod'

export default defineAction({
  input: z.object({ email: z.string().email() }),
  handler: async ({ input }) => { /* ... */ },
})
```

**After (Valibot):**

```ts
import * as v from 'valibot'

export default defineAction({
  input: v.object({ email: v.pipe(v.string(), v.email()) }),
  handler: async ({ input }) => { /* ... */ },
})
```

The handler, middleware chain, builder pattern, output validation, and client-side composables all continue to work without modification.

## Error Messages

When validation fails, the error response format is identical regardless of which library produced the issues:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "statusCode": 422,
    "fieldErrors": {
      "title": ["String must contain at least 1 character(s)"],
      "priority": ["Invalid enum value"]
    }
  }
}
```

The `fieldErrors` object maps field paths to arrays of error messages. Nested paths are dot-separated (for example, `address.city`). This normalized format means your client-side error handling code works the same way regardless of which validation library produced the error.
