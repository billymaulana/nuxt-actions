import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { describe, it, expect } from 'vitest'
import { createEvent as createH3Event, readBody as readH3Body } from 'h3'
import { readBody as readPortableBody } from '../../src/runtime/server/internal/portable'
import type { ServerEvent } from '../../src/runtime/server/internal/portable'

function h3Event(contentType: string | undefined, body: string) {
  const req = new IncomingMessage(new Socket())
  req.method = 'POST'
  req.url = '/api/_actions/demo'
  req.headers = { 'content-length': String(Buffer.byteLength(body)) }
  if (contentType) req.headers['content-type'] = contentType
  req.push(body)
  req.push(null)
  return createH3Event(req, new ServerResponse(req))
}

function portableEvent(contentType: string | undefined, body: string): ServerEvent {
  const url = new URL('http://localhost/api/_actions/demo')
  const headers = new Headers()
  if (contentType) headers.set('content-type', contentType)
  return {
    req: new Request(url, { method: 'POST', headers, body: body ? new TextEncoder().encode(body) : undefined }),
    url,
    res: { status: 200, statusText: '', headers: new Headers() },
    context: {},
  } as unknown as ServerEvent
}

async function outcome(read: Promise<unknown>) {
  try {
    return { value: await read }
  }
  catch {
    return { rejected: true }
  }
}

describe('readBody parity with h3 v1', () => {
  const cases: Array<[string | undefined, string]> = [
    ['text/plain', '{"a":1}'],
    ['text/csv', 'a,b'],
    ['application/json', '{"a":1}'],
    ['application/json', '{bad'],
    ['application/json', '{"__proto__":{"polluted":true},"a":1}'],
    ['application/json', ''],
    ['application/json; charset=utf-8', '{"a":1}'],
    ['application/json; charset=utf-8', '{bad'],
    ['application/json; charset=utf-8', '{"__proto__":{"polluted":true},"a":1}'],
    [undefined, 'hello'],
    [undefined, '{"a":1}'],
    ['application/xml', '<a/>'],
    ['application/x-www-form-urlencoded', 'a=1&a=2&b=3'],
    ['application/x-www-form-urlencoded', 'a=1&a=2&a=3'],
    ['application/x-www-form-urlencoded', ''],
  ]

  it.each(cases)('content type %s with body %s', async (contentType, body) => {
    const expected = await outcome(readH3Body(h3Event(contentType, body)))
    const actual = await outcome(readPortableBody(portableEvent(contentType, body)))
    expect(actual).toEqual(expected)
  })
})

describe('server runtime parity', () => {
  it('nitro2 and portable runtimes export the same runtime names', async () => {
    const nitro2 = await import('../../src/runtime/server/internal/nitro2')
    const portable = await import('../../src/runtime/server/internal/portable')

    expect(Object.keys(portable).sort()).toEqual(Object.keys(nitro2).sort())
  })

  it('every runtime export resolves to a function in both runtimes', async () => {
    const runtimes = {
      nitro2: await import('../../src/runtime/server/internal/nitro2'),
      portable: await import('../../src/runtime/server/internal/portable'),
    }

    for (const [runtime, exports] of Object.entries(runtimes)) {
      const nonFunctions = Object.entries(exports)
        .filter(([, value]) => typeof value !== 'function')
        .map(([name]) => `${runtime}.${name}`)
      expect(nonFunctions).toEqual([])
      expect(Object.keys(exports).length).toBeGreaterThan(0)
    }
  })
})
