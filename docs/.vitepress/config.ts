import { defineConfig } from 'vitepress'

const SITE_URL = 'https://billymaulana.github.io/nuxt-actions/'

export default defineConfig({
  title: 'nuxt-actions',
  description: 'Type-safe server actions for Nuxt with Standard Schema validation, middleware, builder pattern, and optimistic updates.',
  base: '/nuxt-actions/',
  lang: 'en-US',
  cleanUrls: true,
  appearance: 'dark',
  sitemap: {
    hostname: SITE_URL,
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/nuxt-actions/favicon.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'nuxt-actions' }],
    ['meta', { property: 'og:image', content: `${SITE_URL}og-image.png` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${SITE_URL}og-image.png` }],
  ],
  transformPageData(pageData) {
    const pagePath = pageData.relativePath
      .replace(/index\.md$/, '')
      .replace(/\.md$/, '')
    const canonicalUrl = `${SITE_URL}${pagePath}`
    const title = pageData.title ? `${pageData.title} | nuxt-actions` : 'nuxt-actions'
    const description = pageData.description || pageData.frontmatter.description
      || 'Type-safe server actions for Nuxt with Standard Schema validation, middleware, builder pattern, and optimistic updates.'

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
    )
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/define-action' },
      { text: 'Examples', link: 'https://github.com/billymaulana/nuxt-actions-example' },
      { text: 'Playground', link: 'https://stackblitz.com/github/billymaulana/nuxt-actions-example' },
      {
        text: 'v1.3.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/billymaulana/nuxt-actions/blob/main/CHANGELOG.md' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Why nuxt-actions?', link: '/guide/why' },
            { text: 'Getting Started', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'defineAction', link: '/guide/define-action' },
            { text: 'Builder Pattern', link: '/guide/builder-pattern' },
            { text: 'Middleware', link: '/guide/middleware' },
            { text: 'Error Handling', link: '/guide/error-handling' },
          ],
        },
        {
          text: 'Client',
          items: [
            { text: 'useAction', link: '/guide/use-action' },
            { text: 'Form Actions', link: '/guide/form-actions' },
            { text: 'Optimistic Updates', link: '/guide/optimistic-updates' },
            { text: 'SSR Queries', link: '/guide/action-queries' },
            { text: 'Infinite Queries', link: '/guide/infinite-queries' },
            { text: 'Cache Invalidation', link: '/guide/cache-invalidation' },
            { text: 'Streaming', link: '/guide/streaming' },
            { text: 'Batch Actions', link: '/guide/batch-actions' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'E2E Type Inference', link: '/guide/e2e-type-inference' },
            { text: 'Standard Schema', link: '/guide/standard-schema' },
            { text: 'Output Validation', link: '/guide/output-validation' },
            { text: 'Security', link: '/guide/security' },
            { text: 'Colocation', link: '/guide/colocation' },
            { text: 'CLI Scaffolding', link: '/guide/cli' },
            { text: 'OpenAPI & Swagger UI', link: '/guide/openapi' },
            { text: 'File Uploads', link: '/guide/file-uploads' },
            { text: 'Authentication', link: '/guide/auth' },
            { text: 'Idempotency', link: '/guide/idempotency' },
            { text: 'Observability', link: '/guide/observability' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Server',
          items: [
            { text: 'defineAction', link: '/api/define-action' },
            { text: 'createActionClient', link: '/api/create-action-client' },
            { text: 'defineStreamAction', link: '/api/define-stream-action' },
            { text: 'defineMiddleware', link: '/api/define-middleware' },
            { text: 'defineAuthMiddleware', link: '/api/auth-middleware' },
            { text: 'createActionError', link: '/api/create-action-error' },
            { text: 'returnValidationErrors', link: '/api/return-validation-errors' },
            { text: 'rateLimitMiddleware', link: '/api/rate-limit-middleware' },
            { text: 'csrfMiddleware', link: '/api/csrf-middleware' },
            { text: 'Idempotency', link: '/api/idempotency' },
          ],
        },
        {
          text: 'Client',
          items: [
            { text: 'useAction', link: '/api/use-action' },
            { text: 'useActionMutation', link: '/api/use-action-mutation' },
            { text: 'useFormAction', link: '/api/use-form-action' },
            { text: 'useOptimisticAction', link: '/api/use-optimistic-action' },
            { text: 'useActionQuery', link: '/api/use-action-query' },
            { text: 'useInfiniteActionQuery', link: '/api/use-infinite-action-query' },
            { text: 'useStreamAction', link: '/api/use-stream-action' },
            { text: 'useActions', link: '/api/use-actions' },
            { text: 'useActionState', link: '/api/use-action-state' },
            { text: 'useStreamActionQuery', link: '/api/use-stream-action-query' },
            { text: 'prefetchAction', link: '/api/prefetch-action' },
            { text: 'Cache Invalidation', link: '/api/invalidate-actions' },
          ],
        },
        {
          text: 'Types',
          items: [
            { text: 'Type Reference', link: '/api/types' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/billymaulana/nuxt-actions' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/nuxt-actions' },
    ],
    editLink: {
      pattern: 'https://github.com/billymaulana/nuxt-actions/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2026-present billymaulana',
    },
    search: {
      provider: 'local',
    },
  },
})
