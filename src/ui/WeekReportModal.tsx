import type { GameState } from '@/engine'
import { useGame } from '@/state/GameContext'

export function WeekReportModal({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const report = game.lastReport
  if (!report) return null
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label={`Week ${report.week} report`}>
        <h2>Week {report.week} wraps up</h2>
        <p className="blurb">📰 {report.headline}</p>
        <div className="log">
          {report.entries
            .filter((e) => e.text !== report.headline)
            .map((e, i) => (
              <div className="entry" key={i}>
                <span className="who">
                  {e.actor === 'player' ? '🙂' : e.actor === 'jones' ? '🎩' : '🌍'}
                </span>
                <span>{e.text}</span>
              </div>
            ))}
        </div>
        <button className="primary" onClick={() => dispatchGame({ type: 'dismissReport' })}>
          Start week {game.week}
        </button>
      </div>
    </div>
  )
}
