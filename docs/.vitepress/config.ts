import { defineConfig } from 'vitepress'
import type { HeadConfig } from 'vitepress'
import { DEMO_ORIGIN, exampleGroups } from './examples'

const SITE_URL = 'https://billymaulana.github.io/nuxt-actions/'
const SITE_NAME = 'nuxt-actions'
const SITE_DESCRIPTION = 'Type-safe server actions for Nuxt with Standard Schema validation, middleware, optimistic updates, SSR queries, and streaming. Runs on Nitro v2 and Nitro v3.'
const REPOSITORY_URL = 'https://github.com/billymaulana/nuxt-actions'
const OG_IMAGE_URL = `${SITE_URL}og-image.png`
const OG_IMAGE_ALT = 'nuxt-actions: type-safe server actions for Nuxt'
const PRELOADED_FONT = /(?:onest-latin-wght-normal|bricolage-grotesque-latin-opsz-normal|geist-mono-latin-wght-normal)\.[\w-]+\.woff2$/
const CODE_BLOCK = /<div class="language-[\s\S]*?<\/pre>\s*<\/div>/g
const EXAMPLE_PAGE = /^examples\/(?!index\.md$)/
const TABLE_ROLES: Record<string, string> = {
  thead_open: 'rowgroup',
  tbody_open: 'rowgroup',
  tr_open: 'row',
  th_open: 'columnheader',
  td_open: 'cell',
}

interface TreeNode {
  type: string
  value?: string
  children?: TreeNode[]
}

function textContent(node: TreeNode): string {
  if (node.type === 'text') return node.value ?? ''
  return node.children?.map(textContent).join('') ?? ''
}

function leadingColumns(text: string): number {
  let columns = 0
  for (const character of text) {
    if (character === ' ') columns += 1
    else if (character === '\t') columns += 4
    else break
  }
  return columns
}

function structuredData(relativePath: string, pageUrl: string, title: string, description: string, modified: string | undefined) {
  if (relativePath === 'index.md') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}#website`,
          'url': SITE_URL,
          'name': SITE_NAME,
          'description': SITE_DESCRIPTION,
          'inLanguage': 'en-US',
        },
        {
          '@type': 'SoftwareSourceCode',
          '@id': `${SITE_URL}#software`,
          'name': SITE_NAME,
          'description': SITE_DESCRIPTION,
          'url': SITE_URL,
          'codeRepository': REPOSITORY_URL,
          'programmingLanguage': ['TypeScript', 'Vue'],
          'runtimePlatform': 'Nuxt',
          'license': 'https://opensource.org/licenses/MIT',
          'sameAs': [REPOSITORY_URL, 'https://www.npmjs.com/package/nuxt-actions'],
          'author': { '@type': 'Person', 'name': 'billymaulana', 'url': 'https://github.com/billymaulana' },
          ...(modified ? { dateModified: modified } : {}),
        },
      ],
    }
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        'headline': title,
        'description': description,
        'url': pageUrl,
        'inLanguage': 'en-US',
        'isPartOf': { '@id': `${SITE_URL}#website` },
        'about': { '@id': `${SITE_URL}#software` },
        ...(modified ? { dateModified: modified } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': SITE_NAME, 'item': SITE_URL },
          { '@type': 'ListItem', 'position': 2, 'name': title, 'item': pageUrl },
        ],
      },
    ],
  }
}

