import {
  LOCATIONS,
  goalProgress,
  travelCost,
  hasItem,
  type GameState,
} from '@/engine'
import { useGame } from '@/state/GameContext'
import { LOCATION_ICONS } from './icons'

// Loop index → cell in a 4×4 grid, walking the perimeter clockwise so
// board adjacency matches travel cost.
const PERIMETER: Array<[row: number, col: number]> = [
  [1, 1], [1, 2], [1, 3], [1, 4],
  [2, 4], [3, 4],
  [4, 4], [4, 3], [4, 2], [4, 1],
  [3, 1], [2, 1],
]

const TRACKS = [
  { key: 'wealth', label: '💵 Wealth' },
  { key: 'happiness', label: '😊 Happy' },
  { key: 'education', label: '🎓 Education' },
  { key: 'career', label: '💼 Career' },
] as const

function CenterPanel({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const mine = goalProgress(game.player, game.goals)
  const rival = goalProgress(game.jones, game.goals)

  return (
    <div className="board-center">
      <div className="week-line">
        <h3>Week {game.week}</h3>
        <span className="time-left" title="Time remaining this week">
          ⏱ {game.player.timeLeft}h
        </span>
      </div>
      <div className="bar-cols">
        <span />
        <span>{game.player.name}</span>
        <span>Jones</span>
      </div>
      <div className="progress-pair">
        {TRACKS.map((t) => (
          <div className="row" key={t.key}>
            <span>{t.label}</span>
            <div className="bar">
              <div style={{ width: `${Math.round(mine[t.key] * 100)}%` }} />
            </div>
            <div className="bar rival">
              <div style={{ width: `${Math.round(rival[t.key] * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <button
        className="primary end-week"
        onClick={() => dispatchGame({ type: 'endWeek' })}
        title="Spend your remaining time and let the week play out"
      >
        End week {game.player.timeLeft > 0 ? `(${game.player.timeLeft}h unused)` : ''}
      </button>
    </div>
  )
}

export function Board({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const bike = hasItem(p, 'bike')

  return (
    <div className="board">
      {Object.values(LOCATIONS).map((loc) => {
        const [row, col] = PERIMETER[loc.loopIndex]
        const here = p.location === loc.id
        const cost = travelCost(p.location, loc.id, bike)
        const jonesHere = game.jones.location === loc.id
        return (
          <button
            key={loc.id}
            className={`tile${here ? ' here' : ''}`}
            style={{ gridRow: row, gridColumn: col }}
            disabled={here || cost > p.timeLeft}
            onClick={() => dispatchGame({ type: 'travel', to: loc.id })}
            title={here ? 'You are here' : `Travel: ${cost}h`}
          >
            <span className="icon" aria-hidden>
              {LOCATION_ICONS[loc.id]}
            </span>
            <span className="name">{loc.name}</span>
            <span className="cost">{here ? 'You are here' : `${cost}h away`}</span>
            {jonesHere && (
              <span className="pawn-marker" title="Jones is here" aria-label="Jones is here">
                🎩
              </span>
            )}
          </button>
        )
      })}
      <CenterPanel game={game} />
    </div>
  )
}
