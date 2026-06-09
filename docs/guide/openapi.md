# OpenAPI & Swagger UI

Enable OpenAPI generation in your module config:

```ts
export default defineNuxtConfig({
  actions: {
    openapi: { ui: true },
  },
})
```

This serves an OpenAPI 3.1 document at `/_actions/openapi.json` and Swagger UI at
`/_actions/openapi`.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `path` | `/_actions/openapi.json` | JSON document path |
| `ui` | `false` | `true` serves Swagger UI at `/_actions/openapi`; a string sets a custom path |
| `info` | `{ title: 'nuxt-actions API', version: '1.0.0' }` | OpenAPI info block |

## Schema support

Request and response bodies are precise when the schema library exposes a native JSON
Schema converter: **arktype** (`toJsonSchema()`) and **Zod 4** (`z.toJSONSchema`). For
**Valibot** install `@valibot/to-json-schema`, and for **Zod 3** install
`zod-to-json-schema`; otherwise bodies fall back to a generic object. Paths, methods,
and operation IDs are always precise.

The Swagger UI page loads assets from a pinned CDN version with Subresource Integrity.
