import { csrfMiddleware } from '../../src/runtime/server/utils/csrfMiddleware'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock h3 functions
const mockGetCookie = vi.fn()
const mockSetCookie = vi.fn()
const mockGetHeader = vi.fn()

vi.mock('h3', () => ({
  getCookie: (...args: unknown[]) => mockGetCookie(...args),
  setCookie: (...args: unknown[]) => mockSetCookie(...args),
  getHeader: (...args: unknown[]) => mockGetHeader(...args),
}))

// Mock createActionError
vi.mock('../../src/runtime/server/utils/defineAction', () => ({
  createActionError: (opts: { code: string, message: string, statusCode?: number }) => {
    const error = new Error(opts.message) as Error & { code: string, statusCode: number }
    error.code = opts.code
    error.statusCode = opts.statusCode ?? 400
    return error
  },
}))

function createMockEvent(method: string) {
  return { method } as { method: string }
}

describe('csrfMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('token generation on GET requests', () => {
    it('generates a token and sets it as a cookie on GET', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('GET')
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware({ event, next } as never)

      expect(mockSetCookie).toHaveBeenCalledWith(
        event,
        '_csrf',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
          secure: true,
        }),
      )

      // Token should be hex string of correct length (32 bytes = 64 hex chars)
      const token = mockSetCookie.mock.calls[0][2] as string
      expect(token).toMatch(/^[a-f0-9]{64}$/)

      expect(next).toHaveBeenCalled()
    })

    it('generates a token on HEAD request', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('HEAD')
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware({ event, next } as never)

      expect(mockSetCookie).toHaveBeenCalled()
      expect(next).toHaveBeenCalled()
    })

    it('generates a token on OPTIONS request', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('OPTIONS')
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware({ event, next } as never)

      expect(mockSetCookie).toHaveBeenCalled()
      expect(next).toHaveBeenCalled()
    })

    it('uses custom cookie name', async () => {
      const middleware = csrfMiddleware({ cookieName: '__xsrf' })
      const event = createMockEvent('GET')
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware({ event, next } as never)

      expect(mockSetCookie).toHaveBeenCalledWith(
        event,
        '__xsrf',
        expect.any(String),
        expect.any(Object),
      )
    })

    it('uses custom token length', async () => {
      const middleware = csrfMiddleware({ tokenLength: 16 })
      const event = createMockEvent('GET')
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware({ event, next } as never)

      // 16 bytes = 32 hex chars
      const token = mockSetCookie.mock.calls[0][2] as string
      expect(token).toMatch(/^[a-f0-9]{32}$/)
    })
  })

  describe('validation on POST requests', () => {
    it('validates matching tokens on POST', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('POST')
      const next = vi.fn().mockResolvedValue(undefined)

      mockGetCookie.mockReturnValue('valid-token-123')
      mockGetHeader.mockReturnValue('valid-token-123')

      await middleware({ event, next } as never)

      expect(mockGetCookie).toHaveBeenCalledWith(event, '_csrf')
      expect(mockGetHeader).toHaveBeenCalledWith(event, 'x-csrf-token')
      expect(next).toHaveBeenCalled()
    })

    it('validates on PUT requests', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('PUT')
      const next = vi.fn().mockResolvedValue(undefined)

      mockGetCookie.mockReturnValue('token-abc')
      mockGetHeader.mockReturnValue('token-abc')

      await middleware({ event, next } as never)

      expect(next).toHaveBeenCalled()
    })

    it('validates on PATCH requests', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('PATCH')
      const next = vi.fn().mockResolvedValue(undefined)

      mockGetCookie.mockReturnValue('token-xyz')
      mockGetHeader.mockReturnValue('token-xyz')

      await middleware({ event, next } as never)

      expect(next).toHaveBeenCalled()
    })

    it('validates on DELETE requests', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('DELETE')
      const next = vi.fn().mockResolvedValue(undefined)

      mockGetCookie.mockReturnValue('token-del')
      mockGetHeader.mockReturnValue('token-del')

      await middleware({ event, next } as never)

      expect(next).toHaveBeenCalled()
    })

    it('uses custom header name for validation', async () => {
      const middleware = csrfMiddleware({ headerName: 'x-xsrf-token' })
      const event = createMockEvent('POST')
      const next = vi.fn().mockResolvedValue(undefined)

      mockGetCookie.mockReturnValue('token')
      mockGetHeader.mockReturnValue('token')

      await middleware({ event, next } as never)

      expect(mockGetHeader).toHaveBeenCalledWith(event, 'x-xsrf-token')
    })
  })

  describe('rejection on mismatched tokens', () => {
    it('throws when cookie token is missing', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('POST')
      const next = vi.fn()

      mockGetCookie.mockReturnValue(undefined)
      mockGetHeader.mockReturnValue('header-token')

      await expect(middleware({ event, next } as never)).rejects.toThrow('CSRF token missing')
      expect(next).not.toHaveBeenCalled()
    })

    it('throws when header token is missing', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('POST')
      const next = vi.fn()

      mockGetCookie.mockReturnValue('cookie-token')
      mockGetHeader.mockReturnValue(undefined)

      await expect(middleware({ event, next } as never)).rejects.toThrow('CSRF token missing')
      expect(next).not.toHaveBeenCalled()
    })

    it('throws when both tokens are missing', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('POST')
      const next = vi.fn()

      mockGetCookie.mockReturnValue(undefined)
      mockGetHeader.mockReturnValue(undefined)

      await expect(middleware({ event, next } as never)).rejects.toThrow('CSRF token missing')
      expect(next).not.toHaveBeenCalled()
    })

    it('throws on token mismatch', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('POST')
      const next = vi.fn()

      mockGetCookie.mockReturnValue('cookie-token-abc')
      mockGetHeader.mockReturnValue('header-token-xyz')

      await expect(middleware({ event, next } as never)).rejects.toThrow('CSRF token mismatch')
      expect(next).not.toHaveBeenCalled()
    })

    it('throws on token mismatch with different lengths', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('POST')
      const next = vi.fn()

      mockGetCookie.mockReturnValue('short')
      mockGetHeader.mockReturnValue('much-longer-token')

      await expect(middleware({ event, next } as never)).rejects.toThrow('CSRF token mismatch')
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('case insensitive method handling', () => {
    it('handles lowercase post method', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('post')
      const next = vi.fn()

      mockGetCookie.mockReturnValue(undefined)
      mockGetHeader.mockReturnValue(undefined)

      await expect(middleware({ event, next } as never)).rejects.toThrow('CSRF token missing')
    })

    it('handles lowercase get method', async () => {
      const middleware = csrfMiddleware()
      const event = createMockEvent('get')
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware({ event, next } as never)

      expect(mockSetCookie).toHaveBeenCalled()
      expect(next).toHaveBeenCalled()
    })
  })
})
