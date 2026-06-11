import { describe, it, expect } from 'vitest'
import { isActionError } from '../../src/runtime/composables/isActionError'
import type { ActionError, ActionErrorCode } from '../../src/runtime/types'

describe('isActionError (client)', () => {
  it('accepts the marker from createActionError-style objects', () => {
    const err = {
      code: 'NOT_FOUND',
      message: 'missing',
      statusCode: 404,
      __isActionError: true,
    }
    expect(isActionError(err)).toBe(true)
  })

  it('accepts structural ActionError envelopes', () => {
    const err: ActionError = {
      code: 'VALIDATION_ERROR',
      message: 'Input validation failed',
      statusCode: 422,
      fieldErrors: { title: ['Required'] },
    }
    expect(isActionError(err)).toBe(true)
  })

  it('narrows the type so code/statusCode are accessible', () => {
    const err: unknown = { code: 'UNAUTHORIZED', message: 'nope', statusCode: 401 }
    if (isActionError(err)) {
      const code: ActionErrorCode = err.code
      expect(code).toBe('UNAUTHORIZED')
      expect(err.statusCode).toBe(401)
    }
    else {
      expect.unreachable('expected the guard to pass')
    }
  })

  it('rejects null, undefined, and primitives', () => {
    expect(isActionError(null)).toBe(false)
    expect(isActionError(undefined)).toBe(false)
    expect(isActionError('VALIDATION_ERROR')).toBe(false)
    expect(isActionError(422)).toBe(false)
  })

  it('rejects objects missing envelope fields', () => {
    expect(isActionError({ code: 'X', message: 'y' })).toBe(false)
    expect(isActionError({ message: 'y', statusCode: 400 })).toBe(false)
    expect(isActionError({ code: 'X', statusCode: 400 })).toBe(false)
  })

  it('rejects native Error instances even with code/statusCode attached', () => {
    const err = Object.assign(new Error('boom'), { code: 'X', statusCode: 500 })
    expect(isActionError(err)).toBe(false)
  })

  it('rejects prototype-spoofed __isActionError', () => {
    const proto = { __isActionError: true }
    const spoofed = Object.create(proto)
    expect(isActionError(spoofed)).toBe(false)
  })

  it('rejects objects with wrong field types', () => {
    expect(isActionError({ code: 1, message: 'y', statusCode: 400 })).toBe(false)
    expect(isActionError({ code: 'X', message: 2, statusCode: 400 })).toBe(false)
    expect(isActionError({ code: 'X', message: 'y', statusCode: '400' })).toBe(false)
  })
})
