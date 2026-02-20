import { defineEventHandler, readBody, getQuery, getHeader } from 'h3'
import type { H3Event } from 'h3'
import type {
  StandardSchemaV1,
  InferOutput,
  ActionMiddleware,
  ActionHandler,
  ActionError,
  ActionMetadata,
  ActionResult,
} from '../../types'

interface DefineActionOptions<
  TInputSchema extends StandardSchemaV1,
  TOutput,
  TCtx = Record<string, unknown>,
  TOutputSchema extends StandardSchemaV1 | undefined = undefined,
> {
  /** Standard Schema compliant schema for input validation (Zod, Valibot, ArkType, etc.) */
  input?: TInputSchema
  /** Standard Schema compliant schema for output validation */
  outputSchema?: TOutputSchema
  /** Middleware chain to run before handler */
  middleware?: ActionMiddleware[]
  /** Metadata for logging/analytics */
  metadata?: ActionMetadata
  /** Custom server error handler */
  handleServerError?: (error: Error) => { code: string, message: string, statusCode?: number }
  /** The action handler function */

  handler: ActionHandler<
    InferOutput<TInputSchema>,
    TOutput,
    TCtx
  >
}

/**
 * Define a type-safe server action with validation and middleware support.
 * Accepts any Standard Schema compliant library (Zod, Valibot, ArkType, etc.).
 *
 * The returned handler includes phantom `_types` for E2E type inference via `#actions`.
 *
 * @example
 * ```ts
 * // With Zod
 * export default defineAction({
 *   input: z.object({ title: z.string().min(1) }),
 *   handler: async ({ input }) => ({ id: Date.now(), title: input.title }),
 * })
 *
 * // With Valibot
 * export default defineAction({
 *   input: v.object({ title: v.string() }),
 *   handler: async ({ input }) => ({ id: Date.now(), title: input.title }),
 * })
 * ```
 */
export function defineAction<
  TInputSchema extends StandardSchemaV1,
  TOutput,
  TCtx = Record<string, unknown>,
  TOutputSchema extends StandardSchemaV1 | undefined = undefined,
>(options: DefineActionOptions<TInputSchema, TOutput, TCtx, TOutputSchema>) {
  type TInput = TInputSchema extends StandardSchemaV1<infer I, unknown> ? I : unknown

  async function _execute(rawInput: unknown, event: H3Event): Promise<ActionResult<TOutput>> {
    try {
      // 1. Validate input with Standard Schema
      let input = rawInput
      if (options.input) {
        // Guard: verify the schema implements Standard Schema interface
        if (typeof options.input['~standard']?.validate !== 'function') {
          throw new TypeError(
            '[nuxt-actions] The provided input schema does not implement the Standard Schema interface. '
            + 'Ensure you are using a supported library (Zod >=3.24, Valibot >=1.0, ArkType >=2.1).',
          )
        }

        const result = await options.input['~standard'].validate(rawInput)
        if (result.issues) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Input validation failed',
              fieldErrors: formatStandardIssues(result.issues),
              statusCode: 422,
            } satisfies ActionError,
          }
        }
        input = result.value
      }

      // 2. Run middleware chain
      let ctx = {} as TCtx
      if (options.middleware?.length) {
        ctx = await runMiddleware(event, options.middleware, options.metadata ?? {})
      }

      // 3. Execute handler — input is validated by Standard Schema at this point
      const data = await options.handler({
        input: input as InferOutput<TInputSchema>,
        event,
        ctx,
      })

      // 4. Validate output if outputSchema is provided
      if (options.outputSchema) {
        const outputResult = await options.outputSchema['~standard'].validate(data)
        if (outputResult.issues) {
          return {
            success: false,
            error: {
              code: 'OUTPUT_VALIDATION_ERROR',
              message: 'Output validation failed',
              fieldErrors: formatStandardIssues(outputResult.issues),
              statusCode: 500,
            } satisfies ActionError,
          }
        }
        return { success: true, data: outputResult.value as TOutput }
      }

      return { success: true, data }
    }
    catch (error: unknown) {
      // Handle known action errors
      if (isActionError(error)) {
        return {
          success: false,
          error: error as ActionError,
        }
      }

      // Custom server error handler takes priority for Error instances
      if (options.handleServerError && error instanceof Error) {
        const custom = options.handleServerError(error)
        return {
          success: false,
          error: {
            code: custom.code,
            message: custom.message,
            statusCode: custom.statusCode ?? 500,
          } satisfies ActionError,
        }
      }

      // Handle H3 errors (from createError) — plain objects with statusCode
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const h3Err = error as { statusCode: number, statusMessage?: string, message?: string }
        return {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: h3Err.statusMessage || 'Server error',
            statusCode: h3Err.statusCode,
          } satisfies ActionError,
        }
      }

      // Unknown error — never leak internal details to clients
      /* v8 ignore start -- import.meta.dev is a compile-time constant set by Nuxt */
      if (import.meta.dev) {
        console.error('[nuxt-actions] Unhandled error:', error)
      }
      /* v8 ignore stop */

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          statusCode: 500,
        } satisfies ActionError,
      }
    }
  }

  const handler = defineEventHandler(async (event: H3Event) => {
    let rawInput: unknown
    try {
      rawInput = await parseInput(event)
    }
    catch (parseError: unknown) {
      if (isActionError(parseError)) {
        return { success: false, error: parseError as ActionError }
      }
      throw parseError
    }
    return _execute(rawInput, event)
  })

  // Attach _execute and phantom _types for virtual module generation
  return Object.assign(handler, {
    _execute,
    _types: {} as {
      readonly input: TInput
      readonly output: TOutput
    },
  })
}

