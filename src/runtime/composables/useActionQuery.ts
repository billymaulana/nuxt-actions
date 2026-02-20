import { computed, toValue } from 'vue'
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
 */

// Overload 1: typed reference (full inference)
export function useActionQuery<T extends TypedActionReference>(
  action: T,
  input?: MaybeRefOrGetter<InferActionInput<T>>,
  options?: UseActionQueryOptions,
): UseActionQueryReturn<InferActionOutput<T>>

// Overload 2: string path (manual generics)
export function useActionQuery<TInput = void, TOutput = unknown>(
  path: string,
  input?: MaybeRefOrGetter<TInput>,
  options?: UseActionQueryOptions,
): UseActionQueryReturn<TOutput>

// Implementation
export function useActionQuery(
  pathOrAction: string | TypedActionReference,
  input?: MaybeRefOrGetter<unknown>,
  options: UseActionQueryOptions = {},
): UseActionQueryReturn<unknown> {
  const nuxtApp = useNuxtApp()

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
      return (nuxtApp.$fetch as typeof $fetch)<ActionResult<unknown>>(path, fetchOpts)
    },
    {
      server: options.server ?? true,
      lazy: options.lazy ?? false,
      immediate: options.immediate ?? true,
      watch: input !== undefined ? [() => toValue(input)] : false,
    },
  )

  // Unwrap ActionResult for cleaner DX
  const data = computed(() => {
    const raw = asyncData.data.value
    return raw?.success ? raw.data : (options.default?.() ?? null)
  })

  const error = computed<ActionError | null>(() => {
    const raw = asyncData.data.value
    if (raw && !raw.success) return raw.error
    return null
  })

  return {
    data,
    error,
    status: asyncData.status,
    pending: asyncData.pending,
    refresh: asyncData.refresh,
    clear: asyncData.clear,
  }
}
