import { useEffect } from 'react'
import { useGame } from '@/state/GameContext'
import { GameOver } from '@/ui/GameOver'
import { GameScreen } from '@/ui/GameScreen'
import { StartScreen } from '@/ui/StartScreen'
import { WeekReportModal } from '@/ui/WeekReportModal'

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
      {game.phase === 'weekReport' && <WeekReportModal game={game} />}
      <ErrorToast />
    </>
  )
}
