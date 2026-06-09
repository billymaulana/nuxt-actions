# Action Colocation

By default, `nuxt-actions` scans `server/actions/` for action files. With the `colocate` option, you can also place action files alongside your pages for better code organization.

## Setup

Enable colocation in your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-actions'],
  actions: {
    colocate: true,
  },
})
```

## Directory Structure

With colocation enabled, you can place action files in `actions/` subdirectories next to your pages:

```
pages/
  todos/
    index.vue
    actions/
      create-todo.post.ts    # -> createTodo
      list-todos.get.ts      # -> listTodos
  users/
    [id].vue
    actions/
      get-user.get.ts        # -> getUser
      update-user.put.ts     # -> updateUser
server/
  actions/
    shared-action.ts         # Still works -- global actions
```

## How It Works

1. The module scans `pages/**/actions/` directories in addition to `server/actions/`
2. Action names are derived the same way as server actions (file name to camelCase)
3. Colocated actions are registered as Nitro handlers at `/api/_actions/*`
4. All actions (server and colocated) are merged into the `#actions` virtual module

## When to Use

Colocation works well when:
- Actions are tightly coupled to a specific page or feature
- You want to see the server logic alongside the component that calls it
- Your project has many feature-specific actions that don't need global access

Keep using `server/actions/` for:
- Shared actions used by multiple pages
- Infrastructure-level actions (auth, settings, notifications)
- Actions that are part of a public API

## Configuration

```ts
export default defineNuxtConfig({
  modules: ['nuxt-actions'],
  actions: {
    actionsDir: 'actions', // Directory name for server actions (default)
    colocate: false,       // Scan pages/**/actions/ (default: false)
  },
})
```

## Next Steps

- [Getting Started](/guide/getting-started) -- Installation and configuration
- [defineAction](/guide/define-action) -- Server action definition guide
