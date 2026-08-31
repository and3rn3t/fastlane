import { lazy, Suspense, useEffect } from 'react'
import { useGame } from '@/state/GameContext'
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

export default function App() {
  const { game } = useGame()

  // ErrorToast renders in every branch — a failed-load message (see
  // GameContext.tsx's loadSave) fires exactly when game is null, so it must
  // be reachable from the StartScreen branch too, not just in-game.
  if (!game) {
    return (
      <>
        <StartScreen />
        <ErrorToast />
      </>
    )
  }
  if (game.phase === 'over') {
    return (
      <Suspense fallback={null}>
        <GameOver game={game} />
      </Suspense>
    )
  }

  return (
    <>
      <GameScreen game={game} />
      <ErrorToast />
      <InstallPrompt game={game} />
    </>
  )
}
