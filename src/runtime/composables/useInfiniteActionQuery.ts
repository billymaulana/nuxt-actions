import type { Ref, MaybeRefOrGetter } from 'vue'
import { ref, computed, readonly, toValue, watch, onScopeDispose } from 'vue'
import { useAsyncData, useNuxtApp } from '#app'
import type {
  ActionError,
  ActionResult,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseInfiniteActionQueryOptions,
  UseInfiniteActionQueryReturn,
} from '../types'
import { stableStringify } from './_utils'

/**
 * Composable for infinite scroll / cursor-based pagination with SSR support.
 *
 * Fetches the first page on the server via `useAsyncData`, then fetches
 * subsequent pages on the client using `$fetch` directly. Pages are
 * accumulated in a reactive array and pagination is driven by a
 * user-supplied `getNextPageParam` callback.
 *
 * @example Basic infinite scroll:
 * ```ts
 * import { listTodos } from '#actions'
 * const { pages, fetchNextPage, hasNextPage, pending } = useInfiniteActionQuery(
 *   listTodos,
 *   undefined,
 *   {
 *     getNextPageParam: (lastPage) => lastPage.nextCursor,
 *   },
 * )
 * ```
 *
 * @example With reactive input and initial page param:
 * ```ts
 * import { searchItems } from '#actions'
 * const query = ref('nuxt')
 * const { pages, fetchNextPage } = useInfiniteActionQuery(
 *   searchItems,
 *   () => ({ q: query.value }),
 *   {
 *     initialPageParam: 0,
 *     getNextPageParam: (lastPage) => lastPage.nextOffset,
 *   },
 * )
 * ```
 */

// Overload 1: typed reference (full inference)
export function useInfiniteActionQuery<T extends TypedActionReference>(
  action: T,
  input?: MaybeRefOrGetter<InferActionInput<T>>,
  options?: UseInfiniteActionQueryOptions<InferActionOutput<T>>,
): UseInfiniteActionQueryReturn<InferActionOutput<T>>

// Overload 2: string path (manual generics)
export function useInfiniteActionQuery<TInput = void, TOutput = unknown>(
  path: string,
  input?: MaybeRefOrGetter<TInput>,
  options?: UseInfiniteActionQueryOptions<TOutput>,
): UseInfiniteActionQueryReturn<TOutput>

