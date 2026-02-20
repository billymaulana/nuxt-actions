import { shallowRef, ref, readonly, triggerRef, onScopeDispose } from 'vue'
import { useNuxtApp, useRequestURL } from '#app'
import type {
  ActionError,
  StreamStatus,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  UseStreamActionOptions,
  UseStreamActionReturn,
} from '../types'
import { resolveHeaders } from './_utils'

/**
 * Composable for consuming streaming server actions via SSE.
 *
 * @example
 * ```ts
 * import { generateText } from '#actions'
 * const { execute, chunks, status } = useStreamAction(generateText)
 *
 * await execute({ prompt: 'Hello world' })
 * // chunks reactively updates as data arrives
 * ```
 */

// Overload 1: typed reference
export function useStreamAction<T extends TypedActionReference>(
  action: T,
  options?: UseStreamActionOptions<InferActionOutput<T>>,
): UseStreamActionReturn<InferActionInput<T>, InferActionOutput<T>>

// Overload 2: string path
export function useStreamAction<TInput = void, TChunk = unknown>(
  path: string,
  options?: UseStreamActionOptions<TChunk>,
): UseStreamActionReturn<TInput, TChunk>

// Implementation
export function useStreamAction(
  pathOrAction: string | TypedActionReference,
  options: UseStreamActionOptions<unknown> = {},
): UseStreamActionReturn<unknown, unknown> {
  const nuxtApp = useNuxtApp()

  let actionPath: string
  let method: string

  if (typeof pathOrAction === 'string') {
    actionPath = pathOrAction
    method = options.method ?? 'POST'
  }
  else {
    actionPath = `/api/_actions/${pathOrAction.__actionPath}`
    method = pathOrAction.__actionMethod
  }

  const chunks = shallowRef<unknown[]>([])
  const data = ref<unknown>(null)
  const status = ref<StreamStatus>('idle')
  const error = ref<ActionError | null>(null)

  let abortController: AbortController | null = null

  // Track execution generations to prevent stale catch blocks from corrupting state
  let executionId = 0

  /**
   * Resolve the full URL for fetch, handling SSR base URL resolution.
   */
  function resolveUrl(path: string): string {
    // Only resolve full URL during Nuxt SSR (import.meta.server is set by Nuxt at build time)
    /* v8 ignore start -- compile-time branch, only true in Nuxt SSR build */
    if (import.meta.server) {
      try {
        const reqUrl = useRequestURL()
        return new URL(path, reqUrl.origin).href
      }
      catch {
        // Fallback: return path as-is (may fail during SSR without request context)
        return path
      }
    }
    /* v8 ignore stop */
    // Client-side or non-Nuxt environment: relative URLs work fine
    return path
  }

  async function execute(input: unknown): Promise<void> {
    // Abort previous stream if any
    abortController?.abort()
    abortController = new AbortController()

    const thisExecutionId = ++executionId

    chunks.value = []
    data.value = null
    status.value = 'streaming'
    error.value = null

    // Timeout via simple setTimeout + flag instead of AbortSignal.any()
    // for broader runtime support (Safari <17.4, Node <20.3 lack AbortSignal.any)
    let timedOut = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        timedOut = true
        abortController?.abort()
      }, options.timeout)
    }

    try {
      // Build URL with query params for GET, body for POST
      let url = actionPath
      const headers: Record<string, string> = { Accept: 'text/event-stream' }

      // Merge user-provided headers
      const userHeaders = resolveHeaders(options.headers)
      if (userHeaders) {
        Object.assign(headers, userHeaders)
      }

      let body: string | undefined

      if (method === 'GET' || method === 'HEAD') {
        const params = new URLSearchParams()
        if (input && typeof input === 'object') {
          for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
            // Serialize non-primitive values as JSON to prevent "[object Object]" loss
            params.set(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? ''))
          }
        }
        const qs = params.toString()
        if (qs) url += `?${qs}`
      }
      else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(input ?? {})
      }

      // Forward cookies during SSR for authentication
      /* v8 ignore start -- compile-time branch, only true in Nuxt SSR build */
      if (import.meta.server) {
        const cookieHeader = nuxtApp.ssrContext?.event?.node?.req?.headers?.cookie
        if (cookieHeader) {
          headers.cookie = cookieHeader
        }
      }
      /* v8 ignore stop */

      const fetchInit: RequestInit = {
        method,
        headers,
        signal: abortController.signal,
      }
      if (body !== undefined) {
        fetchInit.body = body
      }

      const response = await fetch(resolveUrl(url), fetchInit)

      if (!response.ok || !response.body) {
        error.value = {
          code: 'STREAM_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
        }
        status.value = 'error'
        options.onError?.(error.value)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split('\n')
          // split() always returns >=1 element, so pop() is guaranteed non-null
          buffer = lines.pop()!

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith(':')) continue // Skip empty/comment lines

            let eventData: string | null = null
            if (trimmed.startsWith('data: ')) {
              eventData = trimmed.slice(6)
            }
            else if (trimmed.startsWith('data:')) {
              eventData = trimmed.slice(5)
            }

            if (eventData === null) continue

            try {
              const parsed = JSON.parse(eventData)

              // Check for error event
              if (parsed.__actions_error) {
                error.value = parsed.__actions_error
                status.value = 'error'
                options.onError?.(parsed.__actions_error)
                return
              }

              // Check for done event
              if (parsed.__actions_done) {
                status.value = 'done'
                options.onDone?.(chunks.value)
                return
              }

              // Regular data chunk — mutate in place + trigger for O(1)
              chunks.value.push(parsed)
              triggerRef(chunks)
              data.value = parsed
              options.onChunk?.(parsed)
            }
            catch (parseErr) {
              // Log parse failures in development to help debug malformed SSE data
              /* v8 ignore start -- import.meta.dev is a compile-time constant set by Nuxt */
              if (import.meta.dev) {
                console.warn('[nuxt-actions] Failed to parse SSE data:', eventData, parseErr)
              }
              /* v8 ignore stop */
            }
          }
        }

        // Flush any remaining bytes from incomplete UTF-8 sequences
        const remaining = decoder.decode()
        if (remaining) buffer += remaining

        // Stream ended without explicit done event
        if (status.value === 'streaming') {
          status.value = 'done'
          options.onDone?.(chunks.value)
        }
      }
      finally {
        // Always release the reader lock to prevent resource leaks
        reader.releaseLock()
      }
    }
    catch (err: unknown) {
      // Guard: only modify shared state if this is still the active execution
      if (thisExecutionId !== executionId) return

      if (err instanceof DOMException && err.name === 'AbortError') {
        // Check if abort was triggered by timeout
        if (timedOut) {
          const timeoutError: ActionError = {
            code: 'TIMEOUT_ERROR',
            message: `Stream connection timed out after ${options.timeout}ms`,
            statusCode: 408,
          }
          error.value = timeoutError
          status.value = 'error'
          options.onError?.(timeoutError)
          return
        }

        // Intentional abort (stop() or new execute())
        // Guard: only set 'done' if still streaming — a new execute() may have started
        /* v8 ignore start -- race-condition guard: stop() sets 'done' before abort fires */
        if (status.value === 'streaming') {
          status.value = 'done'
        }
        /* v8 ignore stop */
        return
      }

      // Legacy: direct TimeoutError — only fires if a runtime throws TimeoutError
      // independently (e.g. from a custom AbortSignal.timeout() used elsewhere).
      // The primary timeout mechanism above uses setTimeout + AbortError + timedOut flag.
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        const timeoutError: ActionError = {
          code: 'TIMEOUT_ERROR',
          message: `Stream connection timed out after ${options.timeout}ms`,
          statusCode: 408,
        }
        error.value = timeoutError
        status.value = 'error'
        options.onError?.(timeoutError)
        return
      }

      const actionError: ActionError = {
        code: 'STREAM_ERROR',
        message: err instanceof Error ? err.message : 'Stream connection failed',
        statusCode: 500,
      }
      error.value = actionError
      status.value = 'error'
      options.onError?.(actionError)
    }
    finally {
      clearTimeout(timeoutId)
    }
  }

  function stop() {
    executionId++ // Prevent stale catch blocks from modifying state
    abortController?.abort()
    abortController = null
    if (status.value === 'streaming') {
      status.value = 'done'
    }
  }

  // Cleanup on scope dispose (component unmount)
  onScopeDispose(() => {
    abortController?.abort()
    abortController = null
  })

  return {
    execute,
    stop,
    chunks: readonly(chunks) as Readonly<globalThis.Ref<unknown[]>>,
    data: readonly(data) as Readonly<globalThis.Ref<unknown>>,
    status: readonly(status) as Readonly<globalThis.Ref<StreamStatus>>,
    error: readonly(error) as Readonly<globalThis.Ref<ActionError | null>>,
  }
}
