const STATE: unique symbol = Symbol.for('nuxt-actions.test-event')

export interface TestEventOptions {
  /** Request method. Default: 'POST' */
  method?: string
  /** Request path with an optional query string. Default: '/' */
  url?: string
  headers?: Record<string, string>
  cookies?: Record<string, string>
  /** Query parameters, merged over those in `url`. */
  query?: Record<string, string | string[]>
  /** What readBody returns. A FormData body is read as multipart form data. */
  body?: unknown
  /** Client IP address. Default: '127.0.0.1' */
  ip?: string
  /** `event.context`, for values server middleware would set, such as the signed-in user. */
  context?: Record<string, unknown>
}

/** An in-memory request event that the nuxt-actions server utils and the common h3 helpers accept. */
export interface TestEvent {
  readonly method: string
  readonly path: string
  readonly headers: Headers
  readonly context: Record<string, unknown>
  waitUntil: (promise: Promise<unknown>) => void
}

export interface TestResponse {
  status: number
  statusText?: string
  headers: Record<string, string>
  /** Cookies the action set, by name. A deleted cookie has an empty value. */
  cookies: Record<string, string>
}

export interface MultiPartData {
  name?: string
  filename?: string
  type?: string
  data: Buffer
}

export type ServerEvent = TestEvent

interface TestEventState {
  headers: Headers
  query: Record<string, string | string[]>
  cookies: Record<string, string>
  body: unknown
  ip: string
  response: { status: number, statusText?: string, headers: Record<string, string>, cookies: Record<string, string> }
  pending: Promise<unknown>[]
}

type InternalTestEvent = TestEvent & { [STATE]: TestEventState }

