// Minimal client-error visibility sink. Not a triage dashboard — just
// console.error, which wrangler.toml's [observability] already makes
// visible in the Cloudflare dashboard's Workers Logs with zero extra
// account/service signup. See src/telemetry.ts for the client side.
interface ErrorReport {
  context?: unknown
  message?: unknown
  stack?: unknown
  url?: unknown
  userAgent?: unknown
}

const MAX_BODY_BYTES = 8_000
const MAX_FIELD_CHARS = 4_000

// Simple in-process sliding-window rate limit: max 60 requests per minute.
// This is a best-effort guard — it resets on Worker cold-start — but it
// prevents runaway log floods within a single isolate lifetime.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60
const requestTimestamps: number[] = []

function isRateLimited(): boolean {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  // Evict timestamps outside the window.
  while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT_MAX) return true
  requestTimestamps.push(now)
  return false
}

function truncate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.slice(0, MAX_FIELD_CHARS)
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  if (isRateLimited()) {
    return new Response(null, { status: 429 })
  }

  // Read up to MAX_BODY_BYTES + 1 so we can detect over-sized bodies
  // regardless of whether the client sent a Content-Length header.
  const reader = request.body?.getReader()
  if (!reader) {
    return new Response(null, { status: 400 })
  }
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 })
    }
    chunks.push(value)
  }
  const rawBody = new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length)
      merged.set(acc)
      merged.set(chunk, acc.length)
      return merged
    }, new Uint8Array(0))
  )

  let body: ErrorReport
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return new Response(null, { status: 400 })
    }
    body = parsed as ErrorReport
  } catch {
    return new Response(null, { status: 400 })
  }

  console.error('[fastlane client error]', {
    context: truncate(body.context),
    message: truncate(body.message),
    stack: truncate(body.stack),
    url: truncate(body.url),
    userAgent: truncate(body.userAgent),
  })

  return new Response(null, { status: 204 })
}
