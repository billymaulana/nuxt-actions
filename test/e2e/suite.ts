import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

export type E2EFixture = 'basic' | 'nitro-v3' | 'nitro-v3-strict' | 'nuxt5-preview'

export function defineActionsE2ESuite(fixture: E2EFixture): void {
  describe(`nuxt-actions (${fixture})`, async () => {
    await setup({
      rootDir: fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url)),
      setupTimeout: 600000,
    })

    // ── Page rendering ────────────────────────────────────────────

    it('renders the page', async () => {
      const html = await $fetch('/')
      expect(html).toContain('nuxt-actions test')
    })

    // ── Input validation ──────────────────────────────────────────

    describe('input validation', () => {
      it('validates input and returns data on success', async () => {
        const result = await $fetch('/api/echo', {
          method: 'POST',
          body: { message: 'hello' },
        })
        expect(result).toEqual({
          success: true,
          data: { echo: 'hello' },
        })
      })

      it('returns validation error on invalid input', async () => {
        const result = await $fetch('/api/echo', {
          method: 'POST',
          body: { message: '' },
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
        expect(result.error.message).toBe('Input validation failed')
        expect(result.error.statusCode).toBe(422)
        expect(result.error.fieldErrors).toBeDefined()
        expect(result.error.fieldErrors.message).toContain('Too small: expected string to have >=1 characters')
      })

      it('returns validation error on missing input', async () => {
        const result = await $fetch('/api/echo', {
          method: 'POST',
          body: {},
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
        expect(result.error.fieldErrors.message).toBeDefined()
      })

      it('returns validation error with multiple field errors', async () => {
        const result = await $fetch('/api/echo', {
          method: 'POST',
          body: { notAField: true },
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
      })
    })

    // ── No input schema ───────────────────────────────────────────

    describe('action without input schema', () => {
      it('succeeds without input validation', async () => {
        const result = await $fetch('/api/no-input', {
          method: 'POST',
          body: {},
        })
        expect(result).toEqual({
          success: true,
          data: { message: 'no input required' },
        })
      })

      it('succeeds with any body when no schema defined', async () => {
        const result = await $fetch('/api/no-input', {
          method: 'POST',
          body: { random: 'data', extra: 123 },
        })
        expect(result.success).toBe(true)
        expect(result.data.message).toBe('no input required')
      })
    })

    // ── GET method ────────────────────────────────────────────────

    describe('GET method actions', () => {
      it('parses query parameters for GET requests', async () => {
        const result = await $fetch('/api/items?limit=3')
        expect(result.success).toBe(true)
        expect(result.data.items).toHaveLength(3)
        expect(result.data.total).toBe(3)
      })

      it('uses default values when query params are missing', async () => {
        const result = await $fetch('/api/items')
        expect(result.success).toBe(true)
        expect(result.data.items).toHaveLength(5) // default limit = 5
        expect(result.data.total).toBe(5)
      })

      it('coerces query param types correctly', async () => {
        const result = await $fetch('/api/items?limit=2')
        expect(result.success).toBe(true)
        expect(result.data.items).toHaveLength(2)
        expect(result.data.items[0]).toEqual({ id: 1, name: 'Item 1' })
        expect(result.data.items[1]).toEqual({ id: 2, name: 'Item 2' })
      })
    })

    // ── PUT method ────────────────────────────────────────────────

    describe('PUT method actions', () => {
      it('handles PUT requests with body', async () => {
        const result = await $fetch('/api/update', {
          method: 'PUT',
          body: { id: 42, name: 'Updated' },
        })
        expect(result).toEqual({
          success: true,
          data: { id: 42, name: 'Updated', updated: true },
        })
      })

      it('validates PUT request body', async () => {
        const result = await $fetch('/api/update', {
          method: 'PUT',
          body: { id: 42, name: '' },
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
      })
    })

    // ── Middleware ─────────────────────────────────────────────────

    describe('middleware', () => {
      it('runs middleware chain and passes context to handler', async () => {
        const result = await $fetch('/api/with-middleware', {
          method: 'POST',
          body: { data: 'test' },
        })
        expect(result.success).toBe(true)
        expect(result.data.data).toBe('test')
        expect(result.data.requestId).toBe('req-123')
        expect(result.data.timestamp).toBe(1000)
      })

      it('returns error when middleware throws ActionError', async () => {
        const result = await $fetch('/api/middleware-error', {
          method: 'POST',
          body: {},
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('UNAUTHORIZED')
        expect(result.error.message).toBe('Authentication required')
        expect(result.error.statusCode).toBe(401)
      })
    })

    // ── createActionError ─────────────────────────────────────────

    describe('createActionError', () => {
      it('returns ActionError with custom code and message', async () => {
        const result = await $fetch('/api/action-error', {
          method: 'POST',
          body: {},
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('NOT_FOUND')
        expect(result.error.message).toBe('Resource not found')
        expect(result.error.statusCode).toBe(404)
      })

      it('uses default statusCode 400 when not specified', async () => {
        const result = await $fetch('/api/action-error-default', {
          method: 'POST',
          body: {},
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('BAD_REQUEST')
        expect(result.error.statusCode).toBe(400)
      })

      it('includes fieldErrors when provided', async () => {
        const result = await $fetch('/api/action-error-fields', {
          method: 'POST',
          body: {},
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('CUSTOM_VALIDATION')
        expect(result.error.statusCode).toBe(422)
        expect(result.error.fieldErrors).toEqual({
          email: ['Email is already taken'],
          username: ['Username too short', 'Username contains invalid characters'],
        })
      })
    })

    // ── Handler errors ────────────────────────────────────────────

    describe('handler errors', () => {
      it('catches regular Error thrown in handler', async () => {
        const result = await $fetch('/api/handler-error', {
          method: 'POST',
          body: {},
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('INTERNAL_ERROR')
        expect(result.error.message).toBe('An unexpected error occurred')
        expect(result.error.statusCode).toBe(500)
      })
    })

    // ── E2E Type Inference (server/actions/) ─────────────────────

    describe('actions (server/actions/)', () => {
      it('routes POST action via /api/_actions/', async () => {
        const result = await $fetch('/api/_actions/create-item', {
          method: 'POST',
          body: { name: 'Test Item' },
        })
        expect(result.success).toBe(true)
        expect(result.data.name).toBe('Test Item')
        expect(result.data.created).toBe(true)
        expect(result.data.id).toBeDefined()
      })

      it('validates input for actions', async () => {
        const result = await $fetch('/api/_actions/create-item', {
          method: 'POST',
          body: { name: '' },
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
      })

      it('routes GET action via /api/_actions/', async () => {
        const result = await $fetch('/api/_actions/list-items')
        expect(result.success).toBe(true)
        expect(result.data.items).toHaveLength(2)
        expect(result.data.items[0]).toEqual({ id: 1, name: 'Item 1' })
      })

      it('routes nested actions via /api/_actions/<dir>/<name>', async () => {
        const result = await $fetch('/api/_actions/admin/stats')
        expect(result.success).toBe(true)
        expect(result.data).toEqual({ users: 3, uptime: 'ok' })
      })
    })

    // ── Idempotency (defineAction option) ────────────────────────

    describe('idempotency', () => {
      it('replays the stored result for duplicate Idempotency-Key requests', async () => {
        const key = `e2e-${Date.now()}`
        const first = await $fetch('/api/_actions/pay', {
          method: 'POST',
          body: { amount: 100 },
          headers: { 'Idempotency-Key': key },
        })
        const second = await $fetch('/api/_actions/pay', {
          method: 'POST',
          body: { amount: 100 },
          headers: { 'Idempotency-Key': key },
        })

        expect(first.success).toBe(true)
        expect(second).toEqual(first)
      })

      it('rejects the same key with a different payload', async () => {
        const key = `e2e-conflict-${Date.now()}`
        await $fetch('/api/_actions/pay', {
          method: 'POST',
          body: { amount: 100 },
          headers: { 'Idempotency-Key': key },
        })
        const conflict = await $fetch('/api/_actions/pay', {
          method: 'POST',
          body: { amount: 999 },
          headers: { 'Idempotency-Key': key },
        })

        expect(conflict.success).toBe(false)
        expect(conflict.error.code).toBe('IDEMPOTENCY_KEY_REUSE')
        expect(conflict.error.statusCode).toBe(422)
      })

      it('executes normally without a key', async () => {
        const r1 = await $fetch('/api/_actions/pay', { method: 'POST', body: { amount: 1 } })
        const r2 = await $fetch('/api/_actions/pay', { method: 'POST', body: { amount: 1 } })
        expect(r1.success).toBe(true)
        expect(r2.success).toBe(true)
        expect(r2.data.txId).not.toBe(r1.data.txId)
      })
    })

    // ── Valibot integration ──────────────────────────────────────

    describe('Valibot schema', () => {
      it('validates and returns data on success', async () => {
        const result = await $fetch('/api/valibot-echo', {
          method: 'POST',
          body: { message: 'hello valibot' },
        })
        expect(result).toEqual({
          success: true,
          data: { echo: 'hello valibot', schema: 'valibot' },
        })
      })

      it('returns validation error on invalid input', async () => {
        const result = await $fetch('/api/valibot-echo', {
          method: 'POST',
          body: { message: '' },
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
        expect(result.error.statusCode).toBe(422)
      })
    })

    // ── ArkType integration ─────────────────────────────────────

    describe('ArkType schema', () => {
      it('validates and returns data on success', async () => {
        const result = await $fetch('/api/arktype-echo', {
          method: 'POST',
          body: { message: 'hello arktype' },
        })
        expect(result).toEqual({
          success: true,
          data: { echo: 'hello arktype', schema: 'arktype' },
        })
      })

      it('returns validation error on invalid input', async () => {
        const result = await $fetch('/api/arktype-echo', {
          method: 'POST',
          body: { message: '' },
        })
        expect(result.success).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
        expect(result.error.statusCode).toBe(422)
      })
    })

    // ── Response format ───────────────────────────────────────────

    describe('response format', () => {
      it('success response has correct shape', async () => {
        const result = await $fetch('/api/echo', {
          method: 'POST',
          body: { message: 'test' },
        })
        expect(result).toHaveProperty('success', true)
        expect(result).toHaveProperty('data')
        expect(result).not.toHaveProperty('error')
      })

      it('error response has correct shape', async () => {
        const result = await $fetch('/api/action-error', {
          method: 'POST',
          body: {},
        })
        expect(result).toHaveProperty('success', false)
        expect(result).toHaveProperty('error')
        expect(result.error).toHaveProperty('code')
        expect(result.error).toHaveProperty('message')
        expect(result.error).toHaveProperty('statusCode')
        expect(result).not.toHaveProperty('data')
      })
    })

    // ── Server runtime parity (Nitro v2 and v3) ──────────────────

    describe('stream actions', () => {
      it('streams JSON frames and a done marker', async () => {
        const response = await fetch('/api/_actions/stream-echo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
          body: JSON.stringify({ prompt: 'hello brave world' }),
          signal: AbortSignal.timeout(10_000),
        })

        expect(response.headers.get('content-type')).toContain('text/event-stream')
        expect(parseFrames(await response.text())).toEqual([
          { word: 'hello' },
          { word: 'brave' },
          { word: 'world' },
          { __actions_done: true },
        ])
      })

      it('returns a validation error frame instead of hanging', async () => {
        const response = await fetch('/api/_actions/stream-echo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
          body: JSON.stringify({ prompt: '' }),
          signal: AbortSignal.timeout(5_000),
        })

        const frames = parseFrames(await response.text())
        expect(frames).toHaveLength(1)
        expect(frames[0]).toMatchObject({ __actions_error: { code: 'VALIDATION_ERROR', statusCode: 422 } })
      })

      it('aborting a stream aborts the handler signal', async () => {
        const before = await $fetch('/api/_actions/stream-probe')
        const controller = new AbortController()
        const response = await fetch('/api/_actions/stream-until-abort', {
          method: 'POST',
          headers: { accept: 'text/event-stream' },
          signal: controller.signal,
        })
        await response.body!.getReader().read()

        controller.abort()

        await expect.poll(
          async () => (await $fetch('/api/_actions/stream-probe')).data.aborted,
          { timeout: 5_000, interval: 100 },
        ).toBe(before.data.aborted + 1)
      })
    })

    describe('request parsing', () => {
      it('folds multipart files and fields', async () => {
        const form = new FormData()
        form.append('title', 'Report')
        form.append('tag', 'a')
        form.append('tag', 'b')
        form.append('doc', new File(['# hi'], 'héllo.md', { type: 'text/markdown' }))
        form.append('blob', new Blob([new Uint8Array([1, 2, 3])]), 'raw.bin')

        const result = await $fetch('/api/_actions/upload', { method: 'POST', body: form })

        expect(result).toEqual({
          success: true,
          data: {
            title: 'Report',
            tag: ['a', 'b'],
            doc: { filename: 'héllo.md', type: 'text/markdown', size: 4, text: '# hi' },
            blob: { filename: 'raw.bin', type: 'application/octet-stream', size: 3, text: '\u0001\u0002\u0003' },
          },
        })
      })

      it('reports a file part sent without a content type', async () => {
        const boundary = 'nuxt-actions-boundary'
        const body = [
          `--${boundary}`,
          'Content-Disposition: form-data; name="file"; filename="raw.bin"',
          '',
          'raw-bytes',
          `--${boundary}--`,
          '',
        ].join('\r\n')

        const response = await fetch('/api/_actions/upload', {
          method: 'POST',
          headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
          body,
        })

        expect(await response.json()).toEqual({
          success: true,
          data: {
            file: {
              filename: 'raw.bin',
              type: fixture === 'basic' ? 'application/octet-stream' : 'text/plain',
              size: 9,
              text: 'raw-bytes',
            },
          },
        })
      })

      it('parses an empty POST body as an empty object', async () => {
        const result = await $fetch('/api/_actions/inspect-body', { method: 'POST' })
        expect(result).toEqual({ success: true, data: { input: {} } })
      })

      it('parses urlencoded bodies and keeps repeated keys', async () => {
        const result = await $fetch('/api/_actions/inspect-body', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'a=1&b=2&b=3',
        })
        expect(result).toEqual({ success: true, data: { input: { a: '1', b: ['2', '3'] } } })
      })

      it('rejects invalid JSON with PARSE_ERROR', async () => {
        const response = await fetch('/api/_actions/inspect-body', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"broken": ',
        })
        const result = await response.json()
        expect(result.success).toBe(false)
        expect(result.error).toMatchObject({ code: 'PARSE_ERROR', message: 'Invalid JSON in request body', statusCode: 400 })
      })

      it('keeps a text/plain body as raw text', async () => {
        const response = await fetch('/api/_actions/inspect-body', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: '{"admin":true}',
        })
        expect(await response.json()).toEqual({ success: true, data: { input: '{"admin":true}' } })
      })

      it('passes malformed JSON with a charset through as text', async () => {
        const response = await fetch('/api/_actions/inspect-body', {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: '{"broken": ',
        })
        expect(await response.json()).toEqual({ success: true, data: { input: '{"broken": ' } })
      })

      it('preserves repeated query parameters', async () => {
        const result = await $fetch('/api/_actions/inspect-query?tag=a&tag=b&single=x')
        expect(result).toEqual({ success: true, data: { input: { tag: ['a', 'b'], single: 'x' } } })
      })

      it('passes an event that nuxt/server helpers accept', async () => {
        const result = await $fetch('/api/_actions/whoami?ref=docs', {
          method: 'POST',
          body: {},
          headers: { 'user-agent': 'nuxt-actions-e2e', 'cookie': 'theme=dark' },
        })
        expect(result).toEqual({
          success: true,
          data: { method: 'POST', path: '/api/_actions/whoami', agent: 'nuxt-actions-e2e', theme: 'dark' },
        })
      })
    })

    describe('security middleware', () => {
      it('csrf GET sets every cookie and POST validates the token', async () => {
        const issue = await fetch('/api/_actions/csrf-token')
        const cookies = issue.headers.getSetCookie()
        expect(cookies.map(cookie => cookie.split('=')[0]).sort()).toEqual(['_csrf', '_csrf_second'])

        const token = cookies.find(cookie => cookie.startsWith('_csrf='))!.split(';')[0]!.slice('_csrf='.length)
        const accepted = await $fetch('/api/_actions/csrf-check', {
          method: 'POST',
          body: {},
          headers: { 'cookie': `_csrf=${token}`, 'x-csrf-token': token },
        })
        const rejected = await $fetch('/api/_actions/csrf-check', {
          method: 'POST',
          body: {},
          headers: { cookie: `_csrf=${token}` },
        })

        expect(accepted).toEqual({ success: true, data: { ok: true } })
        expect(rejected.error).toMatchObject({ code: 'CSRF_ERROR', statusCode: 403 })
      })

      it('csrf cookie is readable by client code and keeps its token across safe requests', async () => {
        const first = await fetch('/api/_actions/csrf-session')
        const cookie = first.headers.getSetCookie().find(value => value.startsWith('_csrf='))!
        expect(cookie.toLowerCase()).not.toContain('httponly')
        const token = cookie.split(';')[0]!.slice('_csrf='.length)
        expect(await first.json()).toEqual({ success: true, data: { token } })

        const second = await fetch('/api/_actions/csrf-session', { headers: { cookie: `_csrf=${token}` } })
        const reissued = second.headers.getSetCookie().find(value => value.startsWith('_csrf='))!
        expect(reissued.split(';')[0]).toBe(`_csrf=${token}`)
        expect(await second.json()).toEqual({ success: true, data: { token } })
      })

      it('rate limit returns RATE_LIMIT after the limit', async () => {
        const results = []
        for (let attempt = 0; attempt < 3; attempt++) {
          results.push(await $fetch('/api/_actions/limited', { method: 'POST', body: {} }))
        }
        expect(results.map(result => result.success)).toEqual([true, true, false])
        expect(results[2].error).toMatchObject({ code: 'RATE_LIMIT', statusCode: 429 })
      })

      it('marks replayed idempotent responses with a header', async () => {
        const init = {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': `e2e-header-${Date.now()}` },
          body: JSON.stringify({ amount: 5 }),
        }
        const first = await fetch('/api/_actions/pay', init)
        const second = await fetch('/api/_actions/pay', init)

        expect(first.headers.get('idempotency-replayed')).toBeNull()
        expect(second.headers.get('idempotency-replayed')).toBe('true')
        expect(await second.json()).toEqual(await first.json())
      })
    })

    describe('openapi', () => {
      it('serves the OpenAPI document and Swagger UI', async () => {
        const document = await $fetch('/_actions/openapi.json')
        expect(document.openapi).toBe('3.1.0')
        expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/api/_actions/create-item', '/api/_actions/list-items']))

        const ui = await fetch('/_actions/openapi')
        expect(ui.headers.get('content-type')).toContain('text/html')
        expect(await ui.text()).toContain('swagger-ui')
      })
    })
  })
}

function parseFrames(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map(frame => frame.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice('data: '.length)).join('\n'))
    .filter(Boolean)
    .map(data => JSON.parse(data))
}
