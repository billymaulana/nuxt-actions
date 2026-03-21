import { computed, toValue, watch, onScopeDispose } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useAsyncData, useNuxtApp } from '#app'
import type {
  ActionError,
  ActionResult,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseActionQueryOptions,
  UseActionQueryReturn,
} from '../types'
import { stableStringify } from './_utils'

/**
 * Composable for SSR-capable GET action queries with caching and reactive re-fetching.
 *
 * Wraps Nuxt's `useAsyncData` to provide:
 * - SSR: Data is fetched on the server and hydrated on the client
 * - Caching: Deduplicates requests with the same key
 * - Reactive: Re-fetches when input changes
 * - Polling: Auto-refetch at configurable intervals
 * - Focus/Reconnect: Refetch when the tab regains focus or network reconnects
 *
 * @example
 * ```ts
 * import { listTodos } from '#actions'
 * const { data, pending, refresh } = useActionQuery(listTodos)
 * ```
 *
 * @example With reactive input:
 * ```ts
 * import { searchTodos } from '#actions'
 * const query = ref('')
 * const { data } = useActionQuery(searchTodos, () => ({ q: query.value }))
 * ```
 *
 * @example With polling and transform:
 * ```ts
 * const { data } = useActionQuery(listTodos, undefined, {
 *   refetchInterval: 5000,
 *   transform: (data) => data.sort((a, b) => b.id - a.id),
 * })
 * ```
 */

// Overload 1: typed reference (full inference)
export function useActionQuery<T extends TypedActionReference>(
  action: T,
  input?: MaybeRefOrGetter<InferActionInput<T>>,
  options?: UseActionQueryOptions<InferActionOutput<T>>,
): UseActionQueryReturn<InferActionOutput<T>>

// Overload 2: string path (manual generics)
export function useActionQuery<TInput = void, TOutput = unknown>(
  path: string,
  input?: MaybeRefOrGetter<TInput>,
  options?: UseActionQueryOptions<TOutput>,
): UseActionQueryReturn<TOutput>

// Implementation
export function useActionQuery(
  pathOrAction: string | TypedActionReference,
  input?: MaybeRefOrGetter<unknown>,
  options: UseActionQueryOptions = {},
): UseActionQueryReturn<unknown> {
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

  // Generate a unique key for caching/dedup — evaluated eagerly as a string
  // for Nuxt 3.x compatibility (getter keys require Nuxt 3.14+)
  const key = `action:${path}:${stableStringify(toValue(input) ?? {})}`

  const isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH'

  // ── Enabled flag ────────────────────────────────────────────────
  // Supports static boolean or reactive Ref/ComputedRef
  const isEnabled = computed(() => {
    if (options.enabled === undefined || options.enabled === true) return true
    if (options.enabled === false) return false
    return toValue(options.enabled as unknown as MaybeRefOrGetter<boolean>)
  })

  const asyncData = useAsyncData(
    key,
    () => {
      const inputVal = toValue(input) ?? {}
      const fetchOpts: Record<string, unknown> = { method }
      if (isBodyMethod) {
        fetchOpts.body = inputVal
      }
      else {
        fetchOpts.query = inputVal
      }
      return appFetch<ActionResult<unknown>>(path, fetchOpts)
    },
    {
      server: options.server ?? true,
      lazy: options.lazy ?? false,
      immediate: (options.immediate ?? true) && isEnabled.value,
      watch: input !== undefined ? [() => toValue(input)] : false,
    },
  )

  // Watch enabled — trigger fetch when reactive ref becomes true
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') {
    watch(isEnabled, (val) => {
      if (val) asyncData.refresh()
    })
  }

  // ── Unwrap ActionResult with optional transform ────────────────
  const data = computed(() => {
    const raw = asyncData.data.value
    if (!raw?.success) return (options.default?.() ?? null)
    return options.transform ? options.transform(raw.data as never) : raw.data
  })

  const error = computed<ActionError | null>(() => {
    const raw = asyncData.data.value
    if (raw && !raw.success) return raw.error
    return null
  })

  // ── Polling ───────────────────────────────────────────────────
  if (options.refetchInterval && options.refetchInterval > 0) {
    const intervalId = setInterval(() => {
      if (isEnabled.value) asyncData.refresh()
    }, options.refetchInterval)
    onScopeDispose(() => clearInterval(intervalId))
  }

  // ── Refetch on focus ──────────────────────────────────────────
  /* v8 ignore start -- client-only branch */
  if (options.refetchOnFocus && import.meta.client) {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && isEnabled.value) {
        asyncData.refresh()
      }
    }
    document.addEventListener('visibilitychange', onFocus)
    onScopeDispose(() => document.removeEventListener('visibilitychange', onFocus))
  }
  /* v8 ignore stop */

  // ── Refetch on reconnect ──────────────────────────────────────
  /* v8 ignore start -- client-only branch */
  if (options.refetchOnReconnect && import.meta.client) {
    const onOnline = () => {
      if (isEnabled.value) asyncData.refresh()
    }
    window.addEventListener('online', onOnline)
    onScopeDispose(() => window.removeEventListener('online', onOnline))
  }
  /* v8 ignore stop */

  return {
    data,
    error,
    status: asyncData.status,
    pending: asyncData.pending,
    refresh: asyncData.refresh,
    clear: asyncData.clear,
  }
}
