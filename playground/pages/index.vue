<template>
  <div>
    <h1>nuxt-actions</h1>
    <p style="color: #a3a3a3; margin-bottom: 24px;">
      Type-safe server actions for Nuxt with Standard Schema validation.
    </p>

    <div style="display: grid; gap: 12px;">
      <NuxtLink
        v-for="page in pages"
        :key="page.path"
        :to="page.path"
        style="display: block; padding: 16px; background: #1a1a1a; border-radius: 8px; text-decoration: none; color: inherit; border: 1px solid #333;"
      >
        <strong style="color: #60a5fa;">{{ page.title }}</strong>
        <p style="color: #a3a3a3; font-size: 13px; margin-top: 4px;">
          {{ page.description }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const pages = [
  {
    path: '/actions',
    title: 'CRUD Actions',
    description: 'Create and list todos using E2E typed action references from #actions.',
  },
  {
    path: '/forms',
    title: 'Form Actions',
    description: 'useFormAction with field-level validation errors, dirty tracking, and reset.',
  },
  {
    path: '/optimistic',
    title: 'Optimistic Updates',
    description: 'Toggle todo status with instant UI updates and automatic rollback on error.',
  },
  {
    path: '/streaming',
    title: 'Streaming',
    description: 'AI-style text streaming via Server-Sent Events with real-time chunk updates.',
  },
  {
    path: '/queries',
    title: 'SSR Queries',
    description: 'Server-rendered queries with debounced search and automatic re-fetching.',
  },
  {
    path: '/middleware',
    title: 'Middleware & Auth',
    description: 'Authentication flow with chained middleware, validation, and error handling.',
  },
  {
    path: '/advanced',
    title: 'Advanced Features',
    description: 'Retry, timeout, custom headers, dedupe, throttle, output validation, and executeAsync.',
  },
]
</script>
