import { ref, computed, readonly, toValue, watch, onScopeDispose } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
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
  const pages = ref<unknown[]>([])
  const error = ref<ActionError | null>(null)
  const isFetchingNextPage = ref(false)
  let nextPageParam: unknown = options.initialPageParam

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
      watch: input !== undefined ? [() => toValue(input)] : false,
    },
  )

  // Sync the first page from useAsyncData into our pages array
  watch(
    () => asyncData.data.value,
    (raw) => {
      if (!raw?.success) return
      const pageData = options.transform ? options.transform(raw.data as never) : raw.data
      pages.value = [pageData]
      nextPageParam = options.getNextPageParam(pageData, [pageData])
    },
    { immediate: true },
  )

  // Watch enabled — trigger fetch when reactive ref becomes true
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') {
    watch(isEnabled, (val) => {
      if (val) asyncData.refresh()
    })
  }

  // ── data: last page ──────────────────────────────────────────────
  const data = computed(() => {
    if (pages.value.length === 0) return null
    return pages.value[pages.value.length - 1]
  })

  // ── hasNextPage ──────────────────────────────────────────────────
  const hasNextPage = computed(() => nextPageParam !== undefined)

  // ── fetchNextPage ────────────────────────────────────────────────
  async function fetchNextPage(): Promise<void> {
    if (!hasNextPage.value || isFetchingNextPage.value) return

    isFetchingNextPage.value = true
    error.value = null

    try {
      const result = await appFetch<ActionResult<unknown>>(
        path,
        buildFetchOpts(nextPageParam),
      )

      if (result.success) {
        const pageData = options.transform ? options.transform(result.data as never) : result.data
        pages.value = [...pages.value, pageData]
        nextPageParam = options.getNextPageParam(pageData, pages.value)
      }
      else {
        error.value = result.error
      }
    }
    catch (err: unknown) {
      error.value = {
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Failed to fetch next page',
        statusCode: 0,
      }
    }
    finally {
      isFetchingNextPage.value = false
    }
  }

  // ── refresh: re-fetch from scratch ───────────────────────────────
  async function refresh(): Promise<void> {
    pages.value = []
    nextPageParam = options.initialPageParam
    error.value = null
    await asyncData.refresh()
  }

  // ── clear ────────────────────────────────────────────────────────
  function clear(): void {
    pages.value = []
    nextPageParam = options.initialPageParam
    error.value = null
    asyncData.clear()
  }

  // ── Cleanup ──────────────────────────────────────────────────────
  onScopeDispose(() => {
    pages.value = []
  })

  return {
    pages: readonly(pages) as Readonly<globalThis.Ref<unknown[]>>,
    data,
    error: readonly(error) as Readonly<globalThis.Ref<ActionError | null>>,
    status: asyncData.status,
    pending: asyncData.pending,
    isFetchingNextPage: readonly(isFetchingNextPage) as Readonly<globalThis.Ref<boolean>>,
    hasNextPage,
    fetchNextPage,
    refresh,
    clear,
  }
}
