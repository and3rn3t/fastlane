import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  LOCATIONS,
  LOOP_SIZE,
  goalProgress,
  travelCost,
  hasItem,
  type GameState,
  type LocationId,
} from '@/engine'
import { useGame } from '@/state/GameContext'
import { BriefcaseIcon, DollarIcon, GradCapIcon, HeartIcon } from './Icon'
import { LOCATION_CATEGORY, LOCATION_ICONS } from './icons'
import { playMove } from './sound'

/**
 * Grid shape (rows × cols, rows ≥ cols) whose border has at least `n` cells —
 * the smallest such rectangle, growing rows before cols so a taller board
 * (fits a narrow phone screen better) is preferred over a wider one.
 */
function gridShapeForSize(n: number): { rows: number; cols: number } {
  const cols = Math.max(2, Math.ceil(Math.sqrt(n)))
  let rows = cols
  while (2 * (rows + cols) - 4 < n) rows++
  return { rows, cols }
}

/**
 * Walks the border of a `rows`×`cols` grid clockwise from the top-left
 * corner: right along the top row, down the right column, left along the
 * bottom row, up the left column.
 */
function walkPerimeter(rows: number, cols: number): Array<[row: number, col: number]> {
  const cells: Array<[number, number]> = []
  for (let c = 1; c <= cols; c++) cells.push([1, c])
  for (let r = 2; r <= rows; r++) cells.push([r, cols])
  for (let c = cols - 1; c >= 1; c--) cells.push([rows, c])
  for (let r = rows - 1; r >= 2; r--) cells.push([r, 1])
  return cells
}

/**
 * Loop index → board cell, derived from `LOOP_SIZE` instead of hand-listed:
 * the smallest grid whose border fits every location, walked clockwise so
 * board adjacency roughly matches travel cost (see travelCost() in
 * engine/data.ts).
 *
 * One historical wrinkle, preserved on purpose: when Casino became the 14th
 * location, the 13 existing `loopIndex` values were left untouched — shifting
 * them would have silently changed every travel cost and desynced saves —
 * and Casino was placed into the one grid cell (walk position 4, row 2 col 4)
 * a 13-cell clockwise walk had left empty, instead of at that position in the
 * sequence. That single deferred cell is reproduced here explicitly so the
 * board keeps rendering byte-identically at the current size; it's a one-off
 * fact about how the 14th location landed, not a rule for any future growth.
 */
export function perimeterForSize(n: number): Array<[row: number, col: number]> {
  const { rows, cols } = gridShapeForSize(n)
  const walk = walkPerimeter(rows, cols)
  if (n === 14) {
    const deferred = walk[4]
    return [...walk.slice(0, 4), ...walk.slice(5), deferred]
  }
  return walk.slice(0, n)
}

const PERIMETER = perimeterForSize(LOOP_SIZE)

const TRACKS = [
  { key: 'wealth', label: 'Wealth', Icon: DollarIcon, category: 'wealth' },
  { key: 'happiness', label: 'Happy', Icon: HeartIcon, category: 'happy' },
  { key: 'education', label: 'Education', Icon: GradCapIcon, category: 'edu' },
  { key: 'career', label: 'Career', Icon: BriefcaseIcon, category: 'career' },
] as const

/** Circumference of the time-left ring gauge (r=19, matching the SVG below). */
const RING_RADIUS = 19
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

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
  const mine = goalProgress(game.player, game.goals, game.economy.marketIndex)
  const rival = goalProgress(game.riley, game.goals, game.economy.marketIndex)
  const timeDelta = useDeltaFlash(game.player.timeLeft)

  const ringOffset = RING_CIRCUMFERENCE * (1 - game.player.timeLeft / 60)

  return (
    <div className="board-center">
      <div className="week-line">
        <svg className="time-ring" width="46" height="46" viewBox="0 0 46 46" aria-hidden>
          <defs>
            <linearGradient id="time-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--cat-happy)" />
            </linearGradient>
          </defs>
          <circle cx="23" cy="23" r={RING_RADIUS} fill="none" className="time-ring-track" />
          <circle
            cx="23"
            cy="23"
            r={RING_RADIUS}
            fill="none"
            className="time-ring-fill"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={ringOffset}
            transform="rotate(-90 23 23)"
            style={{ '--ring-circumference': RING_CIRCUMFERENCE } as React.CSSProperties}
          />
        </svg>
        <div className="week-line-text">
          <h3>Week {game.week}</h3>
          <span className="time-left" title="Time remaining this week">
            {game.player.timeLeft}h left
            <DeltaBadge delta={timeDelta} format={(n) => `${n > 0 ? '+' : ''}${n}h`} />
          </span>
        </div>
      </div>
      <div className="bar-cols">
        <span />
        <span>{game.player.name}</span>
        <span>Riley</span>
      </div>
      <div className="progress-pair">
        {TRACKS.map((t) => (
          <div className="row" key={t.key}>
            <span>
              <t.Icon size={13} className="track-icon" /> {t.label}
            </span>
            <div className="bar">
              <div
                style={{
                  width: `${Math.round(mine[t.key] * 100)}%`,
                  background: `var(--cat-${t.category})`,
                }}
              />
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
  playerPawn = '🙂',
}: {
  game: GameState
  /** Overrides where Riley's pawn renders — used during turn-playback replay
   * to walk the token through the week instead of jumping to the final spot. */
  rileyLocation?: LocationId
  /** The player's board glyph — defaults to the original marker; a legacy
   * perk (src/legacy.ts) can unlock an alternate one. Purely cosmetic. */
  playerPawn?: string
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
        const TileIcon = LOCATION_ICONS[loc.id]
        const category = LOCATION_CATEGORY[loc.id]
        return (
          <button
            key={loc.id}
            ref={(el) => {
              tileRefs.current[loc.id] = el
            }}
            className={`tile${here ? ' here' : ''}`}
            data-category={category ?? undefined}
            style={{ gridRow: row, gridColumn: col }}
            disabled={here || cost > p.timeLeft}
            onClick={() => {
              playMove()
              dispatchGame({ type: 'travel', to: loc.id })
            }}
            title={here ? 'You are here' : `Travel: ${cost}h`}
          >
            <span className="icon" aria-hidden>
              <TileIcon size={20} />
            </span>
            <span className="name">{loc.name}</span>
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
            {playerPawn}
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
