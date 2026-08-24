import type { GameState } from '@/engine'
import { useGame } from '@/state/GameContext'

export function GameOver({ game }: { game: GameState }) {
  const { quitToMenu } = useGame()
  const playerWon = game.winner === 'player'
  return (
    <div className="app">
      <div className="start gameover">
        <h1>{playerWon ? '🏆 You made it!' : '🎩 Riley got there first.'}</h1>
        <p className="tagline">
          {playerWon
            ? `All four goals reached in ${game.week - 1} weeks. The fast lane is yours, ${game.player.name}.`
            : `Riley hit all four goals in ${game.week - 1} weeks while you were... doing whatever that was.`}
        </p>
        <div className="start-actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={quitToMenu}>
            Play again
          </button>
        </div>
      </div>
    </div>
  )
}
