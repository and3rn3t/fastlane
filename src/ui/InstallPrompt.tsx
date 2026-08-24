import { useState } from 'react'
import type { GameState } from '@/engine'

const DISMISS_KEY = 'fastlane-install-dismissed'

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

/**
 * iOS Safari has no native install prompt — "Add to Home Screen" is a manual
 * Share-sheet action a page can't trigger. This nudges players toward it
 * after their first real session, not on load, since it's the only way an
 * iOS save survives Safari's ~7-day localStorage eviction.
 */
export function InstallPrompt({ game }: { game: GameState }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  const playedAWeek = game.week > 1
  const eligible = playedAWeek && !dismissed && isIOS() && !isStandalone()

  if (!eligible) return null

  return (
    <div className="install-prompt" role="status">
      <span>
        📲 Add Fast Lane to your Home Screen so your save survives — tap <strong>Share</strong>,
        then <strong>Add to Home Screen</strong>.
      </span>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1')
          setDismissed(true)
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
