import type { RequestEvent } from 'nuxt/server'
import {
  getCookie,
  getQuery,
  getRequestHeader,
  getRequestIP,
  readBody,
  setCookie,
} from 'nuxt/server'

export type ServerEvent = RequestEvent

export {
  getCookie,
  getRequestHeader as getHeader,
  getQuery,
  getRequestIP,
  readBody,
  setCookie,
}

export function setHeader<const T extends string>(
  event: ServerEvent,
  name: T,
  value: string,
) {
  event.res.headers.set(name, value.toLowerCase())
}

export interface MultiPartData {
  data: Buffer
  name?: string
  filename?: string
  type?: string
}

export async function readMultipartFormData(
  event: ServerEvent,
): Promise<MultiPartData[] | undefined> {
  const formData = await event.req.formData()
  const multiPartData: MultiPartData[] = []

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer()

      multiPartData.push({
        filename: value.name,
        name: key,
        type: value.type,
        data: Buffer.from(arrayBuffer),
      })
    }
    else if (typeof value === 'string') {
      multiPartData.push({
        name: key,
        data: Buffer.from(value, 'utf8'),
      })
    }
  }

  return multiPartData.length > 0 ? multiPartData : undefined
}

interface EventStreamMessage {
  id?: string
  event?: string
  data: string
  retry?: number
}

class EventStream {
  #ctrl?: ReadableStreamDefaultController<Uint8Array>
  #enc = new TextEncoder()
  #closed = false
  #onClosedCbs: (() => void)[] = []
  #stream: ReadableStream<Uint8Array>

  constructor(event: RequestEvent) {
    event.res.headers.set('content-type', 'text/event-stream')
    event.res.headers.set('cache-control', 'no-cache')
    event.res.headers.set('connection', 'keep-alive')

    this.#stream = new ReadableStream({
      start: c => (this.#ctrl = c),
      cancel: () => this.#cleanup(),
    })

    event.req.signal?.addEventListener('abort', () => this.#cleanup(), {
      once: true,
    })
  }

  #cleanup = () => {
    if (this.#closed) return
    this.#closed = true
    this.#onClosedCbs.forEach((cb) => {
      return cb()
    })
  }

  push = async (msg: string | EventStreamMessage) => {
    if (this.#closed || !this.#ctrl) return
    const m = typeof msg === 'string' ? { data: msg } : msg
    const frame = [
      m.id && `id: ${m.id}`,
      m.event && `event: ${m.event}`,
      m.retry && `retry: ${m.retry}`,
      ...m.data.split('\n').map(line => `data: ${line}`),
    ]
      .filter(Boolean)
      .join('\n')

    this.#ctrl.enqueue(this.#enc.encode(`${frame}\n\n`))
  }

  onClosed = (cb: () => void) => this.#onClosedCbs.push(cb)

  close = async () => {
    if (!this.#closed) {
      this.#ctrl?.close()
      this.#cleanup()
    }
  }

  send = () => this.#stream
}

export type { EventStream }

export function createEventStream(event: ServerEvent): EventStream {
  return new EventStream(event)
}
