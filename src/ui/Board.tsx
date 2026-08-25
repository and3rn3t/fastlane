import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  LOCATIONS,
  goalProgress,
  travelCost,
  hasItem,
  type GameState,
  type LocationId,
} from '@/engine'
import { useGame } from '@/state/GameContext'
import { LOCATION_ICONS } from './icons'
import { playMove } from './sound'

// Loop index → cell in a 4×5 grid (4 cols, 5 rows — an extra row rather than
// column, since a taller board fits a narrow phone screen better than a
// wider one), walking the perimeter clockwise so board adjacency roughly
// matches travel cost. The frame has exactly 14 edge cells; Casino
// (loopIndex 13) fills row 2 col 4, the one slot left empty when the ring
// only had 13 locations — the board now uses every cell with no gap.
const PERIMETER: Array<[row: number, col: number]> = [
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [5, 3],
  [5, 2],
  [5, 1],
  [4, 1],
  [3, 1],
  [2, 1],
  [2, 4],
]

const TRACKS = [
  { key: 'wealth', label: '💵 Wealth' },
  { key: 'happiness', label: '😊 Happy' },
  { key: 'education', label: '🎓 Education' },
  { key: 'career', label: '💼 Career' },
] as const

/** Flashes a floating +/-N whenever `value` changes, for a beat, then clears. */
export function useDeltaFlash(value: number) {
  const prevRef = useRef(value)
  const [delta, setDelta] = useState<number | null>(null)

  useEffect(() => {
    const diff = value - prevRef.current
    prevRef.current = value
    if (diff === 0) return
    setDelta(diff)
    const t = setTimeout(() => setDelta(null), 1100)
    return () => clearTimeout(t)
  }, [value])

  return delta
}

export function DeltaBadge({
  delta,
  format,
}: {
  delta: number | null
  format: (n: number) => string
}) {
  if (delta === null) return null
  return <span className={`delta-flash ${delta > 0 ? 'up' : 'down'}`}>{format(delta)}</span>
}

function CenterPanel({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const mine = goalProgress(game.player, game.goals)
  const rival = goalProgress(game.riley, game.goals)
  const timeDelta = useDeltaFlash(game.player.timeLeft)

  return (
    <div className="board-center">
      <div className="week-line">
        <h3>Week {game.week}</h3>
        <span className="time-left" title="Time remaining this week">
          ⏱ {game.player.timeLeft}h
          <DeltaBadge delta={timeDelta} format={(n) => `${n > 0 ? '+' : ''}${n}h`} />
        </span>
      </div>
      <div className="bar-cols">
        <span />
        <span>{game.player.name}</span>
        <span>Riley</span>
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

interface TokenPos {
  x: number
  y: number
}

/** Measures where the player/riley tokens should sit, in pixels relative to
 * the board container — so they can be single persistent elements moved via
 * a CSS transform transition (a real glide) instead of remounting inside
 * whichever tile currently matches (a teleport). Re-measures on location
 * change and on board resize (responsive breakpoints, orientation). */
function useTokenPositions(
  boardRef: React.RefObject<HTMLDivElement | null>,
  tileRefs: React.RefObject<Partial<Record<LocationId, HTMLButtonElement | null>>>,
  playerLocation: LocationId,
  rileyLocation: LocationId
) {
  const [positions, setPositions] = useState<{ player: TokenPos | null; riley: TokenPos | null }>({
    player: null,
    riley: null,
  })

  const measure = useCallback(() => {
    const board = boardRef.current
    if (!board) return
    const boardRect = board.getBoundingClientRect()
    const locate = (id: LocationId, corner: 'left' | 'right'): TokenPos | null => {
      const el = tileRefs.current[id]
      if (!el) return null
      const r = el.getBoundingClientRect()
      const x = corner === 'left' ? r.left - boardRect.left + 6 : r.right - boardRect.left - 26
      return { x, y: r.top - boardRect.top + 6 }
    }
    setPositions({
      player: locate(playerLocation, 'left'),
      riley: locate(rileyLocation, 'right'),
    })
  }, [boardRef, tileRefs, playerLocation, rileyLocation])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const board = boardRef.current
    if (!board || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(board)
    return () => ro.disconnect()
  }, [boardRef, measure])

  return positions
}

export function Board({
  game,
  rileyLocation,
}: {
  game: GameState
  /** Overrides where Riley's pawn renders — used during turn-playback replay
   * to walk the token through the week instead of jumping to the final spot. */
  rileyLocation?: LocationId
}) {
  const { dispatchGame } = useGame()
  const p = game.player
  const bike = hasItem(p, 'bike')
  const effectiveRileyLocation = rileyLocation ?? game.riley.location

  const boardRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Partial<Record<LocationId, HTMLButtonElement | null>>>({})
  const { player: playerPos, riley: rileyPos } = useTokenPositions(
    boardRef,
    tileRefs,
    p.location,
    effectiveRileyLocation
  )

  return (
    <div className="board" ref={boardRef}>
      {Object.values(LOCATIONS).map((loc) => {
        const [row, col] = PERIMETER[loc.loopIndex]
        const here = p.location === loc.id
        const cost = travelCost(p.location, loc.id, bike)
        return (
          <button
            key={loc.id}
            ref={(el) => {
              tileRefs.current[loc.id] = el
            }}
            className={`tile${here ? ' here' : ''}`}
            style={{ gridRow: row, gridColumn: col }}
            disabled={here || cost > p.timeLeft}
            onClick={() => {
              playMove()
              dispatchGame({ type: 'travel', to: loc.id })
            }}
            title={here ? 'You are here' : `Travel: ${cost}h`}
          >
            <span className="icon" aria-hidden>
              {LOCATION_ICONS[loc.id]}
            </span>
            <span className="name">{loc.name}</span>
            <span className="cost">{here ? 'You are here' : `${cost}h away`}</span>
          </button>
        )
      })}
      {playerPos && (
        <span
          className="pawn-marker-wrap"
          style={{ transform: `translate(${playerPos.x}px, ${playerPos.y}px)` }}
        >
          <span
            className="pawn-marker"
            title={`${p.name} is here`}
            aria-label={`${p.name} is here`}
          >
            🙂
          </span>
        </span>
      )}
      {rileyPos && (
        <span
          className="pawn-marker-wrap"
          style={{ transform: `translate(${rileyPos.x}px, ${rileyPos.y}px)` }}
        >
          <span className="pawn-marker" title="Riley is here" aria-label="Riley is here">
            🎩
          </span>
        </span>
      )}
      <CenterPanel game={game} />
    </div>
  )
}