// Implementation
export function useInfiniteActionQuery(
  pathOrAction: string | TypedActionReference,
  input?: MaybeRefOrGetter<unknown>,
  options: UseInfiniteActionQueryOptions = { getNextPageParam: () => undefined },
): UseInfiniteActionQueryReturn<unknown> {
  const nuxtApp = useNuxtApp()

  // Nuxt 3 exposes $fetch on nuxtApp; Nuxt 4 removed it — fall back to global $fetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appFetch: typeof $fetch = (nuxtApp as any).$fetch ?? $fetch

  let path: string
  let method: string

  if (typeof pathOrAction === 'string') {
    path = pathOrAction
    method = 'GET'
  }
  else {
    path = `/api/_actions/${pathOrAction.__actionPath}`
    method = pathOrAction.__actionMethod
  }

  const isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH'

  // ── State ────────────────────────────────────────────────────────
  /* Pages 2+ fetched on the client; page 1 is derived from useAsyncData. */
  const extraPages = ref<unknown[]>([])
  const fetchNextError = ref<ActionError | null>(null)
  const isFetchingNextPage = ref(false)
  /* Bumped by refresh()/clear()/dispose so an in-flight fetchNextPage can detect it raced a reset. */
  let generation = 0

  // ── Enabled flag ─────────────────────────────────────────────────
  const isEnabled = computed(() => {
    if (options.enabled === undefined || options.enabled === true) return true
    if (options.enabled === false) return false
    return toValue(options.enabled as unknown as MaybeRefOrGetter<boolean>)
  })

  // ── Fetch helper ─────────────────────────────────────────────────
  function buildFetchOpts(pageParam: unknown): Record<string, unknown> {
    const inputVal = toValue(input) ?? {}
    const merged = typeof inputVal === 'object' && inputVal !== null
      ? { ...inputVal as Record<string, unknown>, ...(pageParam !== undefined ? { pageParam } : {}) }
      : inputVal
    const fetchOpts: Record<string, unknown> = { method }
    if (isBodyMethod) {
      fetchOpts.body = merged
    }
    else {
      fetchOpts.query = merged
    }
    return fetchOpts
  }

  // ── SSR: First page via useAsyncData ─────────────────────────────
  const key = `infinite:${path}:${stableStringify(toValue(input) ?? {})}`

  const asyncData = useAsyncData(
    key,
    () => appFetch<ActionResult<unknown>>(path, buildFetchOpts(options.initialPageParam)),
    {
      server: options.server ?? true,
      lazy: options.lazy ?? false,
      immediate: isEnabled.value,
      watch: input !== undefined ? [() => toValue(input)] : undefined,
    },
  )

  /*
   * Page 1 is derived from useAsyncData at render time (a computed), NOT synced
   * via an immediate watch. Vue stops an immediate watcher during SSR before
   * onServerPrefetch resolves the data, which left `pages` empty in the server
   * HTML and caused a hydration mismatch. A computed reads the resolved value
   * whenever the template renders it.
   */
  // ── pages: first page + client-fetched extras ────────────────────
  /* A user transform that throws must degrade gracefully, not crash render. */
  function applyTransform(value: unknown): unknown {
    if (!options.transform) return value
    try {
      return options.transform(value as never)
    }
    catch {
      return value
    }
  }

  const pages = computed<unknown[]>(() => {
    const raw = asyncData.data.value
    /* Gate on the success flag, not the data value — a successful page whose data is undefined still counts. */
    if (raw?.success !== true) return []
    return [applyTransform(raw.data), ...extraPages.value]
  })

  // Watch enabled — trigger fetch when reactive ref becomes true
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') {
    watch(isEnabled, (val) => {
      if (val) asyncData.refresh()
    })
  }

  // ── data: last page ──────────────────────────────────────────────
  const data = computed(() => {
    const all = pages.value
    return all.length === 0 ? null : all[all.length - 1]
  })

  /*
   * Surface the first-page envelope error too: a {success:false} action resolves
   * HTTP 200, so useAsyncData stays "success" — without this the failure would be
   * silently swallowed. A fetchNextPage error takes precedence (it is newer).
   */
  const error = computed<ActionError | null>(() => {
    if (fetchNextError.value) return fetchNextError.value
    const raw = asyncData.data.value
    return raw && raw.success === false ? raw.error : null
  })

  // ── nextPageParam / hasNextPage (reactively derived) ─────────────
  const nextPageParam = computed<unknown>(() => {
    const all = pages.value
    if (all.length === 0) return options.initialPageParam
    try {
      return options.getNextPageParam(all[all.length - 1], all)
    }
    catch {
      /* A throwing extractor must degrade to "no next page", not crash render. */
      return undefined
    }
  })
  const hasNextPage = computed(() => nextPageParam.value !== undefined)

  // ── fetchNextPage ────────────────────────────────────────────────
  async function fetchNextPage(): Promise<void> {
    if (!hasNextPage.value || isFetchingNextPage.value) return

    const startGeneration = generation
    isFetchingNextPage.value = true
    fetchNextError.value = null

    try {
      const result = await appFetch<ActionResult<unknown>>(
        path,
        buildFetchOpts(nextPageParam.value),
      )

      /* A refresh()/clear() that landed mid-flight must not be clobbered by this stale page. */
      if (generation !== startGeneration) return

      if (result.success) {
        const pageData = options.transform ? options.transform(result.data as never) : result.data
        extraPages.value = [...extraPages.value, pageData]
      }
      else {
        fetchNextError.value = result.error
      }
    }
    catch (err: unknown) {
      if (generation !== startGeneration) return
      fetchNextError.value = {
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Failed to fetch next page',
        statusCode: 0,
      }
    }
    finally {
      if (generation === startGeneration) isFetchingNextPage.value = false
    }
  }

  // ── refresh: re-fetch from scratch ───────────────────────────────
  async function refresh(): Promise<void> {
    generation++
    extraPages.value = []
    fetchNextError.value = null
    isFetchingNextPage.value = false
    await asyncData.refresh()
  }

  // ── clear ────────────────────────────────────────────────────────
  function clear(): void {
    generation++
    extraPages.value = []
    fetchNextError.value = null
    isFetchingNextPage.value = false
    asyncData.clear()
  }

  // ── Cleanup ──────────────────────────────────────────────────────
  onScopeDispose(() => {
    generation++
    extraPages.value = []
  })

  return {
    pages: readonly(pages) as Readonly<Ref<unknown[]>>,
    data,
    error: readonly(error) as Readonly<Ref<ActionError | null>>,
    status: asyncData.status,
    pending: asyncData.pending,
    isFetchingNextPage: readonly(isFetchingNextPage) as Readonly<Ref<boolean>>,
    hasNextPage,
    fetchNextPage,
    refresh,
    clear,
  }
}
