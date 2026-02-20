import type { H3Event } from 'h3'

// ── Standard Schema v1 ────────────────────────────────────────────
// Inlined to avoid external dependency. Compatible with Zod 3.24+,
// Valibot 1.0+, ArkType 2.1+, and any library implementing the
// Standard Schema specification (https://standardschema.dev/).

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>
    readonly types?: Types<Input, Output> | undefined
  }

  interface Types<Input = unknown, Output = Input> {
    readonly input: Input
    readonly output: Output
  }

  type Result<Output> = SuccessResult<Output> | FailureResult

  interface SuccessResult<Output> {
    readonly value: Output
    readonly issues?: undefined
  }

  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>
  }

  interface Issue {
    readonly message: string
    readonly path?: ReadonlyArray<
      PropertyKey | PathSegment
    > | undefined
  }

  interface PathSegment {
    readonly key: PropertyKey
  }
}

// ── Schema Inference ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferInput<T> = T extends StandardSchemaV1<infer I, any> ? I : never
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferOutput<T> = T extends StandardSchemaV1<any, infer O> ? O : never

// ── Action Status & Error ─────────────────────────────────────────

export type ActionStatus = 'idle' | 'executing' | 'success' | 'error'

export interface ActionError {
  code: string
  message: string
  fieldErrors?: Record<string, string[]>
  statusCode: number
}

export type ActionResult<TOutput>
  = | { success: true, data: TOutput }
    | { success: false, error: ActionError }

// ── HTTP Methods ──────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

// ── Middleware ─────────────────────────────────────────────────────

export interface MiddlewareContext<TCtx = Record<string, unknown>> {
  event: H3Event
  ctx: TCtx
  metadata: ActionMetadata
}

export type ActionMiddleware<
  TCtxIn = Record<string, unknown>,
  TCtxOut = TCtxIn,
> = (context: MiddlewareContext<TCtxIn> & {
  next: <TNewCtx extends Record<string, unknown>>(opts?: { ctx: TNewCtx }) => Promise<TNewCtx & TCtxIn>
}) => Promise<TCtxOut & TCtxIn>

// ── Handler ───────────────────────────────────────────────────────

export type ActionHandler<TInput, TOutput, TCtx = Record<string, unknown>> = (params: {
  input: TInput
  event: H3Event
  ctx: TCtx
}) => TOutput | Promise<TOutput>

// ── Metadata ──────────────────────────────────────────────────────

export type ActionMetadata = Record<string, unknown>

// ── defineAction Options ──────────────────────────────────────────

export interface ActionOptions<
  TInputSchema extends StandardSchemaV1,
  TOutput,
  TCtx = Record<string, unknown>,
  TOutputSchema extends StandardSchemaV1 | undefined = undefined,
> {
  input?: TInputSchema
  outputSchema?: TOutputSchema
  middleware?: ActionMiddleware[]
  metadata?: ActionMetadata
  handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>
}

// ── Builder Pattern Types ─────────────────────────────────────────

export interface ActionClient<TCtx = Record<string, never>> {
  use: <TNewCtx extends Record<string, unknown>>(
    middleware: ActionMiddleware<TCtx, TNewCtx>,
  ) => ActionClient<TCtx & TNewCtx>
  schema: <TInputSchema extends StandardSchemaV1>(
    inputSchema: TInputSchema,
  ) => ActionClientWithSchema<TCtx, TInputSchema>
  metadata: (meta: ActionMetadata) => ActionClient<TCtx>
  action: <TOutput>(
    handler: ActionHandler<unknown, TOutput, TCtx>,
  ) => ReturnType<typeof import('h3')['defineEventHandler']>
}

export interface ActionClientWithSchema<TCtx, TInputSchema extends StandardSchemaV1> {
  outputSchema: <TOutputSchema extends StandardSchemaV1>(
    schema: TOutputSchema,
  ) => ActionClientWithSchema<TCtx, TInputSchema>
  metadata: (meta: ActionMetadata) => ActionClientWithSchema<TCtx, TInputSchema>
  action: <TOutput>(
    handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>,
  ) => ReturnType<typeof import('h3')['defineEventHandler']>
}

// ── Typed Action Reference (E2E Type Inference) ──────────────────

export interface TypedActionReference<TInput = unknown, TOutput = unknown> {
  readonly __actionPath: string
  readonly __actionMethod: string
  readonly _types: { readonly input: TInput, readonly output: TOutput }
}

export type InferActionInput<T>
  = T extends TypedActionReference<infer I, unknown> ? I : never

export type InferActionOutput<T>
  = T extends TypedActionReference<unknown, infer O> ? O : never

// ── defineAction Return (with phantom types) ─────────────────────

export interface TypedActionHandler<TInput = unknown, TOutput = unknown> {
  _execute: (rawInput: unknown, event: H3Event) => Promise<ActionResult<TOutput>>
  _types: { readonly input: TInput, readonly output: TOutput }
}

// ── Retry Configuration ───────────────────────────────────────────

export interface RetryConfig {
  /** Number of retry attempts. Default: 3 */
  count?: number
  /** Delay between retries in milliseconds. Default: 500 */
  delay?: number
  /** HTTP status codes to retry on. Default: [408, 409, 425, 429, 500, 502, 503, 504] */
  statusCodes?: number[]
}

// ── useAction Options ─────────────────────────────────────────────

