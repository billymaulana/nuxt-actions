import type {
  StandardSchemaV1,
  InferInput,
  InferOutput,
  ActionMiddleware,
  ActionHandler,
  ActionMetadata,
  ActionClient,
  ActionClientWithSchema,
  BuiltAction,
  IdempotencyConfig,
} from '../../types'
import { defineAction } from './defineAction'

type ServerErrorHandler = (error: Error) => { code: string, message: string, statusCode?: number }

/**
 * Create a builder-based action client with middleware, schemas, and metadata.
 * Each method returns a new immutable instance—safe to share and extend.
 *
 * @example
 * ```ts
 * const authClient = createActionClient({
 *   handleServerError: (error) => ({
 *     code: 'SERVER_ERROR',
 *     message: error.message,
 *     statusCode: 500,
 *   }),
 * })
 *   .use(authMiddleware)
 *   .use(rateLimitMiddleware)
 *
 * export default authClient
 *   .schema(z.object({ title: z.string() }))
 *   .action(async ({ input, ctx }) => {
 *     return { id: Date.now(), title: input.title }
 *   })
 * ```
 */
export function createActionClient<TCtx = Record<string, unknown>>(
  opts?: {
    middleware?: ActionMiddleware[]
    handleServerError?: ServerErrorHandler
  },
): ActionClient<TCtx> {
  const config: BuilderConfig = {
    middleware: [...(opts?.middleware ?? [])],
    metadata: {} as ActionMetadata,
    handleServerError: opts?.handleServerError,
  }

  return buildClient<TCtx>(config)
}

interface BuilderConfig {
  middleware: ActionMiddleware[]
  metadata: ActionMetadata
  inputSchema?: StandardSchemaV1
  outputSchema?: StandardSchemaV1
  idempotency?: IdempotencyConfig
  handleServerError?: ServerErrorHandler
}

function buildClient<TCtx>(config: BuilderConfig): ActionClient<TCtx> {
  return {
    use<TNewCtx extends Record<string, unknown>>(
      middleware: ActionMiddleware<TCtx, TNewCtx>,
    ): ActionClient<TCtx & TNewCtx> {
      // Middleware is typed at the public API boundary; internal storage uses the base type
      return buildClient<TCtx & TNewCtx>({
        ...config,
        middleware: [...config.middleware, middleware as ActionMiddleware<Record<string, unknown>, Record<string, unknown>>],
      })
    },

    schema<TInputSchema extends StandardSchemaV1>(
      inputSchema: TInputSchema,
    ): ActionClientWithSchema<TCtx, TInputSchema> {
      return buildClientWithSchema<TCtx, TInputSchema>({
        ...config,
        inputSchema,
      })
    },

    metadata(meta: ActionMetadata): ActionClient<TCtx> {
      return buildClient<TCtx>({
        ...config,
        metadata: { ...config.metadata, ...meta },
      })
    },

    idempotency(idempotencyConfig: IdempotencyConfig = {}): ActionClient<TCtx> {
      return buildClient<TCtx>({
        ...config,
        idempotency: idempotencyConfig,
      })
    },

    action<TOutput>(
      handler: ActionHandler<unknown, TOutput, TCtx>,
    ) {
      return defineAction({
        middleware: config.middleware,
        metadata: config.metadata,
        idempotency: config.idempotency,
        handleServerError: config.handleServerError,
        handler: handler as ActionHandler<unknown, TOutput, Record<string, unknown>>,
      })
    },
  }
}

function buildClientWithSchema<TCtx, TInputSchema extends StandardSchemaV1>(
  config: BuilderConfig,
): ActionClientWithSchema<TCtx, TInputSchema> {
  return {
    outputSchema<TOutputSchema extends StandardSchemaV1>(
      schema: TOutputSchema,
    ): ActionClientWithSchema<TCtx, TInputSchema> {
      return buildClientWithSchema<TCtx, TInputSchema>({
        ...config,
        outputSchema: schema,
      })
    },

    metadata(meta: ActionMetadata): ActionClientWithSchema<TCtx, TInputSchema> {
      return buildClientWithSchema<TCtx, TInputSchema>({
        ...config,
        metadata: { ...config.metadata, ...meta },
      })
    },

    idempotency(idempotencyConfig: IdempotencyConfig = {}): ActionClientWithSchema<TCtx, TInputSchema> {
      return buildClientWithSchema<TCtx, TInputSchema>({
        ...config,
        idempotency: idempotencyConfig,
      })
    },

    action<TOutput>(
      handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>,
    ) {
      /*
       * defineAction's phantom input type and InferInput are equivalent but
       * expressed as distinct deferred conditionals TS cannot unify.
       */
      return defineAction<TInputSchema, TOutput, Record<string, unknown>, StandardSchemaV1 | undefined>({
        input: config.inputSchema as TInputSchema,
        outputSchema: config.outputSchema as StandardSchemaV1 | undefined,
        middleware: config.middleware,
        metadata: config.metadata,
        idempotency: config.idempotency,
        handleServerError: config.handleServerError,
        handler: handler as ActionHandler<InferOutput<TInputSchema>, TOutput, Record<string, unknown>>,
      }) as unknown as BuiltAction<InferInput<TInputSchema>, TOutput>
    },
  }
}
