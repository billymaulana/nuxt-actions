import type { EventStream, H3Event, MultiPartData } from 'h3'
import {
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

export type ServerEvent = H3Event

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
  type EventStream,
  type MultiPartData,
}
