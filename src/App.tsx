import { lazy, Suspense, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { dailyChallengeOptions, dailyChallengeSeed } from '@/daily'
import { useGame } from '@/state/GameContext'
import { reportError } from '@/telemetry'
import { GameScreen } from '@/ui/GameScreen'
import { InstallPrompt, useInstallPromptEvent } from '@/ui/InstallPrompt'
import { StartScreen } from '@/ui/StartScreen'

// Lazy: pulls in RecapChart's charting code, which no player needs until a
// game actually ends — keeps it out of the initial bundle.
const GameOver = lazy(() => import('@/ui/GameOver').then((m) => ({ default: m.GameOver })))

function ErrorToast() {
  const { error, clearError } = useGame()
  useEffect(() => {
    if (!error) return
    const t = setTimeout(clearError, 3500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])
  if (!error) return null
  return (
    <div className="toast" role="alert">
      <span>{error}</span>
      <button type="button" className="toast-dismiss" onClick={clearError} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}

// registerType: 'prompt' in vite.config.ts (not the old 'autoUpdate') means
// a new deploy no longer silently swaps the service worker under an
// already-open tab — needRefresh flips true instead, and this is the only
// thing that acts on it. No auto-dismiss timeout, unlike ErrorToast: an
// available update shouldn't disappear before the player notices it.
function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => reportError(error, 'service-worker-registration'),
  })
  if (!needRefresh) return null
  return (
    <div className="toast toast-info" role="status">
      <span>A new version of Fast Lane is ready.</span>
      <button type="button" className="toast-action" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
      <button
        type="button"
        className="toast-dismiss"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

/** Backs the manifest's "Daily Challenge" PWA shortcut (long-press the home
 * screen icon → jump straight in). Lives at the App root, not inside
 * StartScreen — StartScreen only mounts when there's no save in progress, so
 * a returning player with an active game would never see the shortcut fire
 * at all (real bug, caught by a Copilot review: `App` never renders
 * StartScreen once `loadSave()` finds a game). If a save already exists,
 * confirm before discarding it — the same `window.confirm()` pattern
 * `GameScreen`'s own "quit to menu" already uses — and skip the prompt
 * entirely if that save is already today's Daily Challenge. */
function useDailyChallengeDeepLink() {
  const { game, startGame } = useGame()
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('daily') !== '1') return
    window.history.replaceState(null, '', window.location.pathname)
    if (game?.isDailyChallenge && game.rngSeed === dailyChallengeSeed()) return
    if (
      game &&
      !window.confirm("Start today's Daily Challenge? This will abandon your current game.")
    ) {
      return
    }
    startGame(dailyChallengeOptions('You'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export default function App() {
  const { game } = useGame()
  const [installEvent, setInstallEvent] = useInstallPromptEvent()
  useDailyChallengeDeepLink()

  // UpdateToast renders in every branch: a service worker update can become
  // ready regardless of game state. ErrorToast renders everywhere except
  // game-over: a failed-load message (see GameContext.tsx's loadSave) fires
  // exactly when game is null, so it must reach the StartScreen branch too —
  // but GameOver never touches error/clearError, so there's nothing for it
  // to show there.
  if (!game) {
    return (
      <>
        <StartScreen />
        <ErrorToast />
        <UpdateToast />
      </>
    )
  }
  if (game.phase === 'over') {
    return (
      <>
        <Suspense fallback={null}>
          <GameOver game={game} />
        </Suspense>
        <UpdateToast />
      </>
    )
  }

  return (
    <>
      <GameScreen game={game} />
      <ErrorToast />
      <UpdateToast />
      <InstallPrompt
        game={game}
        installEvent={installEvent}
        onInstallEventConsumed={() => setInstallEvent(null)}
      />
    </>
  )
}
