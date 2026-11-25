type Handler = (() => void) | null

/** A scripted XMLHttpRequest: tests drive progress, responses, and failures by hand. */
export class FakeXHR {
  static instances: FakeXHR[] = []

  static get last(): FakeXHR | undefined {
    return FakeXHR.instances.at(-1)
  }

  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = undefined
  sent = false
  aborted = false
  withCredentials = false
  responseType = ''
  status = 0
  statusText = ''
  response: unknown = null
  responseHeaders = ''
  upload: { onprogress: ((event: { loaded: number, total: number, lengthComputable: boolean }) => void) | null } = { onprogress: null }
  onload: Handler = null
  onerror: Handler = null
  ontimeout: Handler = null
  onabort: Handler = null
  onloadend: Handler = null

  constructor() {
    FakeXHR.instances.push(this)
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }

  send(body: unknown): void {
    this.body = body
    this.sent = true
  }

  abort(): void {
    this.aborted = true
    this.onabort?.()
    this.onloadend?.()
  }

  getAllResponseHeaders(): string {
    return this.responseHeaders
  }

  progress(loaded: number, total: number, lengthComputable = true): void {
    this.upload.onprogress?.({ loaded, total, lengthComputable })
  }

  respond(status: number, body: string, headers = '', statusText = ''): void {
    this.status = status
    this.statusText = statusText
    this.response = new Blob([body])
    this.responseHeaders = headers
    this.onload?.()
    this.onloadend?.()
  }

  fail(): void {
    this.onerror?.()
    this.onloadend?.()
  }

  timeOut(): void {
    this.ontimeout?.()
    this.onloadend?.()
  }
}