/** Create a test event, for running an action handler, a middleware, or a util directly. */
export function createTestEvent(options: TestEventOptions = {}): TestEvent {
  const url = options.url ?? '/'
  const headers = new Headers(options.headers)
  if (options.body instanceof FormData && !headers.has('content-type')) {
    headers.set('content-type', 'multipart/form-data; boundary=nuxt-actions-test')
  }
  const cookies = { ...parseCookieHeader(headers.get('cookie')), ...options.cookies }
  if (Object.keys(cookies).length > 0) {
    headers.set('cookie', Object.entries(cookies).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; '))
  }

  const state: TestEventState = {
    headers,
    query: { ...parseQuery(url), ...options.query },
    cookies,
    body: options.body,
    ip: options.ip ?? '127.0.0.1',
    response: { status: 200, headers: {}, cookies: {} },
    pending: [],
  }
  const event: InternalTestEvent = {
    method: (options.method ?? 'POST').toUpperCase(),
    path: url,
    headers,
    context: options.context ?? {},
    waitUntil: (promise) => {
      state.pending.push(promise)
    },
    [STATE]: state,
  }
  return event
}

/** The status, headers, and cookies set on a test event so far. */
export function getTestResponse(event: TestEvent): TestResponse {
  const { response } = stateOf(event)
  return {
    status: response.status,
    statusText: response.statusText,
    headers: { ...response.headers },
    cookies: { ...response.cookies },
  }
}

/** Wait for the work handed to `event.waitUntil`, including work it hands on. */
export async function settleTestEvent(event: TestEvent): Promise<void> {
  const { pending } = stateOf(event)
  while (pending.length > 0) {
    await Promise.allSettled(pending.splice(0))
  }
}

function stateOf(event: TestEvent): TestEventState {
  const state = (event as Partial<InternalTestEvent> | null)?.[STATE]
  if (!state) {
    throw new TypeError('[nuxt-actions] Expected an event made by createTestEvent.')
  }
  return state
}

function parseCookieHeader(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = Object.create(null)
  for (const pair of header?.split(';') ?? []) {
    const separator = pair.indexOf('=')
    const name = separator > 0 ? pair.slice(0, separator).trim() : ''
    if (name) cookies[name] = decode(pair.slice(separator + 1).trim())
  }
  return cookies
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

function parseQuery(url: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = Object.create(null)
  const start = url.indexOf('?')
  if (start === -1) return query
  for (const [key, value] of new URLSearchParams(url.slice(start + 1))) {
    const existing = query[key]
    if (existing === undefined) query[key] = value
    else query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
  }
  return query
}

export function defineEventHandler<T>(handler: T): T {
  return handler
}

export function getRequestMethod(event: TestEvent): string {
  stateOf(event)
  return event.method
}

export function getRequestPath(event: TestEvent): string {
  stateOf(event)
  const start = event.path.indexOf('?')
  return start === -1 ? event.path : event.path.slice(0, start)
}

export function getHeader(event: TestEvent, name: string): string | undefined {
  return stateOf(event).headers.get(name) ?? undefined
}

export function getHeaders(event: TestEvent): Record<string, string> {
  return Object.fromEntries(stateOf(event).headers)
}

export { getHeader as getRequestHeader, getHeaders as getRequestHeaders }

export function getCookie(event: TestEvent, name: string): string | undefined {
  return stateOf(event).cookies[name]
}

export function parseCookies(event: TestEvent): Record<string, string> {
  return { ...stateOf(event).cookies }
}

export function getQuery(event: TestEvent): Record<string, string | string[]> {
  return { ...stateOf(event).query }
}

export async function readBody(event: TestEvent): Promise<unknown> {
  return stateOf(event).body
}

export async function readMultipartFormData(event: TestEvent): Promise<MultiPartData[] | undefined> {
  const { body } = stateOf(event)
  if (!(body instanceof FormData)) return undefined

  const parts: MultiPartData[] = []
  for (const [name, value] of body.entries()) {
    if (typeof value === 'string') {
      parts.push({ name, data: Buffer.from(value, 'utf-8') })
      continue
    }
    parts.push({
      name,
      filename: value.name,
      type: value.type || undefined,
      data: Buffer.from(await value.arrayBuffer()),
    })
  }
  return parts
}

export function getRequestIP(event: TestEvent, options: { xForwardedFor?: boolean } = {}): string | undefined {
  const state = stateOf(event)
  const forwarded = options.xForwardedFor ? firstListItem(state.headers.get('x-forwarded-for') ?? '') : ''
  return forwarded || state.ip
}

function firstListItem(value: string): string {
  const comma = value.indexOf(',')
  return (comma === -1 ? value : value.slice(0, comma)).trim()
}

export function getRequestHost(event: TestEvent, options: { xForwardedHost?: boolean } = {}): string {
  const { headers } = stateOf(event)
  const forwarded = options.xForwardedHost ? headers.get('x-forwarded-host') : undefined
  return forwarded || headers.get('host') || 'localhost'
}

export function getRequestURL(event: TestEvent, options: { xForwardedHost?: boolean, xForwardedProto?: boolean } = {}): URL {
  const { headers } = stateOf(event)
  const secure = options.xForwardedProto !== false && headers.get('x-forwarded-proto') === 'https'
  return new URL(event.path, `${secure ? 'https' : 'http'}://${getRequestHost(event, options)}`)
}

export function setHeader(event: TestEvent, name: string, value: string | number | readonly string[]): void {
  stateOf(event).response.headers[name.toLowerCase()] = typeof value === 'object' ? value.join(', ') : String(value)
}

export { setHeader as setResponseHeader }

export function setResponseStatus(event: TestEvent, code?: number, text?: string): void {
  const { response } = stateOf(event)
  if (code) response.status = code
  if (text) response.statusText = text
}

export function setCookie(event: TestEvent, name: string, value: string, _options?: Record<string, unknown>): void {
  stateOf(event).response.cookies[name] = value
}

export function deleteCookie(event: TestEvent, name: string, _options?: Record<string, unknown>): void {
  stateOf(event).response.cookies[name] = ''
}

interface TestErrorInput {
  statusCode?: number
  status?: number
  statusMessage?: string
  statusText?: string
  message?: string
  data?: unknown
  cause?: unknown
}

/** Like h3's createError: an Error with a status code, which defineAction reports as a SERVER_ERROR with that status. */
export function createError(input: string | TestErrorInput): Error & { statusCode: number, statusMessage?: string, data?: unknown } {
  const options = typeof input === 'string' ? { message: input } as TestErrorInput : input
  const statusMessage = options.statusMessage ?? options.statusText
  const error = new Error(options.message ?? statusMessage ?? '', { cause: options.cause })
  return Object.assign(error, {
    statusCode: options.statusCode ?? options.status ?? 500,
    statusMessage,
    data: options.data,
  })
}

class TestEventStream {
  readonly messages: string[] = []
  readonly #event: TestEvent
  #closed = false
  #closedCallbacks: Array<() => void> = []

  constructor(event: TestEvent) {
    stateOf(event)
    this.#event = event
  }

  async push(data: string): Promise<void> {
    if (!this.#closed) this.messages.push(data)
  }

  async close(): Promise<void> {
    this.#closed = true
    for (const callback of this.#closedCallbacks.splice(0)) callback()
  }

  onClosed(callback: () => void): void {
    if (this.#closed) queueMicrotask(callback)
    else this.#closedCallbacks.push(callback)
  }

  send(): this {
    setHeader(this.#event, 'content-type', 'text/event-stream')
    return this
  }
}

export type { TestEventStream as EventStream }

/** An event stream that records the messages pushed to it in `messages`. */
export function createEventStream(event: TestEvent): TestEventStream {
  return new TestEventStream(event)
}
