import { lazy, Suspense, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useGame } from '@/state/GameContext'
import { reportError } from '@/telemetry'
import { GameScreen } from '@/ui/GameScreen'
import { InstallPrompt } from '@/ui/InstallPrompt'
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

export default function App() {
  const { game } = useGame()

  // ErrorToast/UpdateToast render in every branch: a failed-load message
  // (see GameContext.tsx's loadSave) fires exactly when game is null, so it
  // must be reachable from the StartScreen branch too, not just in-game —
  // and a service worker update can become ready regardless of game state.
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
      <InstallPrompt game={game} />
    </>
  )
}
