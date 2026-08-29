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

function truncate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.slice(0, MAX_FIELD_CHARS)
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 })
  }

  let body: ErrorReport
  try {
    body = await request.json()
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
