import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from '../log-error'

// Build a minimal Pages Function context with just the request field.
function makeCtx(request: Request) {
  return { request } as Parameters<typeof onRequestPost>[0]
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://example.com/api/log-error', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('onRequestPost', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts valid JSON and returns 204', async () => {
    const body = JSON.stringify({ message: 'boom', context: 'test', stack: 'Error\n  at x' })
    const res = await onRequestPost(makeCtx(makeRequest(body)))
    expect(res.status).toBe(204)
    expect(console.error).toHaveBeenCalledWith(
      '[fastlane client error]',
      expect.objectContaining({ message: 'boom', context: 'test' })
    )
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await onRequestPost(makeCtx(makeRequest('{not json')))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-object JSON (null)', async () => {
    const res = await onRequestPost(makeCtx(makeRequest('null')))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-object JSON (array)', async () => {
    const res = await onRequestPost(makeCtx(makeRequest('[1,2,3]')))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-object JSON (string)', async () => {
    const res = await onRequestPost(makeCtx(makeRequest('"hello"')))
    expect(res.status).toBe(400)
  })

  it('returns 413 for an oversized body', async () => {
    const big = JSON.stringify({ message: 'x'.repeat(9_000) })
    const res = await onRequestPost(makeCtx(makeRequest(big)))
    expect(res.status).toBe(413)
  })

  it('truncates individual fields longer than MAX_FIELD_CHARS', async () => {
    const long = 'a'.repeat(5_000)
    const body = JSON.stringify({ message: long, context: 'ctx' })
    const res = await onRequestPost(makeCtx(makeRequest(body)))
    expect(res.status).toBe(204)
    const call = vi.mocked(console.error).mock.calls[0][1] as Record<string, string | undefined>
    expect(call.message?.length).toBe(4_000)
  })

  it('returns 400 when request has no body', async () => {
    const req = new Request('https://example.com/api/log-error', { method: 'POST' })
    const res = await onRequestPost(makeCtx(req))
    expect(res.status).toBe(400)
  })

  it('ignores unknown fields without error', async () => {
    const body = JSON.stringify({ message: 'ok', unknownField: 'ignored' })
    const res = await onRequestPost(makeCtx(makeRequest(body)))
    expect(res.status).toBe(204)
  })

  it('handles a chunked body (Content-Length absent) within limit correctly', async () => {
    // Simulate chunked transfer by not providing Content-Length — just use body directly.
    const body = JSON.stringify({ message: 'chunked', context: 'test' })
    const req = new Request('https://example.com/api/log-error', {
      method: 'POST',
      body,
      // No Content-Length header — will be sent without it
    })
    const res = await onRequestPost(makeCtx(req))
    expect(res.status).toBe(204)
  })
})
