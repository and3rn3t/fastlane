import { useEffect, useRef, useState } from 'react'
import type { GameState } from '@/engine'
import { useGame } from '@/state/GameContext'
import { shareableResult } from '@/daily'
import { recordGameResult, type Achievement } from '@/stats'
import { RecapChart } from './RecapChart'
import { playWin } from './sound'

export function GameOver({ game }: { game: GameState }) {
  const { quitToMenu } = useGame()
  const playerWon = game.winner === 'player'
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([])
  const [copied, setCopied] = useState(false)
  // Guards against StrictMode's dev-only double effect invocation: without
  // it, the second call correctly dedupes on rngSeed and returns an empty
  // list, which then overwrites the first (correct) result in state.
  const recordedRef = useRef(false)

  useEffect(() => {
    if (playerWon) playWin()
    if (!recordedRef.current) {
      recordedRef.current = true
      setNewlyUnlocked(recordGameResult(game).newlyUnlocked)
    }
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
        {newlyUnlocked.length > 0 && (
          <div className="achievement-unlocked">
            {newlyUnlocked.map((a) => (
              <p key={a.id}>
                🏆 Achievement unlocked: <strong>{a.name}</strong> — {a.description}
              </p>
            ))}
          </div>
        )}
        {game.isDailyChallenge && (
          <div className="daily-share">
            <pre className="share-result">{shareableResult(game)}</pre>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareableResult(game))
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                } catch {
                  // Clipboard permission denied or unavailable — the text is
                  // still visible above to select and copy by hand.
                }
              }}
            >
              {copied ? 'Copied!' : '📋 Copy result'}
            </button>
          </div>
        )}
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
