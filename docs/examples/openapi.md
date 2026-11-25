---
title: OpenAPI & Swagger UI
description: Turn on the openapi module option to serve an OpenAPI 3.1 document and a Swagger UI page built from your actions, with no handler code.
---

# OpenAPI & Swagger UI

A mobile or partner team that consumes your actions needs a reference that does not drift from the code. With the `openapi` module option, nuxt-actions serves an OpenAPI 3.1 document built from your action files and their schemas, plus an optional Swagger UI page. This example has no action of its own: it turns the option on and links to the two routes.

<ExampleSource page="pages/openapi.vue" />

## Configuration

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-actions'],

  actions: {
    openapi: {
      ui: true,
      info: { title: 'nuxt-actions example API', version: '1.2.0' },
    },
  },
})
```

The example's config also sets `app.head`, `devtools`, and `compatibilityDate`. Only the `actions` block matters here.

## Page

```vue [pages/openapi.vue]
<template>
  <div>
    <a href="/_actions/openapi" target="_blank" rel="noopener">
      Open Swagger UI →
    </a>
    <a href="/_actions/openapi.json" target="_blank" rel="noopener">
      View openapi.json →
    </a>
  </div>
</template>
```

The page has no script, and its markup is trimmed for readability. The full page is linked above.

## How it works

- `actions.openapi` turns on the generator, and the document is served at `/_actions/openapi.json`.
- `ui: true` also serves Swagger UI at `/_actions/openapi`.
- `info` replaces the default title and version, `nuxt-actions API` and `1.0.0`.
- Paths, methods, and operation IDs always come from the action files. Request and response bodies are only as precise as the schema library's JSON Schema export, as described in [Schema support](/guide/openapi#schema-support).
- The module serves both routes, so the page only needs plain links.

## Related

- Guide: [OpenAPI & Swagger UI](/guide/openapi)
