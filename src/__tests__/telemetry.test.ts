import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportError } from '../telemetry'

describe('telemetry', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the error message, truncated stack, url, and user agent', () => {
    const err = new Error('boom')
    reportError(err, 'error-boundary')

    expect(fetch).toHaveBeenCalledWith(
      '/api/log-error',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"context":"error-boundary"'),
      })
    )
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.message).toBe('boom')
    expect(body.url).toBe(location.href)
    expect(body.userAgent).toBe(navigator.userAgent)
  })

  it('stops sending after the per-session cap', () => {
    for (let i = 0; i < 10; i++) reportError(new Error(`err-${i}`), 'test')
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('never throws when sessionStorage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(() => reportError(new Error('boom'), 'test')).not.toThrow()
    spy.mockRestore()
  })

  it('never throws when the network request rejects', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline')))
    )
    expect(() => reportError(new Error('boom'), 'test')).not.toThrow()
  })

  it('accepts a non-Error value without throwing', () => {
    expect(() => reportError('a plain string error', 'test')).not.toThrow()
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.message).toBe('a plain string error')
    expect(body.stack).toBeUndefined()
  })
})
