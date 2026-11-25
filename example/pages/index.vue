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
    path: '/mutations',
    title: 'Smart Cache Invalidation',
    description: 'useActionMutation + tags — a write auto-refetches every query that depends on it.',
  },
  {
    path: '/uploads',
    title: 'File Uploads',
    description: 'multipart/form-data parsed into typed file fields. Avatar upload with preview.',
  },
  {
    path: '/auth',
    title: 'Auth Preset',
    description: 'defineAuthMiddleware resolves ctx.user or rejects with a typed 401.',
  },
  {
    path: '/openapi',
    title: 'OpenAPI & Swagger UI',
    description: 'Generate an OpenAPI 3.1 document and Swagger UI straight from your actions.',
  },
  {
    path: '/payments',
    title: 'Idempotent Payments',
    description: 'Double-clicking Pay never double-charges — idempotency option replays duplicate requests.',
  },
  {
    path: '/observability',
    title: 'Observability',
    description: 'Global action:start/success/error/settled hooks plus grouped actions.admin.metrics.',
  },
  {
    path: '/resilience',
    title: 'Resilience',
    description: 'Exponential retry backoff with jitter, cancelPrevious search, and manual cancel().',
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
  {
    path: '/polling',
    title: 'Polling & Auto-Refetch',
    description: 'refetchInterval, refetchOnFocus, refetchOnReconnect, enabled toggle, and transform.',
  },
  {
    path: '/infinite',
    title: 'Infinite Scroll',
    description: 'Cursor-based pagination with useInfiniteActionQuery — fetchNextPage, hasNextPage.',
  },
  {
    path: '/batch',
    title: 'Batch Execution',
    description: 'Execute multiple actions in parallel or sequentially with useActions.',
  },
  {
    path: '/security',
    title: 'Security Middleware',
    description: 'Built-in rateLimitMiddleware and csrfMiddleware for action protection.',
  },
  {
    path: '/progressive',
    title: 'Progressive Enhancement',
    description: 'useActionState for forms that work with and without JavaScript.',
  },
  {
    path: '/real-world',
    title: 'Real-World App',
    description: 'Complete mini todo app combining auth, CRUD, optimistic updates, and validation.',
  },
  {
    path: '/prefetch',
    title: 'Prefetch & Stream Cache',
    description: 'prefetchAction to pre-warm cache on hover, useStreamActionQuery with persistent cache.',
  },
]
</script>
