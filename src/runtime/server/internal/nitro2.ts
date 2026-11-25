import { setHeader as setH3Header } from 'h3'
import type { H3Event } from 'h3'

export type ServerEvent = H3Event

export type { EventStream, MultiPartData } from 'h3'

export {
  createEventStream,
  defineEventHandler,
  getCookie,
  getHeader,
  getQuery,
  getRequestHost,
  getRequestIP,
  readBody,
  readMultipartFormData,
  setCookie,
} from 'h3'

export function setHeader(event: ServerEvent, name: string, value: string): void {
  setH3Header(event, name, value)
}

export function getRequestMethod(event: ServerEvent): string {
  return event.method
}

export function getRequestPath(event: ServerEvent): string {
  const queryStart = event.path.indexOf('?')
  return queryStart === -1 ? event.path : event.path.slice(0, queryStart)
}
