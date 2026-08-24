import { useEffect } from 'react'
import type { GameState } from '@/engine'
import { useGame } from '@/state/GameContext'
import { RecapChart } from './RecapChart'
import { playWin } from './sound'

export function GameOver({ game }: { game: GameState }) {
  const { quitToMenu } = useGame()
  const playerWon = game.winner === 'player'

  useEffect(() => {
    if (playerWon) playWin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const netWorthData = game.history.map((h) => ({
    week: h.week,
    you: h.playerNetWorth,
    riley: h.rileyNetWorth,
  }))
  const careerData = game.history.map((h) => ({
    week: h.week,
    you: h.playerCareer,
    riley: h.rileyCareer,
  }))

  return (
    <div className="app">
      <div className="start gameover">
        <h1>{playerWon ? '🏆 You made it!' : '🎩 Riley got there first.'}</h1>
        <p className="tagline">
          {playerWon
            ? `All four goals reached in ${game.week - 1} weeks. The fast lane is yours, ${game.player.name}.`
            : `Riley hit all four goals in ${game.week - 1} weeks while you were... doing whatever that was.`}
        </p>
        {game.history.length > 0 && (
          <div className="recap-charts">
            <RecapChart
              title="Net worth by week"
              data={netWorthData}
              format={(n) => `$${n.toLocaleString()}`}
            />
            <RecapChart title="Career by week" data={careerData} format={(n) => `${n}`} />
          </div>
        )}
        <div className="start-actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={quitToMenu}>
            Play again
          </button>
        </div>
      </div>
    </div>
  )
}
