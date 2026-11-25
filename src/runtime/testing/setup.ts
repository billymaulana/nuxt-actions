import * as actionCacheUtils from '../server/utils/actionCache'
import * as authMiddlewareUtils from '../server/utils/authMiddleware'
import * as callActionUtils from '../server/utils/callAction'
import * as createActionClientUtils from '../server/utils/createActionClient'
import * as csrfMiddlewareUtils from '../server/utils/csrfMiddleware'
import * as defineActionUtils from '../server/utils/defineAction'
import * as defineMiddlewareUtils from '../server/utils/defineMiddleware'
import * as defineStreamActionUtils from '../server/utils/defineStreamAction'
import * as idempotencyUtils from '../server/utils/idempotency'
import * as openapiUtils from '../server/utils/openapi'
import * as originMiddlewareUtils from '../server/utils/originMiddleware'
import * as rateLimitMiddlewareUtils from '../server/utils/rateLimitMiddleware'
import * as returnValidationErrorsUtils from '../server/utils/returnValidationErrors'
import {
  createError,
  deleteCookie,
  getCookie,
  getHeader,
  getHeaders,
  getQuery,
  getRequestHeader,
  getRequestHeaders,
  getRequestHost,
  getRequestIP,
  getRequestURL,
  parseCookies,
  readBody,
  setCookie,
  setHeader,
  setResponseHeader,
  setResponseStatus,
} from './runtime'

Object.assign(
  globalThis,
  actionCacheUtils,
  authMiddlewareUtils,
  callActionUtils,
  createActionClientUtils,
  csrfMiddlewareUtils,
  defineActionUtils,
  defineMiddlewareUtils,
  defineStreamActionUtils,
  idempotencyUtils,
  openapiUtils,
  originMiddlewareUtils,
  rateLimitMiddlewareUtils,
  returnValidationErrorsUtils,
  {
    createError,
    deleteCookie,
    getCookie,
    getHeader,
    getHeaders,
    getQuery,
    getRequestHeader,
    getRequestHeaders,
    getRequestHost,
    getRequestIP,
    getRequestURL,
    parseCookies,
    readBody,
    setCookie,
    setHeader,
    setResponseHeader,
    setResponseStatus,
  },
)