export interface UseActionOptions<TInput, TOutput> {
  method?: HttpMethod
  /** Static headers or a function returning headers (e.g. for auth tokens) */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Retry configuration. true = 3 retries, number = custom count, object = full config */
  retry?: boolean | number | RetryConfig
  /** Request timeout in milliseconds. Aborts the request if exceeded. */
  timeout?: number
  /** Request deduplication strategy. 'cancel' aborts previous, 'defer' returns existing promise */
  dedupe?: 'cancel' | 'defer'
  /** Debounce execute calls by this many milliseconds. Mutually exclusive with throttle (debounce wins). */
  debounce?: number
  /** Throttle execute calls to at most once per this many milliseconds. Mutually exclusive with debounce. */
  throttle?: number
  onSuccess?: (data: TOutput) => void
  onError?: (error: ActionError) => void
  onSettled?: (result: ActionResult<TOutput>) => void
  onExecute?: (input: TInput) => void
}

export interface UseActionReturn<TInput, TOutput> {
  execute: (input: TInput) => Promise<ActionResult<TOutput>>
  executeAsync: (input: TInput) => Promise<TOutput>
  data: Readonly<globalThis.Ref<TOutput | null>>
  error: Readonly<globalThis.Ref<ActionError | null>>
  status: Readonly<globalThis.Ref<ActionStatus>>
  isIdle: globalThis.ComputedRef<boolean>
  isExecuting: globalThis.ComputedRef<boolean>
  hasSucceeded: globalThis.ComputedRef<boolean>
  hasErrored: globalThis.ComputedRef<boolean>
  reset: () => void
}

// ── useOptimisticAction Options ───────────────────────────────────

export interface UseOptimisticActionOptions<TInput, TOutput> {
  method?: HttpMethod
  /** Static headers or a function returning headers (e.g. for auth tokens) */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Retry configuration. true = 3 retries, number = custom count, object = full config */
  retry?: boolean | number | RetryConfig
  /** Request timeout in milliseconds. Aborts the request if exceeded. */
  timeout?: number
  /** Debounce execute calls by this many milliseconds. Mutually exclusive with throttle (debounce wins). */
  debounce?: number
  /** Throttle execute calls to at most once per this many milliseconds. Mutually exclusive with debounce. */
  throttle?: number
  currentData: globalThis.Ref<TOutput> | globalThis.ComputedRef<TOutput>
  updateFn: (input: TInput, currentData: TOutput) => TOutput
  onSuccess?: (data: TOutput) => void
  onError?: (error: ActionError) => void
  onSettled?: (result: ActionResult<TOutput>) => void
  onExecute?: (input: TInput) => void
}

export interface UseOptimisticActionReturn<TInput, TOutput> {
  execute: (input: TInput) => Promise<ActionResult<TOutput>>
  optimisticData: Readonly<globalThis.Ref<TOutput>>
  data: Readonly<globalThis.Ref<TOutput | null>>
  error: Readonly<globalThis.Ref<ActionError | null>>
  status: Readonly<globalThis.Ref<ActionStatus>>
  isIdle: globalThis.ComputedRef<boolean>
  isExecuting: globalThis.ComputedRef<boolean>
  hasSucceeded: globalThis.ComputedRef<boolean>
  hasErrored: globalThis.ComputedRef<boolean>
  reset: () => void
}

// ── useActionQuery Options ────────────────────────────────────────

export interface UseActionQueryOptions {
  /** Run on SSR. Default: true */
  server?: boolean
  /** Don't block navigation. Default: false */
  lazy?: boolean
  /** Execute immediately. Default: true */
  immediate?: boolean
  /** Default value factory when data is null */
  default?: () => unknown
}

export interface UseActionQueryReturn<TOutput> {
  data: globalThis.ComputedRef<TOutput | null>
  error: globalThis.ComputedRef<ActionError | null>
  status: globalThis.Ref<'idle' | 'pending' | 'success' | 'error'>
  pending: globalThis.Ref<boolean>
  refresh: () => Promise<void>
  clear: () => void
}

// ── useStreamAction Options ───────────────────────────────────────

export interface UseStreamActionOptions<TChunk = unknown> {
  /** HTTP method override for string path usage. Default: 'POST' */
  method?: HttpMethod
  /** Static headers or a function returning headers (e.g. for auth tokens) */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Connection timeout in milliseconds. Aborts the stream if the initial connection is not established within this time. */
  timeout?: number
  onChunk?: (chunk: TChunk) => void
  onDone?: (allChunks: TChunk[]) => void
  onError?: (error: ActionError) => void
}

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface UseStreamActionReturn<TInput, TChunk> {
  execute: (input: TInput) => Promise<void>
  stop: () => void
  chunks: Readonly<globalThis.Ref<TChunk[]>>
  data: Readonly<globalThis.Ref<TChunk | null>>
  status: Readonly<globalThis.Ref<StreamStatus>>
  error: Readonly<globalThis.Ref<ActionError | null>>
}

// ── useFormAction Options ────────────────────────────────────────

export interface UseFormActionOptions<TInput, TOutput> extends Omit<UseActionOptions<TInput, TOutput>, 'onExecute'> {
  /** Initial values for the form fields */
  initialValues: TInput
}

export interface UseFormActionReturn<TInput, TOutput> {
  /** Reactive form fields — use directly with v-model */
  fields: TInput
  /** Submit the form (sends current field values to the action) */
  submit: () => Promise<ActionResult<TOutput>>
  /** Field-level validation errors from the server (VALIDATION_ERROR) */
  fieldErrors: globalThis.ComputedRef<Record<string, string[]>>
  /** Whether any field has been modified from initial values */
  isDirty: globalThis.ComputedRef<boolean>
  /** Reset fields to initial values and clear errors */
  reset: () => void
  /** Action status */
  status: Readonly<globalThis.Ref<ActionStatus>>
  /** Last server error */
  error: Readonly<globalThis.Ref<ActionError | null>>
  /** Last successful server response data */
  data: Readonly<globalThis.Ref<TOutput | null>>
  /** Whether a submission is currently in flight */
  isSubmitting: globalThis.ComputedRef<boolean>
}
