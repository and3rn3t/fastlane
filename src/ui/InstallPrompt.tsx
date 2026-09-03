import { useEffect, useState } from 'react'
import type { GameState } from '@/engine'

const DISMISS_KEY = 'fastlane-install-dismissed'

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  // matchMedia is universal in real browsers but absent in jsdom (this
  // repo's test environment) and some minimal webviews — this now runs
  // unconditionally rather than only after an isIOS() short-circuit, so it
  // needs to degrade to "not standalone" instead of throwing.
  const standaloneDisplayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  return standaloneDisplayMode || nav.standalone === true
}

/** Not in lib.dom.d.ts yet — Chromium-only, no official TS lib entry. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Android/desktop Chrome fires this once, early, instead of showing its own
 * generic mini-infobar — but only once `preventDefault()` is called on it,
 * and only if it's ever going to fire at all (iOS Safari and browsers with
 * no installability signal never do). Captured here so the branded button
 * can trigger the native prompt later, on the player's own timing.
 *
 * Exported and called from `App.tsx`, not from inside `InstallPrompt` itself
 * — `InstallPrompt` only mounts once a game exists, but the one-shot event
 * can fire earlier, while a first-time visitor is still on `StartScreen`.
 * A listener that isn't registered yet when the event fires loses it for
 * good (real bug, caught by a Copilot review — verified against `App.tsx`'s
 * actual render branches). Living at the App root, alongside
 * `ErrorToast`/`UpdateToast`, keeps it listening regardless of which branch
 * is showing. */
export function useInstallPromptEvent(): [
  BeforeInstallPromptEvent | null,
  (event: BeforeInstallPromptEvent | null) => void,
] {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])
  return [event, setEvent]
}

/**
 * Nudges toward installing after a player's first real session, not on
 * load — mainly because it's the only way an iOS save survives Safari's
 * ~7-day localStorage eviction, but worth doing everywhere a save exists.
 * Two real install paths, mutually exclusive per platform: Android/desktop
 * Chrome gets a branded button wired to the captured `beforeinstallprompt`
 * event (passed in from `App.tsx`, see `useInstallPromptEvent`'s comment);
 * iOS Safari has no such event (Add to Home Screen is a manual Share-sheet
 * action a page can't trigger), so it gets instructions instead.
 */
export function InstallPrompt({
  game,
  installEvent,
  onInstallEventConsumed,
}: {
  game: GameState
  installEvent: BeforeInstallPromptEvent | null
  onInstallEventConsumed: () => void
}) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  const playedAWeek = game.week > 1
  const eligible = playedAWeek && !dismissed && !isStandalone()
  if (!eligible) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (installEvent) {
    return (
      <div className="install-prompt" role="status">
        <span>📲 Install Fast Lane so your save survives, and play it like a real app.</span>
        <button
          className="install-cta"
          onClick={async () => {
            await installEvent.prompt()
            const { outcome } = await installEvent.userChoice
            // A beforeinstallprompt event can only be prompted once — clear
            // it regardless of outcome, or a second click would reuse a
            // consumed event (real bug, caught by a Copilot review: without
            // this, the button stayed visible and did nothing on a second
            // click). 'dismissed' just means "not now," not "never ask
            // again," so only an actual accept also suppresses the nudge
            // for good — a mere "not now" can still show the iOS-style
            // fallback... except there is none for this platform, so the
            // banner simply won't reappear until the next real event fires
            // (e.g. a future page load), same as the browser's own infobar.
            onInstallEventConsumed()
            if (outcome === 'accepted') dismiss()
          }}
        >
          Install
        </button>
        <button onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    )
  }

  if (isIOS()) {
    return (
      <div className="install-prompt" role="status">
        <span>
          📲 Add Fast Lane to your Home Screen so your save survives — tap <strong>Share</strong>,
          then <strong>Add to Home Screen</strong>.
        </span>
        <button onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    )
  }

  // Neither path available (desktop Firefox, an already-dismissed Chrome
  // infobar this session, etc.) — nothing to show.
  return null
}
