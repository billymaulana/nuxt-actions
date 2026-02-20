# Type Reference

Complete type definitions exported by `nuxt-actions`. All types are defined in `src/runtime/types.ts` and are available for import when needed.

---

## Standard Schema

### StandardSchemaV1

The Standard Schema v1 interface, inlined to avoid external dependencies. Compatible with [Zod](https://zod.dev/) (>=3.24), [Valibot](https://valibot.dev/) (>=1.0), [ArkType](https://arktype.io/) (>=2.1), and any library implementing the [Standard Schema specification](https://standardschema.dev/).

```ts
interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}
```

#### StandardSchemaV1.Props

```ts
interface Props<Input = unknown, Output = Input> {
  /** Must be 1 for Standard Schema v1. */
  readonly version: 1
  /** The name of the schema library (e.g., 'zod', 'valibot', 'arktype'). */
  readonly vendor: string
  /** Validate a value against this schema. */
  readonly validate: (
    value: unknown,
  ) => Result<Output> | Promise<Result<Output>>
  /** Optional type-level metadata for inference. */
  readonly types?: Types<Input, Output> | undefined
}
```

#### StandardSchemaV1.Types

```ts
interface Types<Input = unknown, Output = Input> {
  readonly input: Input
  readonly output: Output
}
```

#### StandardSchemaV1.Result

```ts
type Result<Output> = SuccessResult<Output> | FailureResult
```

#### StandardSchemaV1.SuccessResult

```ts
interface SuccessResult<Output> {
  /** The validated and potentially transformed output value. */
  readonly value: Output
  /** Always undefined on success. */
  readonly issues?: undefined
}
```

#### StandardSchemaV1.FailureResult

```ts
interface FailureResult {
  /** One or more validation issues. */
  readonly issues: ReadonlyArray<Issue>
}
```

#### StandardSchemaV1.Issue

```ts
interface Issue {
  /** A human-readable error message. */
  readonly message: string
  /** The path to the field that caused the issue. */
  readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
}
```

#### StandardSchemaV1.PathSegment

```ts
interface PathSegment {
  readonly key: PropertyKey
}
```

### InferInput

Extract the input type from a Standard Schema.

```ts
type InferInput<T> = T extends StandardSchemaV1<infer I, any> ? I : never
```

**Usage:**

```ts
import { z } from 'zod'

const schema = z.object({ title: z.string() })
type Input = InferInput<typeof schema>
// { title: string }
```

### InferOutput

Extract the output type from a Standard Schema. The output may differ from input when the schema applies transforms.

```ts
type InferOutput<T> = T extends StandardSchemaV1<any, infer O> ? O : never
```

**Usage:**

```ts
import { z } from 'zod'

const schema = z.object({ count: z.coerce.number() })
type Input = InferInput<typeof schema>   // { count: number }
type Output = InferOutput<typeof schema> // { count: number }
```

---

## Action Status and Error

### ActionStatus

Represents the lifecycle state of an action execution.

```ts
type ActionStatus = 'idle' | 'executing' | 'success' | 'error'
```

| Value | Description |
|-------|-------------|
| `'idle'` | No execution has started, or `reset()` was called. |
| `'executing'` | A request is in progress. |
| `'success'` | The most recent execution completed successfully. |
| `'error'` | The most recent execution failed. |

### ActionError

A structured error object returned by failed actions.

```ts
interface ActionError {
  /** Machine-readable error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND'). */
  code: string
  /** Human-readable error message. */
  message: string
  /** Per-field error messages, keyed by field name or dot-separated path. */
  fieldErrors?: Record<string, string[]>
  /** HTTP status code. */
  statusCode: number
}
```

### ActionResult

A discriminated union representing the outcome of an action. Every `defineAction` handler returns this shape.

```ts
type ActionResult<TOutput>
  = | { success: true; data: TOutput }
    | { success: false; error: ActionError }
```

**Usage:**

```ts
const result: ActionResult<Todo> = await execute({ title: 'Buy milk' })

if (result.success) {
  console.log(result.data) // Todo
} else {
  console.error(result.error) // ActionError
}
```

---

## HTTP Methods

### HttpMethod

The supported HTTP methods for `useAction` and `useOptimisticAction`.

```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
```

---

## Middleware

### MiddlewareContext

The base context passed to middleware functions (without `next`).

```ts
interface MiddlewareContext<TCtx = Record<string, unknown>> {
  /** The H3 request event. */
  event: H3Event
  /** Accumulated context from previous middleware. */
  ctx: TCtx
}
```

### ActionMiddleware

The full middleware function type, including the `next` continuation.

```ts
type ActionMiddleware<
  TCtxIn = Record<string, unknown>,
  TCtxOut = TCtxIn,
> = (context: MiddlewareContext<TCtxIn> & {
  /**
   * Continue the middleware chain.
   * Optionally pass `{ ctx: { ... } }` to add properties to the context.
   * Must be called exactly once per middleware invocation.
   */
  next: <TNewCtx extends Record<string, unknown>>(
    opts?: { ctx: TNewCtx }
  ) => Promise<TNewCtx & TCtxIn>
}) => Promise<TCtxOut & TCtxIn>
```

**Type Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TCtxIn` | `Record<string, unknown>` | The context type this middleware expects from upstream. |
| `TCtxOut` | `TCtxIn` | The new context properties this middleware adds via `next({ ctx })`. |

**Usage:**

```ts
const authMiddleware: ActionMiddleware<
  Record<string, unknown>,  // expects nothing specific
  { user: User }            // adds user to ctx
> = async ({ event, next }) => {
  const user = await getUser(event)
  return next({ ctx: { user } })
}
```

---

## Handler

### ActionHandler

The type for the handler function inside `defineAction` and `createActionClient().action()`.

```ts
type ActionHandler<TInput, TOutput, TCtx = Record<string, unknown>> = (params: {
  /** Validated input data (or raw input if no schema is provided). */
  input: TInput
  /** The H3 request event. */
  event: H3Event
  /** Accumulated middleware context. */
  ctx: TCtx
}) => TOutput | Promise<TOutput>
```

**Type Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TInput` | -- | The validated input type (inferred from schema via `InferOutput`). |
| `TOutput` | -- | The handler return type. |
| `TCtx` | `Record<string, unknown>` | The middleware context type. |

---

## Metadata

### ActionMetadata

Arbitrary metadata attached to an action for logging, analytics, or authorization checks.

```ts
type ActionMetadata = Record<string, unknown>
```

---

## defineAction Options

### ActionOptions

The options object accepted by `defineAction()`.

```ts
interface ActionOptions<
  TInputSchema extends StandardSchemaV1,
  TOutput,
  TCtx = Record<string, unknown>,
  TOutputSchema extends StandardSchemaV1 | undefined = undefined,
> {
  /** Standard Schema for input validation. */
  input?: TInputSchema
  /** Standard Schema for output validation. */
  outputSchema?: TOutputSchema
  /** Array of middleware to run before the handler. */
  middleware?: ActionMiddleware[]
  /** Metadata for logging/analytics. */
  metadata?: ActionMetadata
  /** The action handler function. */
  handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>
}
```

---

## Builder Pattern

### ActionClient

The builder interface returned by `createActionClient()`. Each method returns a new immutable instance.

```ts
interface ActionClient<TCtx = Record<string, never>> {
  /**
   * Add middleware to the chain. Context type extends with each call.
   */
  use: <TNewCtx extends Record<string, unknown>>(
    middleware: ActionMiddleware<TCtx, TNewCtx>,
  ) => ActionClient<TCtx & TNewCtx>

  /**
   * Set the input validation schema. Transitions to ActionClientWithSchema.
   */
  schema: <TInputSchema extends StandardSchemaV1>(
    inputSchema: TInputSchema,
  ) => ActionClientWithSchema<TCtx, TInputSchema>

  /**
   * Attach metadata. Merged with any previously set metadata.
   */
  metadata: (meta: ActionMetadata) => ActionClient<TCtx>

  /**
   * Terminal method. Creates an H3 event handler. Input is untyped (unknown).
   */
  action: <TOutput>(
    handler: ActionHandler<unknown, TOutput, TCtx>,
  ) => EventHandler
}
```

### ActionClientWithSchema

The builder interface after `.schema()` is called. Provides access to `.outputSchema()`.

```ts
interface ActionClientWithSchema<TCtx, TInputSchema extends StandardSchemaV1> {
  /**
   * Set the output validation schema.
   */
  outputSchema: <TOutputSchema extends StandardSchemaV1>(
    schema: TOutputSchema,
  ) => ActionClientWithSchema<TCtx, TInputSchema>

  /**
   * Attach metadata. Merged with any previously set metadata.
   */
  metadata: (meta: ActionMetadata) => ActionClientWithSchema<TCtx, TInputSchema>

  /**
   * Terminal method. Creates an H3 event handler with typed input.
   */
  action: <TOutput>(
    handler: ActionHandler<InferOutput<TInputSchema>, TOutput, TCtx>,
  ) => EventHandler
}
```

---

## useAction Types

### UseActionOptions

Configuration options for the `useAction()` composable.

```ts
interface UseActionOptions<TInput, TOutput> {
  /** HTTP method for the request. Default: 'POST'. */
  method?: HttpMethod
  /** Static headers or a function returning headers (e.g. for auth tokens). */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Retry configuration. true = 3 retries, number = custom count, object = full config. */
  retry?: boolean | number | RetryConfig
  /** Request timeout in milliseconds. Aborts the request if exceeded. */
  timeout?: number
  /** Request deduplication strategy. 'cancel' aborts previous, 'defer' returns existing promise. */
  dedupe?: 'cancel' | 'defer'
  /** Debounce delay in ms. Last-call-wins. Takes priority over throttle. */
  debounce?: number
  /** Throttle interval in ms. First call immediate, trailing call fired. Ignored if debounce is set. */
  throttle?: number
  /** Called when the server returns a successful result. */
  onSuccess?: (data: TOutput) => void
  /** Called when the server returns an error or a fetch error occurs. */
  onError?: (error: ActionError) => void
  /** Called after every execution, regardless of outcome. Fires after onSuccess/onError. */
  onSettled?: (result: ActionResult<TOutput>) => void
  /** Called immediately when execute() is invoked, before the request starts. */
  onExecute?: (input: TInput) => void
}
```

### UseActionReturn

The return value of the `useAction()` composable.

```ts
interface UseActionReturn<TInput, TOutput> {
  /** Execute the action. Returns the full ActionResult (never throws). */
  execute: (input: TInput) => Promise<ActionResult<TOutput>>
  /** Execute the action. Returns data directly. Throws ActionError on failure. */
  executeAsync: (input: TInput) => Promise<TOutput>
  /** Reactive reference to the last successful response data. */
  data: Readonly<Ref<TOutput | null>>
  /** Reactive reference to the last error. */
  error: Readonly<Ref<ActionError | null>>
  /** Reactive reference to the current execution status. */
  status: Readonly<Ref<ActionStatus>>
  /** Computed: true when status is 'idle'. */
  isIdle: ComputedRef<boolean>
  /** Computed: true when status is 'executing'. */
  isExecuting: ComputedRef<boolean>
  /** Computed: true when status is 'success'. */
  hasSucceeded: ComputedRef<boolean>
  /** Computed: true when status is 'error'. */
  hasErrored: ComputedRef<boolean>
  /** Reset data, error, and status to initial values. Aborts any in-flight request. */
  reset: () => void
}
```

---

## useOptimisticAction Types

### UseOptimisticActionOptions

Configuration options for the `useOptimisticAction()` composable.

```ts
interface UseOptimisticActionOptions<TInput, TOutput> {
  /** HTTP method for the request. Default: 'POST'. */
  method?: HttpMethod
  /** Static headers or a function returning headers (e.g. for auth tokens). */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Retry configuration. true = 3 retries, number = custom count, object = full config. */
  retry?: boolean | number | RetryConfig
  /** Request timeout in milliseconds. Aborts the request if exceeded. */
  timeout?: number
  /** Debounce delay in ms. Last-call-wins. Takes priority over throttle. */
  debounce?: number
  /** Throttle interval in ms. First call immediate, trailing call fired. Ignored if debounce is set. */
  throttle?: number
  /** Reactive reference to the source-of-truth data. */
  currentData: Ref<TOutput> | ComputedRef<TOutput>
  /**
   * Pure function that computes the optimistic state.
   * Called synchronously with the input and current optimistic data value.
   * Must return a new object (never mutate currentData).
   * Note: When rapid calls are chained, receives the current optimistic value (not currentData).
   */
  updateFn: (input: TInput, currentData: TOutput) => TOutput
  /** Called when the server returns a successful result. */
  onSuccess?: (data: TOutput) => void
  /** Called when the server returns an error (after automatic rollback). */
  onError?: (error: ActionError) => void
  /** Called after every execution, regardless of outcome. */
  onSettled?: (result: ActionResult<TOutput>) => void
  /** Called after the optimistic update is applied, before the request starts. */
  onExecute?: (input: TInput) => void
}
```

### UseOptimisticActionReturn

The return value of the `useOptimisticAction()` composable.

```ts
interface UseOptimisticActionReturn<TInput, TOutput> {
  /** Execute the action with optimistic update. Returns the full ActionResult. */
  execute: (input: TInput) => Promise<ActionResult<TOutput>>
  /** Reactive optimistic state. Updated immediately, reconciled or rolled back after server response. */
  optimisticData: Readonly<Ref<TOutput>>
  /** Reactive reference to the server-confirmed response data. */
  data: Readonly<Ref<TOutput | null>>
  /** Reactive reference to the last error. */
  error: Readonly<Ref<ActionError | null>>
  /** Reactive reference to the current execution status. */
  status: Readonly<Ref<ActionStatus>>
  /** Computed: true when status is 'idle'. */
  isIdle: ComputedRef<boolean>
  /** Computed: true when status is 'executing'. */
  isExecuting: ComputedRef<boolean>
  /** Computed: true when status is 'success'. */
  hasSucceeded: ComputedRef<boolean>
  /** Computed: true when status is 'error'. */
  hasErrored: ComputedRef<boolean>
  /** Reset optimisticData to currentData, and data/error/status to initial values. */
  reset: () => void
}
```

---

## useStreamAction Types

### UseStreamActionOptions

Configuration options for the `useStreamAction()` composable.

```ts
interface UseStreamActionOptions<TChunk = unknown> {
  /** Static headers or a function returning headers (e.g. for auth tokens). */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Connection timeout in milliseconds. Aborts the stream if not established within this time. */
  timeout?: number
  /** Called for each data chunk received from the stream. */
  onChunk?: (chunk: TChunk) => void
  /** Called when the stream completes (receives all accumulated chunks). */
  onDone?: (allChunks: TChunk[]) => void
  /** Called when a stream error occurs. */
  onError?: (error: ActionError) => void
}
```

### UseStreamActionReturn

The return value of the `useStreamAction()` composable.

```ts
interface UseStreamActionReturn<TInput, TChunk> {
  /** Start the stream. Aborts any previous stream. */
  execute: (input: TInput) => Promise<void>
  /** Stop the current stream. */
  stop: () => void
  /** All chunks received so far. Uses shallowRef + triggerRef for O(1) reactivity. */
  chunks: Readonly<Ref<TChunk[]>>
  /** The most recently received chunk. */
  data: Readonly<Ref<TChunk | null>>
  /** Stream status: 'idle' | 'streaming' | 'done' | 'error'. */
  status: Readonly<Ref<StreamStatus>>
  /** The last error, if any. */
  error: Readonly<Ref<ActionError | null>>
}
```

### StreamStatus

```ts
type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'
```

---

## useActionQuery Types

### UseActionQueryOptions

Configuration options for the `useActionQuery()` composable.

```ts
interface UseActionQueryOptions {
  /** Run on SSR. Default: true */
  server?: boolean
  /** Don't block navigation. Default: false */
  lazy?: boolean
  /** Execute immediately. Default: true */
  immediate?: boolean
  /** Default value factory when data is null */
  default?: () => unknown
}
```

### UseActionQueryReturn

The return value of the `useActionQuery()` composable.

```ts
interface UseActionQueryReturn<TOutput> {
  /** Unwrapped data (extracted from ActionResult). */
  data: ComputedRef<TOutput | null>
  /** Error from failed ActionResult. */
  error: ComputedRef<ActionError | null>
  /** Status from Nuxt's useAsyncData. */
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
  /** True while the request is in flight. */
  pending: Ref<boolean>
  /** Manually re-fetch data. */
  refresh: () => Promise<void>
  /** Clear cached data. */
  clear: () => void
}
```

---

## useFormAction Types

### UseFormActionOptions

Configuration options for the `useFormAction()` composable. Extends `UseActionOptions` (excluding `onExecute`).

```ts
interface UseFormActionOptions<TInput, TOutput> {
  /** Starting values for all form fields. Deep-cloned internally. */
  initialValues: TInput
  /** HTTP method for the request. Default: 'POST'. */
  method?: HttpMethod
  /** Static headers or a function returning headers. */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Retry configuration. */
  retry?: boolean | number | RetryConfig
  /** Request timeout in milliseconds. */
  timeout?: number
  /** Request deduplication strategy. */
  dedupe?: 'cancel' | 'defer'
  /** Called on successful submission. */
  onSuccess?: (data: TOutput) => void
  /** Called on error. */
  onError?: (error: ActionError) => void
  /** Called after every submission, regardless of outcome. */
  onSettled?: (result: ActionResult<TOutput>) => void
}
```

### UseFormActionReturn

The return value of the `useFormAction()` composable.

```ts
interface UseFormActionReturn<TInput, TOutput> {
  /** Reactive form fields — use directly with v-model. */
  fields: TInput
  /** Submit the form (sends current field values to the action). */
  submit: () => Promise<ActionResult<TOutput>>
  /** Field-level validation errors from VALIDATION_ERROR responses. */
  fieldErrors: ComputedRef<Record<string, string[]>>
  /** Whether any field has been modified from initial values. */
  isDirty: ComputedRef<boolean>
  /** Whether a submission is currently in flight. */
  isSubmitting: ComputedRef<boolean>
  /** Reset fields to initial values and clear errors. */
  reset: () => void
  /** Reactive reference to the last successful response data. */
  data: Readonly<Ref<TOutput | null>>
  /** Reactive reference to the last error. */
  error: Readonly<Ref<ActionError | null>>
  /** Current execution status. */
  status: Readonly<Ref<ActionStatus>>
}
```

---

## Retry Types

### RetryConfig

Full retry configuration object.

```ts
interface RetryConfig {
  /** Number of retry attempts. Default: 3 */
  count?: number
  /** Delay between retries in milliseconds. Default: 500 */
  delay?: number
  /** HTTP status codes to retry on. Default: [408, 409, 425, 429, 500, 502, 503, 504] */
  statusCodes?: number[]
}
```

---

## Import Paths

All types are defined in `src/runtime/types.ts`. In most cases you do not need to import them manually because the module auto-imports the runtime functions. When explicit type imports are needed:

```ts
import type {
  ActionError,
  ActionResult,
  ActionStatus,
  HttpMethod,
  ActionMiddleware,
  MiddlewareContext,
  ActionHandler,
  ActionMetadata,
  ActionClient,
  ActionClientWithSchema,
  RetryConfig,
  UseActionOptions,
  UseActionReturn,
  UseOptimisticActionOptions,
  UseOptimisticActionReturn,
  UseFormActionOptions,
  UseFormActionReturn,
  UseStreamActionOptions,
  UseStreamActionReturn,
  StreamStatus,
  UseActionQueryOptions,
  UseActionQueryReturn,
  TypedActionReference,
  InferActionInput,
  InferActionOutput,
  StandardSchemaV1,
  InferInput,
  InferOutput,
} from 'nuxt-actions/runtime/types'
```

## See Also

- [defineAction](/api/define-action) -- Server action definition
- [createActionClient](/api/create-action-client) -- Builder pattern
- [defineMiddleware](/api/define-middleware) -- Middleware creation
- [createActionError](/api/create-action-error) -- Error creation
- [useAction](/api/use-action) -- Client composable
- [useFormAction](/api/use-form-action) -- Form integration composable
- [useOptimisticAction](/api/use-optimistic-action) -- Optimistic updates composable
- [useStreamAction](/api/use-stream-action) -- Streaming composable
- [useActionQuery](/api/use-action-query) -- SSR query composable
- [Cache Invalidation](/api/invalidate-actions) -- Refetch or clear query caches
