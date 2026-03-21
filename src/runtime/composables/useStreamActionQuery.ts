import { shallowRef, ref, readonly, watch, triggerRef } from 'vue'
import { useNuxtApp } from '#app'
import type {
  ActionError,
  StreamStatus,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseStreamActionQueryOptions,
  UseStreamActionQueryReturn,
} from '../types'
import { stableStringify } from './_utils'
import { useStreamAction } from './useStreamAction'

/**
 * Composable that wraps `useStreamAction` with caching support.
 *
 * When a stream completes, the accumulated chunks are cached in `nuxtApp.payload.data`.
 * On remount, cached chunks are restored immediately, avoiding a redundant stream request.
 *
 * @example
 * ```ts
 * import { generateReport } from '#actions'
 * const { execute, chunks, fromCache, clearCache } = useStreamActionQuery(generateReport, {
 *   cacheKey: 'report-main',
 * })
 *
 * await execute({ prompt: 'Q4 summary' })
 * // On remount, chunks are restored from cache
 * ```
 *
 * @example With string path:
 * ```ts
 * const { execute, chunks, fromCache } = useStreamActionQuery<
 *   { prompt: string },
 *   { text: string }
 * >('/api/stream/generate', {
 *   cacheKey: 'generate-stream',
 * })
 * ```
 */

// Overload 1: typed reference (full inference)
export function useStreamActionQuery<T extends TypedActionReference>(
  action: T,
  options?: UseStreamActionQueryOptions<InferActionOutput<T>>,
): UseStreamActionQueryReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: string path (manual generics)
export function useStreamActionQuery<TInput = void, TChunk = unknown>(
  path: string,
  options?: UseStreamActionQueryOptions<TChunk>,
): UseStreamActionQueryReturn<TInput, TChunk>

// Implementation
export function useStreamActionQuery(
  pathOrAction: string | TypedActionReference,
  options: UseStreamActionQueryOptions<unknown> = {},
): UseStreamActionQueryReturn<unknown, unknown> {
  const nuxtApp = useNuxtApp()

  // Resolve path for cache key generation
  const actionPath = typeof pathOrAction === 'string'
    ? pathOrAction
    : `/api/_actions/${(pathOrAction as TypedActionReference).__actionPath}`

  // Cache key: use explicit key if provided, otherwise derive from action path
  const cacheKey = options.cacheKey
    ? `stream:${options.cacheKey}`
    : `stream:${actionPath}:${stableStringify({})}`

  // ── Managed refs (always returned to the consumer) ─────────────
  const chunks = shallowRef<unknown[]>([])
  const data = ref<unknown>(null)
  const status = ref<StreamStatus>('idle')
  const error = ref<ActionError | null>(null)
  const fromCache = ref(false)

  // ── Restore from cache on mount ────────────────────────────────
  const cached = nuxtApp.payload.data[cacheKey] as unknown[] | undefined

  if (cached && Array.isArray(cached) && cached.length > 0) {
    chunks.value = [...cached]
    data.value = cached[cached.length - 1] ?? null
    status.value = 'done'
    fromCache.value = true
  }

  // ── Wrap callbacks to intercept stream lifecycle ───────────────
  const wrappedOptions: UseStreamActionQueryOptions<unknown> = {
    ...options,
    onChunk: (chunk) => {
      // Sync chunk to our managed refs for live reactivity during streaming
      chunks.value.push(chunk)
      triggerRef(chunks)
      data.value = chunk
      options.onChunk?.(chunk)
    },
    onDone: (allChunks) => {
      // Store completed chunks in payload for cache restoration on remount
      nuxtApp.payload.data[cacheKey] = allChunks
      status.value = 'done'
      options.onDone?.(allChunks)
    },
    onError: (err) => {
      error.value = err
      status.value = 'error'
      options.onError?.(err)
    },
  }

  // Delegate to useStreamAction for the actual streaming logic
  const stream = useStreamAction(pathOrAction as string, wrappedOptions)

  // Sync status from the underlying stream (covers 'streaming' transition)
  watch(stream.status, (val) => {
    if (val === 'streaming') {
      status.value = 'streaming'
    }
  })

  /**
   * Execute the stream, clearing any cached state first.
   * After execution, the onDone/onError callbacks handle state updates.
   */
  async function execute(input: unknown): Promise<void> {
    // Reset managed refs
    fromCache.value = false
    chunks.value = []
    data.value = null
    status.value = 'idle'
    error.value = null

    await stream.execute(input)
  }

  /** Clear the cached stream result from the Nuxt payload. */
  function clearCache(): void {
    nuxtApp.payload.data[cacheKey] = undefined
    fromCache.value = false
  }

  return {
    execute,
    stop: stream.stop,
    chunks: readonly(chunks) as Readonly<globalThis.Ref<unknown[]>>,
    data: readonly(data) as Readonly<globalThis.Ref<unknown>>,
    status: readonly(status) as Readonly<globalThis.Ref<StreamStatus>>,
    error: readonly(error) as Readonly<globalThis.Ref<ActionError | null>>,
    fromCache: readonly(fromCache) as Readonly<globalThis.Ref<boolean>>,
    clearCache,
  }
}
