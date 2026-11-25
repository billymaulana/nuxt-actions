import type { H3Event } from 'h3'

export type ServerEvent = H3Event

export type { EventStream, MultiPartData } from 'h3'

export {
  createEventStream,
  defineEventHandler,
  getCookie,
  getHeader,
  getQuery,
  getRequestIP,
  readBody,
  readMultipartFormData,
  setCookie,
  setHeader,
} from 'h3'

export function getRequestMethod(event: ServerEvent): string {
  return event.method
}

export function getRequestPath(event: ServerEvent): string {
  const queryStart = event.path.indexOf('?')
  return queryStart === -1 ? event.path : event.path.slice(0, queryStart)
}
