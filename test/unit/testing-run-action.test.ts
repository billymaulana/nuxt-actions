import { describe, it, expect, vi } from 'vitest'
import { runAction } from '../../src/runtime/testing'
import { getHeader, setCookie, setHeader, setResponseStatus } from '../../src/runtime/testing/runtime'
import type { TestEvent } from '../../src/runtime/testing/runtime'
import type { ActionResult } from '../../src/runtime/types'

function fakeAction(execute: (input: unknown, event: TestEvent) => Promise<ActionResult<unknown>>) {
  return { _execute: vi.fn(execute), _types: {} as { readonly input: unknown, readonly output: unknown } }
}

describe('runAction', () => {
  it('runs the action with the input on a test event and returns the response', async () => {
    const action = fakeAction(async (input, event) => {
      setHeader(event, 'x-seen', getHeader(event, 'authorization') ?? '')
      setCookie(event, 'session', 'abc')
      setResponseStatus(event, 202)
      return { success: true, data: { input, user: event.context.auth } }
    })

    const { result, status, headers, cookies, event } = await runAction(action, {
      input: { title: 'Buy milk' },
      headers: { authorization: 'Bearer test' },
      context: { auth: { userId: 1 } },
    })

    expect(result).toEqual({ success: true, data: { input: { title: 'Buy milk' }, user: { userId: 1 } } })
    expect(status).toBe(202)
    expect(headers).toEqual({ 'x-seen': 'Bearer test' })
    expect(cookies).toEqual({ session: 'abc' })
    expect(event.method).toBe('POST')
    expect(action._execute).toHaveBeenCalledWith({ title: 'Buy milk' }, event, undefined)
  })

  it('passes the action path, which turns on the server cache', async () => {
    const action = fakeAction(async () => ({ success: true, data: 1 }))

    const { event } = await runAction(action, { method: 'GET', path: 'todos/list' })

    expect(action._execute).toHaveBeenCalledWith(undefined, event, { path: 'todos/list' })
    expect(event.path).toBe('/api/_actions/todos/list')
  })

  it('gives each action its own URL, the same on every run, so idempotency keys stay apart', async () => {
    const first = fakeAction(async () => ({ success: true, data: 1 }))
    const second = fakeAction(async () => ({ success: true, data: 2 }))

    const firstRun = await runAction(first)
    const firstAgain = await runAction(first)
    const secondRun = await runAction(second)

    expect(firstRun.event.path).toBe(firstAgain.event.path)
    expect(firstRun.event.path).not.toBe(secondRun.event.path)
    expect(firstRun.event.path.startsWith('/api/_actions/')).toBe(true)
  })

  it('keeps an explicit url next to the action path', async () => {
    const action = fakeAction(async () => ({ success: true, data: 1 }))

    const { event } = await runAction(action, { path: 'todos/list', url: '/custom?x=1' })

    expect(event.path).toBe('/custom?x=1')
  })

  it('waits for work the action handed to event.waitUntil, even when it fails', async () => {
    let finished = false
    const action = fakeAction(async (_input, event) => {
      event.waitUntil(new Promise<void>((resolve) => {
        setTimeout(() => {
          finished = true
          resolve()
        }, 10)
      }))
      event.waitUntil(Promise.reject(new Error('background failure')))
      return { success: true, data: null }
    })

    await expect(runAction(action)).resolves.toMatchObject({ result: { success: true, data: null } })
    expect(finished).toBe(true)
  })

  it('also waits for work that background work hands on', async () => {
    let finished = false
    const later = (work: () => void) => new Promise<void>((resolve) => {
      setTimeout(() => {
        work()
        resolve()
      }, 5)
    })
    const action = fakeAction(async (_input, event) => {
      event.waitUntil(later(() => event.waitUntil(later(() => {
        finished = true
      }))))
      return { success: true, data: null }
    })

    await runAction(action)

    expect(finished).toBe(true)
  })

  it('rejects something that is not an action', async () => {
    await expect(runAction({} as never)).rejects.toThrow(/defineAction or createActionClient/)
    await expect(runAction(null as never)).rejects.toThrow(TypeError)
  })
})
