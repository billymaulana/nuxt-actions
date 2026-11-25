import { $fetch as ofetch } from 'ofetch'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useAction } from '../../src/runtime/composables/useAction'
import { FakeXHR } from './helpers/fake-xhr'

const app = vi.hoisted(() => ({ fetch: undefined as unknown }))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return { ...actual, onScopeDispose: vi.fn() }
})

vi.mock('#app', () => ({
  useNuxtApp: () => ({ $fetch: app.fetch }),
}))

const json = (body: unknown) => JSON.stringify(body)
const JSON_HEADERS = 'content-type: application/json'

async function sent(count = 1): Promise<FakeXHR> {
  await vi.waitFor(() => expect(FakeXHR.instances.filter(xhr => xhr.sent)).toHaveLength(count))
  return FakeXHR.last!
}

beforeEach(() => {
  FakeXHR.instances = []
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
  app.fetch = ofetch.create({ baseURL: 'https://api.test' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAction upload progress', () => {
  it('reports progress in uploadProgress and onUploadProgress, and keeps the last value', async () => {
    const onUploadProgress = vi.fn()
    const { execute, uploadProgress } = useAction('/api/_actions/upload', { method: 'POST', onUploadProgress })

    const pending = execute(new FormData())
    const xhr = await sent()
    const started = uploadProgress.value
    xhr.progress(5, 10)
    const halfway = uploadProgress.value
    xhr.respond(200, json({ success: true, data: 'stored' }), JSON_HEADERS)

    expect(await pending).toEqual({ success: true, data: 'stored' })
    expect(started).toEqual({ loaded: 0, total: null, percent: null })
    expect(halfway).toEqual({ loaded: 5, total: 10, percent: 50 })
    expect(uploadProgress.value).toEqual({ loaded: 5, total: 10, percent: 50 })
    expect(onUploadProgress).toHaveBeenCalledWith({ loaded: 5, total: 10, percent: 50 })
  })

  it('keeps baseURL and headers, and retries through the same transport', async () => {
    const { execute, uploadProgress } = useAction('/api/_actions/upload', {
      method: 'POST',
      uploadProgress: true,
      headers: { authorization: 'Bearer t' },
      retry: { count: 1, delay: 0, statusCodes: [503] },
    })

    const pending = execute({ name: 'a.txt' })
    ;(await sent(1)).respond(503, json({ message: 'Busy' }), JSON_HEADERS)
    const retry = await sent(2)
    retry.progress(3, 3)
    retry.respond(200, json({ success: true, data: 1 }), JSON_HEADERS)

    expect(await pending).toEqual({ success: true, data: 1 })
    expect(retry.url).toBe('https://api.test/api/_actions/upload')
    expect(retry.headers.authorization).toBe('Bearer t')
    expect(retry.body).toBe('{"name":"a.txt"}')
    expect(uploadProgress.value).toEqual({ loaded: 3, total: 3, percent: 100 })
  })

  it('aborts the upload on cancel', async () => {
    const { execute, cancel, status } = useAction('/api/_actions/upload', { method: 'POST', uploadProgress: true })

    const pending = execute(new FormData())
    const xhr = await sent()
    cancel()

    expect(await pending).toEqual({ success: false, error: { code: 'ABORT_ERROR', message: 'Request was aborted', statusCode: 0 } })
    expect(xhr.aborted).toBe(true)
    expect(status.value).toBe('idle')
  })

  it('reset() clears uploadProgress', async () => {
    const { execute, reset, uploadProgress } = useAction('/api/_actions/upload', { method: 'POST', uploadProgress: true })
    const pending = execute(new FormData())
    const xhr = await sent()
    xhr.progress(1, 2)
    xhr.respond(200, json({ success: true, data: null }), JSON_HEADERS)
    await pending

    reset()

    expect(uploadProgress.value).toBeNull()
  })

  it('does not let a superseded call overwrite the progress of the latest', async () => {
    const onUploadProgress = vi.fn()
    const { execute, uploadProgress } = useAction('/api/_actions/upload', { method: 'POST', onUploadProgress })

    const first = execute(new FormData())
    const older = await sent(1)
    const second = execute(new FormData())
    const latest = await sent(2)
    latest.progress(1, 4)
    older.progress(4, 4)

    expect(uploadProgress.value).toEqual({ loaded: 1, total: 4, percent: 25 })
    expect(onUploadProgress).toHaveBeenCalledTimes(2)
    older.respond(200, json({ success: true, data: 1 }), JSON_HEADERS)
    latest.respond(200, json({ success: true, data: 2 }), JSON_HEADERS)
    await Promise.all([first, second])
  })

  it('uses $fetch directly, with uploadProgress staying null, when tracking is off or unavailable', async () => {
    const appFetch = vi.fn(async () => ({ success: true, data: 'plain' }))
    app.fetch = Object.assign(appFetch, { create: vi.fn() })

    const off = useAction('/api/_actions/upload', { method: 'POST' })
    await off.execute(new FormData())
    vi.stubGlobal('XMLHttpRequest', undefined)
    const unavailable = useAction('/api/_actions/upload', { method: 'POST', uploadProgress: true })
    await unavailable.execute(new FormData())
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    app.fetch = vi.fn(async () => ({ success: true, data: 'no create' }))
    const withoutCreate = useAction('/api/_actions/upload', { method: 'POST', uploadProgress: true })

    expect(await withoutCreate.execute(new FormData())).toEqual({ success: true, data: 'no create' })
    expect(appFetch).toHaveBeenCalledTimes(2)
    expect((app.fetch as unknown as { create?: unknown }).create).toBeUndefined()
    expect([off.uploadProgress.value, unavailable.uploadProgress.value, withoutCreate.uploadProgress.value]).toEqual([null, null, null])
    expect(FakeXHR.instances).toEqual([])
  })
})