export default defineConfig({
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  base: '/nuxt-actions/',
  lang: 'en-US',
  cleanUrls: true,
  appearance: 'dark',
  lastUpdated: true,
  sitemap: {
    hostname: SITE_URL,
  },
  markdown: {
    codeTransformers: [
      {
        name: 'wrap-indent',
        code(node) {
          for (const line of node.children) {
            if (line.type !== 'element') continue
            const indent = leadingColumns(textContent(line))
            if (indent > 0) line.properties.style = `--indent:${indent}`
          }
        },
      },
    ],
    config(md) {
      md.core.ruler.push('table_labels', (state) => {
        let labels: string[] = []
        let table: (typeof state.tokens)[number] | undefined
        let column = 0
        state.tokens.forEach((token, index) => {
          const role = TABLE_ROLES[token.type]
          if (role) token.attrSet('role', role)
          switch (token.type) {
            case 'table_open':
              table = token
              labels = []
              break
            case 'th_open':
              labels.push(state.tokens[index + 1]?.children?.map(child => child.content).join('').trim() ?? '')
              break
            case 'thead_close':
              if (table) table.meta = { columns: labels.length }
              break
            case 'tr_open':
              column = 0
              break
            case 'td_open': {
              const label = labels[column++]
              if (label) token.attrSet('data-label', label)
              break
            }
          }
        })
      })

      const { rules } = md.renderer
      const renderDefault: NonNullable<typeof rules.table_open> = (tokens, index, options, _env, self) => self.renderToken(tokens, index, options)
      const fence = rules.fence ?? renderDefault

      rules.fence = (tokens, index, options, env, self) => {
        const title = /\[([^\]]+)\]/.exec(tokens[index]?.info ?? '')?.[1]
        const html = fence(tokens, index, options, env, self)
        if (!title) return html
        for (let previous = index - 1; previous >= 0; previous--) {
          const type = tokens[previous]?.type
          if (type === 'container_code-group_close') break
          if (type === 'container_code-group_open') return html
        }
        return `<div class="code-titled"><div class="code-title">${md.utils.escapeHtml(title)}</div>${html}</div>`
      }
      const tableOpen = rules.table_open ?? renderDefault
      const tableClose = rules.table_close ?? renderDefault
      const cellOpen = rules.td_open ?? renderDefault
      const cellClose = rules.td_close ?? renderDefault

      rules.table_open = (tokens, index, options, env, self) => {
        const columns = Number(tokens[index]?.meta?.columns ?? 0)
        const className = columns > 2 ? 'table-wrap table-stack' : 'table-wrap'
        const table = tableOpen(tokens, index, options, env, self)
        return `<div class="${className}">${table.includes('role=') ? table : table.replace('<table', '<table role="table"')}`
      }
      rules.table_close = (tokens, index, options, env, self) => `${tableClose(tokens, index, options, env, self)}</div>`
      rules.td_open = (tokens, index, options, env, self) => `${cellOpen(tokens, index, options, env, self)}<span class="cell">`
      rules.td_close = (tokens, index, options, env, self) => `</span>${cellClose(tokens, index, options, env, self)}`
    },
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/nuxt-actions/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/nuxt-actions/apple-touch-icon.png' }],
    ['meta', { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#ffffff' }],
    ['meta', { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#0b0d14' }],
    ['meta', { name: 'author', content: 'billymaulana' }],
    ['meta', { property: 'og:site_name', content: SITE_NAME }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:image', content: OG_IMAGE_URL }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: OG_IMAGE_ALT }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE_URL }],
    ['meta', { name: 'twitter:image:alt', content: OG_IMAGE_ALT }],
  ],
  transformHead({ assets }) {
    return assets
      .filter(file => PRELOADED_FONT.test(file))
      .map((href): HeadConfig => ['link', { rel: 'preload', href, as: 'font', type: 'font/woff2', crossorigin: '' }])
  },
  transformPageData(pageData) {
    const pagePath = pageData.relativePath
      .replace(/index\.md$/, '')
      .replace(/\.md$/, '')
    const canonicalUrl = `${SITE_URL}${pagePath}`
    const pageTitle = pageData.title || SITE_NAME
    const title = pageData.title ? `${pageData.title} | ${SITE_NAME}` : SITE_NAME
    const description = pageData.description || pageData.frontmatter.description || SITE_DESCRIPTION
    const isHome = pageData.relativePath === 'index.md'
    const modified = pageData.lastUpdated ? new Date(pageData.lastUpdated).toISOString() : undefined

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
      ...(!isHome && modified ? [['meta', { property: 'article:modified_time', content: modified }] satisfies HeadConfig] : []),
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['script', { type: 'application/ld+json' }, JSON.stringify(structuredData(pageData.relativePath, canonicalUrl, pageTitle, description, modified))],
    )
  },
  themeConfig: {
    logo: { src: '/logo.svg', width: 24, height: 24, alt: '' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '^/guide/' },
      { text: 'API', link: '/api/define-action', activeMatch: '^/api/' },
      { text: 'Examples', link: '/examples/', activeMatch: '^/examples/' },
      { text: 'Live demo', link: DEMO_ORIGIN },
      {
        text: 'v1.5.0',
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
            { text: 'Caching', link: '/guide/caching' },
            { text: 'Observability', link: '/guide/observability' },
            { text: 'Server Runtimes', link: '/guide/server-runtimes' },
            { text: 'Testing', link: '/guide/testing' },
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
            { text: 'callAction', link: '/api/call-action' },
            { text: 'rateLimitMiddleware', link: '/api/rate-limit-middleware' },
            { text: 'csrfMiddleware', link: '/api/csrf-middleware' },
            { text: 'originMiddleware', link: '/api/origin-middleware' },
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
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
          ],
        },
        ...exampleGroups.map(group => ({
          text: group.title,
          items: group.items.map(example => ({ text: example.title, link: `/examples/${example.slug}` })),
        })),
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
      message: 'Released under the <a href="https://github.com/billymaulana/nuxt-actions/blob/main/LICENSE">MIT License</a>. Built by <a href="https://github.com/billymaulana">billymaulana</a>.',
    },
    search: {
      provider: 'local',
      options: {
        _render(src, env, md) {
          const html = md.render(src, env)
          if (env.frontmatter?.search === false) return ''
          const content = html.replace(CODE_BLOCK, '')
          return EXAMPLE_PAGE.test(env.relativePath) ? content.replace(/<h1([^>]*)>/, '<h1$1>Example: ') : content
        },
      },
    },
  },
})
