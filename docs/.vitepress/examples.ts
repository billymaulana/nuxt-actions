export const REPOSITORY = 'billymaulana/nuxt-actions'
export const EXAMPLE_DIR = 'example'
export const DEMO_ORIGIN = 'https://nuxt-actions-demo.vercel.app'

export interface ExampleEntry {
  slug: string
  title: string
  summary: string
}

export interface ExampleGroup {
  title: string
  items: ExampleEntry[]
}

export const exampleGroups: ExampleGroup[] = [
  {
    title: 'Calling actions',
    items: [
      { slug: 'actions', title: 'CRUD Actions', summary: 'Create and list todos with typed action references imported from #actions.' },
      { slug: 'forms', title: 'Form Actions', summary: 'useFormAction with field-level validation errors, dirty tracking, and reset.' },
      { slug: 'batch', title: 'Batch Execution', summary: 'Run several actions in parallel with useActions and read each result on its own.' },
      { slug: 'progressive', title: 'Progressive Enhancement', summary: 'useActionState for forms that keep working when JavaScript is disabled.' },
    ],
  },
  {
    title: 'Queries and caching',
    items: [
      { slug: 'queries', title: 'SSR Queries', summary: 'Server-rendered queries with debounced search and automatic refetching.' },
      { slug: 'polling', title: 'Polling & Auto-Refetch', summary: 'refetchInterval, refetchOnFocus, the enabled toggle, and transform on useActionQuery.' },
      { slug: 'infinite', title: 'Infinite Scroll', summary: 'Load a list one page at a time with useInfiniteActionQuery, fetchNextPage, and hasNextPage.' },
      { slug: 'mutations', title: 'Smart Cache Invalidation', summary: 'useActionMutation with tags, so a write refetches every query that depends on it.' },
      { slug: 'caching', title: 'Server Cache', summary: 'Cache a slow GET action on the server with the cache option, and drop the result after a write with invalidateActionCache.' },
      { slug: 'prefetch', title: 'Prefetch & Stream Cache', summary: 'Warm the cache on hover with prefetchAction and keep streamed results with useStreamActionQuery.' },
    ],
  },
  {
    title: 'Interactive UI',
    items: [
      { slug: 'optimistic', title: 'Optimistic Updates', summary: 'Toggle a todo instantly and roll back automatically when the server rejects the change.' },
      { slug: 'streaming', title: 'Streaming', summary: 'Stream generated text over Server-Sent Events and render each chunk as it arrives.' },
      { slug: 'uploads', title: 'File Uploads', summary: 'Parse multipart/form-data into typed file fields, with an avatar preview and an upload progress bar.' },
      { slug: 'resilience', title: 'Resilience', summary: 'Retry with exponential backoff and jitter, cancel stale searches, and cancel requests by hand.' },
    ],
  },
  {
    title: 'Server and security',
    items: [
      { slug: 'middleware', title: 'Middleware & Auth', summary: 'An authentication flow built from chained middleware, validation, and typed errors.' },
      { slug: 'auth', title: 'Auth Preset', summary: 'defineAuthMiddleware resolves ctx.user or rejects the request with a typed 401.' },
      { slug: 'security', title: 'Security Middleware', summary: 'Rate limit an action with Retry-After, reject cross-site posts with originMiddleware, and protect a save with csrfMiddleware.' },
      { slug: 'payments', title: 'Idempotent Payments', summary: 'Replay duplicate requests with the idempotency option, so a double click never charges twice.' },
      { slug: 'observability', title: 'Observability', summary: 'Global action:start, success, error, and settled hooks, plus a call through the grouped actions namespace.' },
      { slug: 'openapi', title: 'OpenAPI & Swagger UI', summary: 'Generate an OpenAPI 3.1 document and Swagger UI from your actions.' },
    ],
  },
  {
    title: 'Going further',
    items: [
      { slug: 'advanced', title: 'Advanced Features', summary: 'Retry, timeout, custom headers, deduplication, throttling, output validation, and executeAsync.' },
      { slug: 'real-world', title: 'Real-World App', summary: 'A small todo app that puts a login gate, validated creation, and a done toggle on one page.' },
    ],
  },
]
