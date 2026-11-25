<template>
  <div>
    <h1>OpenAPI &amp; Swagger UI</h1>
    <h2>Generate an API reference straight from your actions</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        <strong style="color: #e5e5e5;">The problem:</strong> a mobile or partner team needs to consume
        your endpoints, but hand-written API docs drift out of sync the moment you change a schema.
      </p>
      <p style="color: #a3a3a3; font-size: 14px; margin-top: 8px;">
        <strong style="color: #e5e5e5;">The fix:</strong> enable the <code>openapi</code> module option.
        nuxt-actions emits an OpenAPI 3.1 document from your action schemas, with an optional Swagger UI —
        always in step with the code.
      </p>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Live endpoints
      </h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <a
          href="/_actions/openapi"
          target="_blank"
          rel="noopener"
          style="display: inline-block; padding: 8px 16px; background: #1e3a5f; color: #60a5fa; border-radius: 6px; text-decoration: none; font-size: 14px;"
        >
          Open Swagger UI →
        </a>
        <a
          href="/_actions/openapi.json"
          target="_blank"
          rel="noopener"
          style="display: inline-block; padding: 8px 16px; background: #1a1a1a; color: #a3a3a3; border-radius: 6px; text-decoration: none; font-size: 14px; border: 1px solid #333;"
        >
          View openapi.json →
        </a>
      </div>
      <p style="color: #666; font-size: 12px; margin-top: 8px;">
        Both routes are served by the module — no extra handlers needed.
      </p>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-actions'],
  actions: {
    openapi: {
      ui: true, // serves Swagger UI at /_actions/openapi
      info: { title: 'nuxt-actions example API', version: '1.4.0' },
    },
  },
})</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
</script>
