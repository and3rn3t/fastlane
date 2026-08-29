import { useEffect } from 'react'
import type { GameState } from '@/engine'
import { useGame } from '@/state/GameContext'
import { useModalDialog } from './useModalDialog'

// Same substring-matching style as stats.ts's achievement checks — these are
// the exact phrases week.ts's upkeep()/personalEvent() log for the random
// negative events, so a bad week doesn't just blend into the rest of the log.
const NOTABLE_PATTERNS = [
  'was laid off',
  'was stolen',
  'was evicted',
  'was robbed of',
  'wages are being garnished',
]
const isNotable = (text: string) => NOTABLE_PATTERNS.some((p) => text.includes(p))

export function WeekReportModal({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const report = game.lastReport
  const dialogRef = useModalDialog(() => dispatchGame({ type: 'dismissReport' }))

  useEffect(() => {
    if (!report) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [report])

  if (!report) return null
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-label={`Week ${report.week} report`}
        ref={dialogRef}
      >
        <h2>Week {report.week} wraps up</h2>
        <p className="blurb">📰 {report.headline}</p>
        <div className="log">
          {report.entries
            .filter((e) => e.text !== report.headline)
            .map((e, i) => (
              <div className={`entry${isNotable(e.text) ? ' entry-notable' : ''}`} key={i}>
                <span className="who">
                  {e.actor === 'player' ? '🙂' : e.actor === 'riley' ? '🎩' : '🌍'}
                </span>
                <span>{e.text}</span>
              </div>
            ))}
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => dispatchGame({ type: 'dismissReport' })}
        >
          Start week {game.week}
        </button>
      </div>
    </div>
  )
}
