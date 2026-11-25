import type { UploadProgress } from '../types'

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

/** Upload progress needs XMLHttpRequest, which only the browser has. */
export function canTrackUploads(): boolean {
  return !import.meta.server && typeof XMLHttpRequest === 'function'
}

/**
 * A fetch built on XMLHttpRequest, so ofetch can be given one that reports
 * upload progress while keeping its own baseURL, headers, retry, abort, and
 * response parsing.
 */
export function createProgressFetch(onProgress: (progress: UploadProgress) => void): typeof fetch {
  return (input, init = {}) => new Promise<Response>((resolve, reject) => {
    const { signal } = init
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }

    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    xhr.open(init.method ?? 'GET', String(input instanceof Request ? input.url : input))
    xhr.responseType = 'blob'
    xhr.withCredentials = init.credentials === 'include'
    new Headers(init.headers).forEach((value, name) => {
      xhr.setRequestHeader(name, value)
    })

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : null
      onProgress({ loaded: event.loaded, total, percent: total ? Math.round((event.loaded / total) * 100) : null })
    }
    xhr.onload = () => {
      try {
        resolve(new Response(NULL_BODY_STATUSES.has(xhr.status) ? null : xhr.response, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
        }))
      }
      catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new TypeError('Network request failed'))
    xhr.ontimeout = () => reject(new TypeError('Network request timed out'))
    xhr.onabort = () => reject(signal?.reason)
    xhr.onloadend = () => signal?.removeEventListener('abort', abort)

    signal?.addEventListener('abort', abort, { once: true })
    xhr.send((init.body ?? null) as XMLHttpRequestBodyInit | null)
  })
}

function parseResponseHeaders(raw: string): Headers {
  const headers = new Headers()
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator > 0) {
      headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
    }
  }
  return headers
}
