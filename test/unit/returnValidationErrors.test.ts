import { returnValidationErrors } from '../../src/runtime/server/utils/returnValidationErrors'
import { describe, it, expect } from 'vitest'

describe('returnValidationErrors', () => {
  it('throws an error with correct structure', () => {
    const fieldErrors = { email: ['Email is required'] }

    try {
      returnValidationErrors(fieldErrors)
      expect.fail('Should have thrown')
    }
    catch (err: unknown) {
      const error = err as Record<string, unknown>
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.statusCode).toBe(422)
      expect(error.fieldErrors).toEqual({ email: ['Email is required'] })
    }
  })

  it('uses default message "Validation failed"', () => {
    try {
      returnValidationErrors({ name: ['Required'] })
      expect.fail('Should have thrown')
    }
    catch (err: unknown) {
      const error = err as Record<string, unknown>
      expect(error.message).toBe('Validation failed')
    }
  })

  it('uses custom message when provided', () => {
    try {
      returnValidationErrors(
        { username: ['Username is reserved'] },
        'Registration failed',
      )
      expect.fail('Should have thrown')
    }
    catch (err: unknown) {
      const error = err as Record<string, unknown>
      expect(error.message).toBe('Registration failed')
    }
  })

  it('thrown error has __isActionError property', () => {
    try {
      returnValidationErrors({ field: ['Error'] })
      expect.fail('Should have thrown')
    }
    catch (err: unknown) {
      const error = err as Record<string, unknown>
      expect(error.__isActionError).toBe(true)
    }
  })

  it('handles multiple field errors', () => {
    try {
      returnValidationErrors({
        email: ['Email is required', 'Must be a valid email'],
        password: ['Too short'],
      })
      expect.fail('Should have thrown')
    }
    catch (err: unknown) {
      const error = err as Record<string, unknown>
      expect(error.fieldErrors).toEqual({
        email: ['Email is required', 'Must be a valid email'],
        password: ['Too short'],
      })
    }
  })

  it('always throws (return type is never)', () => {
    expect(() => {
      returnValidationErrors({ x: ['error'] })
    }).toThrow()
  })
})