/**
 * Create a typed action error to throw from handlers or middleware.
 */
export function createActionError(opts: {
  code: string
  message: string
  statusCode?: number
  fieldErrors?: Record<string, string[]>
}): ActionError {
  const error = {
    code: opts.code,
    message: opts.message,
    statusCode: opts.statusCode ?? 400,
    fieldErrors: opts.fieldErrors,
    __isActionError: true,
  }
  return error as ActionError & { __isActionError: true }
}

// ── Internal helpers ──────────────────────────────────────────────

async function parseInput(event: H3Event): Promise<unknown> {
  const method = event.method.toUpperCase()

  if (method === 'GET' || method === 'HEAD') {
    return getQuery(event)
  }

  try {
    return await readBody(event) ?? {}
  }
  catch {
    // If Content-Type indicates JSON but body is malformed, return a clear error
    const contentType = getHeader(event, 'content-type') ?? ''
    if (contentType.includes('application/json')) {
      throw createActionError({
        code: 'PARSE_ERROR',
        message: 'Invalid JSON in request body',
        statusCode: 400,
      })
    }
    return {}
  }
}

export function isActionError(error: unknown): error is ActionError {
  return (
    error !== null
    && typeof error === 'object'
    && Object.prototype.hasOwnProperty.call(error, '__isActionError')
    && (error as Record<string, unknown>).__isActionError === true
  )
}

/**
 * Convert Standard Schema issues to Record<string, string[]> field errors.
 */
export function formatStandardIssues(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): Record<string, string[]> {
  // Use null-prototype object to prevent prototype pollution via field paths
  const fieldErrors: Record<string, string[]> = Object.create(null)
  for (const issue of issues) {
    const path = issue.path?.length
      ? issue.path.map(p => typeof p === 'object' ? String(p.key) : String(p)).join('.')
      : '_root'
    if (!fieldErrors[path]) fieldErrors[path] = []
    fieldErrors[path].push(issue.message)
  }
  return fieldErrors
}

/**
 * Deep merge two plain objects. Arrays and non-plain values are overwritten, not merged.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const targetVal = target[key]
    const sourceVal = source[key]
    if (
      targetVal && sourceVal
      && typeof targetVal === 'object' && typeof sourceVal === 'object'
      && !Array.isArray(targetVal) && !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    }
    else {
      result[key] = sourceVal
    }
  }
  return result
}

export async function runMiddleware(
  event: H3Event,
  middlewares: ActionMiddleware[],
  metadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let ctx: Record<string, unknown> = {}

  for (const middleware of middlewares) {
    let nextCalled = false
    await middleware({
      event,
      ctx,
      metadata,
      next: async (opts) => {
        if (nextCalled) {
          throw new Error('[nuxt-actions] Middleware called next() more than once')
        }
        nextCalled = true
        if (opts?.ctx) {
          ctx = deepMerge(ctx, opts.ctx)
        }
        return ctx
      },
    })

    // Warn if middleware forgot to call next() — almost always a bug
    if (!nextCalled) {
      console.warn(
        '[nuxt-actions] Middleware did not call next(). '
        + 'This may be intentional (early return) or a bug. '
        + 'Context from this middleware will not be propagated.',
      )
    }
  }

  return ctx
}
