import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useNuxtApp } from '#app'
import type {
  ActionResult,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
} from '../types'
import { stableStringify } from './_utils'

/**
 * Pre-warm the Nuxt data cache for an action query ahead of time.
 *
 * Fetches the action result and stores it under the same cache key that
 * `useActionQuery` uses, so when the composable mounts it finds cached data
 * and skips the initial network request.
 *
 * Ideal for prefetching on hover, route prefetch, or during idle time.
 *
 * @example
 * ```ts
 * import { listTodos, searchTodos } from '#actions'
 *
 * // Prefetch without input
 * await prefetchAction(listTodos)
 *
 * // Prefetch with input
 * await prefetchAction(searchTodos, { q: 'hello' })
 * ```
 *
 * @example With string path:
 * ```ts
 * await prefetchAction('/api/todos')
 * ```
 */

// Overload 1: typed reference (full inference)
export function prefetchAction<T extends TypedActionReference>(
  action: T,
  input?: MaybeRefOrGetter<InferActionInput<T>>,
): Promise<InferActionOutput<T> | null>

// Overload 2: string path (manual generics)
export function prefetchAction<TInput = void, TOutput = unknown>(
  path: string,
  input?: MaybeRefOrGetter<TInput>,
): Promise<TOutput | null>

// Implementation
export async function prefetchAction(
  pathOrAction: string | TypedActionReference,
  input?: MaybeRefOrGetter<unknown>,
): Promise<unknown> {
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

  // Generate the same cache key that useActionQuery uses
  const inputVal = toValue(input) ?? {}
  const key = `action:${path}:${stableStringify(inputVal)}`

  // Skip if data is already cached
  if (nuxtApp.payload.data[key] !== undefined) {
    const cached = nuxtApp.payload.data[key] as ActionResult<unknown>
    return cached?.success ? cached.data : null
  }

  const isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH'

  const fetchOpts: Record<string, unknown> = { method }
  if (isBodyMethod) {
    fetchOpts.body = inputVal
  }
  else {
    fetchOpts.query = inputVal
  }

  try {
    const result = await appFetch<ActionResult<unknown>>(path, fetchOpts)

    // Store in payload.data under the same key useActionQuery will look up
    nuxtApp.payload.data[key] = result
    // Also populate static.data for SSR hydration scenarios
    nuxtApp.static.data[key] = result

    return result?.success ? result.data : null
  }
  catch {
    // Silently fail — prefetching is best-effort
    return null
  }
}
