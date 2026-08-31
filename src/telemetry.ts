const ENDPOINT = '/api/log-error'
const SESSION_KEY = 'fastlane-telemetry-count'
const MAX_REPORTS_PER_SESSION = 5
const MAX_STACK_CHARS = 4000

// In-memory fallback for when sessionStorage is blocked (private mode, ITP, etc.)
let inMemoryCount = 0

/**
 * Best-effort crash visibility, not a full triage dashboard: posts to a
 * Cloudflare Pages Function that just logs (visible in Workers Logs, see
 * wrangler.toml's [observability]). Must never itself throw — a broken
 * telemetry call is not allowed to break the app it's reporting on.
 */
export function reportError(error: unknown, context: string): void {
  try {
    const count = Number(sessionStorage.getItem(SESSION_KEY) ?? '0')
    if (count >= MAX_REPORTS_PER_SESSION) return
    sessionStorage.setItem(SESSION_KEY, String(count + 1))
  } catch {
    // sessionStorage blocked — use in-memory counter as fallback.
    if (inMemoryCount >= MAX_REPORTS_PER_SESSION) return
    inMemoryCount++
  }

  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack?.slice(0, MAX_STACK_CHARS) : undefined

  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context,
        message,
        stack,
        url: location.href,
        userAgent: navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => {
      // Network failure, offline, endpoint down — nothing else to do.
    })
  } catch {
    // fetch throwing synchronously would be unusual, but still not our problem to crash over.
  }
}
