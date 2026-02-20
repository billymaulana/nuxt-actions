import { defineEventHandler, readBody, getQuery, createEventStream } from 'h3'
import type { H3Event, EventStream } from 'h3'
import type {
  StandardSchemaV1,
  InferOutput,
  ActionMiddleware,
  ActionMetadata,
  ActionError,
} from '../../types'
import { formatStandardIssues, runMiddleware, isActionError } from './defineAction'

interface StreamActionSender<TChunk = unknown> {
  /** Send a data chunk to the client */
  send: (data: TChunk) => Promise<void>
  /** Close the stream */
  close: () => Promise<void>
}

interface DefineStreamActionOptions<
  TInputSchema extends StandardSchemaV1 = StandardSchemaV1,
  TChunk = unknown,
  TCtx = Record<string, unknown>,
> {
  /** Standard Schema compliant schema for input validation */
  input?: TInputSchema
  /** Middleware chain to run before handler */
  middleware?: ActionMiddleware[]
  /** Metadata for logging/analytics */
  metadata?: ActionMetadata
  /** Custom server error handler */
  handleServerError?: (error: Error) => { code: string, message: string, statusCode?: number }
  /** The streaming handler function */
  handler: (params: {
    input: InferOutput<TInputSchema>
    event: H3Event
    ctx: TCtx
    stream: StreamActionSender<TChunk>
  }) => Promise<void>
}

/**
 * Define a streaming server action that sends data via Server-Sent Events.
 *
 * @example
 * ```ts
 * export default defineStreamAction({
 *   input: z.object({ prompt: z.string() }),
 *   handler: async ({ input, stream }) => {
 *     for (const word of input.prompt.split(' ')) {
 *       await stream.send({ text: word })
 *       await new Promise(r => setTimeout(r, 100))
 *     }
 *     await stream.close()
 *   },
 * })
 * ```
 */
export function defineStreamAction<
  TInputSchema extends StandardSchemaV1,
  TChunk = unknown,
  TCtx = Record<string, unknown>,
>(options: DefineStreamActionOptions<TInputSchema, TChunk, TCtx>) {
  type TInput = TInputSchema extends StandardSchemaV1<infer I, unknown> ? I : unknown

  const handler = defineEventHandler(async (event: H3Event) => {
    try {
      // 1. Parse input
      const method = event.method.toUpperCase()
      let rawInput: unknown
      if (method === 'GET' || method === 'HEAD') {
        rawInput = getQuery(event)
      }
      else {
        rawInput = await readBody(event) ?? {}
      }

      // 2. Validate input
      let input = rawInput
      if (options.input) {
        if (typeof options.input['~standard']?.validate !== 'function') {
          throw new TypeError(
            '[nuxt-actions] The provided input schema does not implement the Standard Schema interface.',
          )
        }

        const result = await options.input['~standard'].validate(rawInput)
        if (result.issues) {
          const error: ActionError = {
            code: 'VALIDATION_ERROR',
            message: 'Input validation failed',
            fieldErrors: formatStandardIssues(result.issues),
            statusCode: 422,
          }
          // For streams, send error as SSE and close
          const errorStream = createEventStream(event)
          await errorStream.push(JSON.stringify({ __actions_error: error }))
          await errorStream.close()
          return errorStream.send()
        }
        input = result.value
      }

      // 3. Run middleware chain
      let ctx = {} as TCtx
      if (options.middleware?.length) {
        ctx = await runMiddleware(event, options.middleware, options.metadata ?? {}) as TCtx
      }

      // 4. Create event stream
      const eventStream: EventStream = createEventStream(event)

      const streamSender: StreamActionSender<TChunk> = {
        send: async (data: TChunk) => {
          await eventStream.push(JSON.stringify(data))
        },
        close: async () => {
          // Send a done event before closing
          await eventStream.push(JSON.stringify({ __actions_done: true }))
          await eventStream.close()
        },
      }

      // 5. Run handler (non-blocking — let stream be returned first)
      options.handler({
        input: input as InferOutput<TInputSchema>,
        event,
        ctx,
        stream: streamSender,
      })
        .catch(async (err: unknown) => {
          // Preserve ActionError from handler (createActionError)
          let errorPayload: { code: string, message: string, statusCode: number }
          if (isActionError(err)) {
            errorPayload = err
          }
          else if (err instanceof Error && options.handleServerError) {
            const custom = options.handleServerError(err)
            errorPayload = {
              code: custom.code,
              message: custom.message,
              statusCode: custom.statusCode ?? 500,
            }
          }
          else {
            // Never leak internal error details to clients in production
            /* v8 ignore start -- import.meta.dev is a compile-time constant set by Nuxt */
            if (import.meta.dev && err instanceof Error) {
              console.error('[nuxt-actions] Stream handler error:', err)
            }
            /* v8 ignore stop */
            errorPayload = {
              code: 'STREAM_ERROR',
              message: 'Stream handler error',
              statusCode: 500,
            }
          }
          const errorData = { __actions_error: errorPayload }
          try {
            await eventStream.push(JSON.stringify(errorData))
          }
          catch {
            // Stream may already be closed
          }
          try {
            await eventStream.close()
          }
          catch {
            // Stream may already be closed
          }
        })

      return eventStream.send()
    }
    catch (error: unknown) {
      // Handle errors during setup (before stream is created)
      if (error instanceof TypeError) throw error

      // Preserve ActionError from middleware (createActionError)
      if (isActionError(error)) {
        const errorStream = createEventStream(event)
        await errorStream.push(JSON.stringify({ __actions_error: error }))
        await errorStream.close()
        return errorStream.send()
      }

      const actionError = error instanceof Error && options.handleServerError
        ? options.handleServerError(error)
        : { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', statusCode: 500 }

      const errorStream = createEventStream(event)
      await errorStream.push(JSON.stringify({
        __actions_error: {
          code: actionError.code,
          message: actionError.message,
          statusCode: actionError.statusCode ?? 500,
        },
      }))
      await errorStream.close()
      return errorStream.send()
    }
  })

  // Attach phantom types for template generation
  return Object.assign(handler, {
    _types: {} as {
      readonly input: TInput
      readonly output: TChunk
    },
    _isStream: true as const,
  })
}
