import { destr } from 'destr'
import type { RequestEvent } from 'nuxt/server'

export type ServerEvent = RequestEvent

export interface MultiPartData {
  name?: string
  filename?: string
  type?: string
  data: Buffer
}

export {
  defineEventHandler,
  getCookie,
  getQuery,
  getRequestHeader as getHeader,
  getRequestIP,
  setCookie,
} from 'nuxt/server'

export function setHeader(event: ServerEvent, name: string, value: string): void {
  event.res.headers.set(name, value)
}

/** Parses the body with the same media type rules as h3 v1's readBody, so both runtimes agree. */
export async function readBody(event: ServerEvent): Promise<unknown> {
  const contentType = event.req.headers.get('content-type') ?? ''
  const text = await event.req.text()

  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    return parseUrlEncoded(text)
  }
  if (!text) return undefined
  if (contentType.startsWith('text/')) return text

  return destr(text, { strict: contentType === 'application/json' })
}

function parseUrlEncoded(text: string): Record<string, string | string[]> {
  const form: Record<string, string | string[]> = Object.create(null)
  for (const [key, value] of new URLSearchParams(text)) {
    const existing = form[key]
    if (existing === undefined) form[key] = value
    else form[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
  }
  return form
}

export function getRequestMethod(event: ServerEvent): string {
  return event.req.method
}

export function getRequestPath(event: ServerEvent): string {
  return event.url.pathname
}

export async function readMultipartFormData(event: ServerEvent): Promise<MultiPartData[]> {
  const form = await event.req.formData()
  const parts: MultiPartData[] = []
  for (const [name, value] of form.entries()) {
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

const EVENT_STREAM_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream',
  'cache-control': 'private, no-cache, no-store, no-transform, must-revalidate, max-age=0',
  'x-accel-buffering': 'no',
}

const EVENT_STREAM_HIGH_WATER_MARK = 64 * 1024
const LINE_BREAK = /\r\n|\r|\n/
const encoder = new TextEncoder()

function formatEventStreamMessage(data: string): string {
  return `${data.split(LINE_BREAK).map(line => `data: ${line}`).join('\n')}\n\n`
}

class PortableEventStream {
  readonly #event: ServerEvent
  readonly #body: ReadableStream<Uint8Array>
  #controller!: ReadableStreamDefaultController<Uint8Array>
  #sent = false
  #closed = false
  #waiting: Array<() => void> = []
  #closedCallbacks: Array<() => void> = []

  constructor(event: ServerEvent) {
    this.#event = event
    this.#body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#controller = controller
      },
      pull: () => this.#resume(),
      cancel: () => this.#finish(),
    }, new ByteLengthQueuingStrategy({ highWaterMark: EVENT_STREAM_HIGH_WATER_MARK }))

    const signal = event.req.signal
    if (signal.aborted) {
      this.#end()
    }
    else {
      signal.addEventListener('abort', () => this.#end(), { once: true })
    }
  }

  async push(data: string): Promise<void> {
    if (this.#closed) return
    this.#controller.enqueue(encoder.encode(formatEventStreamMessage(data)))
    const desiredSize = this.#controller.desiredSize
    if (this.#sent && desiredSize !== null && desiredSize <= 0) {
      await new Promise<void>(resolve => this.#waiting.push(resolve))
    }
  }

  async close(): Promise<void> {
    this.#end()
  }

  onClosed(callback: () => void): void {
    if (this.#closed) {
      queueMicrotask(callback)
      return
    }
    this.#closedCallbacks.push(callback)
  }

  send(): ReadableStream<Uint8Array> {
    this.#sent = true
    this.#event.res.status = 200
    for (const [name, value] of Object.entries(EVENT_STREAM_HEADERS)) {
      this.#event.res.headers.set(name, value)
    }
    return this.#body
  }

  #end(): void {
    if (this.#closed) return
    this.#controller.close()
    this.#finish()
  }

  #resume(): void {
    const waiting = this.#waiting
    this.#waiting = []
    for (const resolve of waiting) resolve()
  }

  #finish(): void {
    this.#closed = true
    this.#resume()
    const callbacks = this.#closedCallbacks
    this.#closedCallbacks = []
    for (const callback of callbacks) callback()
  }
}

export type { PortableEventStream as EventStream }

export function createEventStream(event: ServerEvent): PortableEventStream {
  return new PortableEventStream(event)
}
