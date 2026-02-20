import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'nuxt-actions',
  description: 'Type-safe server actions for Nuxt with Standard Schema validation, middleware, builder pattern, and optimistic updates.',
  base: '/nuxt-actions/',
  cleanUrls: true,
  appearance: 'dark',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/nuxt-actions/favicon.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'nuxt-actions' }],
    ['meta', { property: 'og:description', content: 'Type-safe server actions for Nuxt' }],
    ['meta', { property: 'og:url', content: 'https://billymaulana.github.io/nuxt-actions/' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/define-action' },
      { text: 'Examples', link: 'https://github.com/billymaulana/nuxt-actions-example' },
      { text: 'Playground', link: 'https://stackblitz.com/github/billymaulana/nuxt-actions-example' },
      {
        text: 'v1.0.0',
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
            { text: 'Streaming', link: '/guide/streaming' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'E2E Type Inference', link: '/guide/e2e-type-inference' },
            { text: 'Standard Schema', link: '/guide/standard-schema' },
            { text: 'Output Validation', link: '/guide/output-validation' },
            { text: 'Security', link: '/guide/security' },
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
            { text: 'createActionError', link: '/api/create-action-error' },
          ],
        },
        {
          text: 'Client',
          items: [
            { text: 'useAction', link: '/api/use-action' },
            { text: 'useFormAction', link: '/api/use-form-action' },
            { text: 'useOptimisticAction', link: '/api/use-optimistic-action' },
            { text: 'useActionQuery', link: '/api/use-action-query' },
            { text: 'useStreamAction', link: '/api/use-stream-action' },
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
