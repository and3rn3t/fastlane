import { useEffect } from 'react'
import { useGame } from '@/state/GameContext'
import { GameOver } from '@/ui/GameOver'
import { GameScreen } from '@/ui/GameScreen'
import { InstallPrompt } from '@/ui/InstallPrompt'
import { StartScreen } from '@/ui/StartScreen'

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
    <div className="toast" role="alert" onClick={clearError}>
      {error}
    </div>
  )
}

export default function App() {
  const { game } = useGame()

  if (!game) return <StartScreen />
  if (game.phase === 'over') return <GameOver game={game} />

  return (
    <>
      <GameScreen game={game} />
      <ErrorToast />
      <InstallPrompt game={game} />
    </>
  )
}
