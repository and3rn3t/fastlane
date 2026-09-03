import { useEffect, useRef, useState } from 'react'
import { jobById, LOCATIONS, type GameState, type LocationId } from '@/engine'
import { useGame } from '@/state/GameContext'
import { ChevronDownIcon } from './Icon'
import { LOCATION_ICONS } from './icons'
import {
  CasinoAction,
  ClassAction,
  DoctorAction,
  GroceryAction,
  HomeActions,
  LocationPanelBody,
  MealAction,
  WorkAction,
} from './LocationPanel'

type SheetState = 'peek' | 'expanded'

const DESKTOP_BREAKPOINT_PX = 900

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < DESKTOP_BREAKPOINT_PX
}

const PEEK_ACTIONS: Partial<
  Record<LocationId, (p: { game: GameState }) => React.JSX.Element | null>
> = {
  home: HomeActions,
  burgers: MealAction,
  market: GroceryAction,
  university: ClassAction,
  clinic: DoctorAction,
  casino: CasinoAction,
}

/** A two-state (peek/expanded) bottom sheet wrapping LocationPanelBody. On
 * mobile it docks to the bottom of the screen showing just the current
 * location and its single most relevant action; on desktop (≥900px, where
 * `.game-layout` has already opened up a side column) it renders as a plain
 * static card, always expanded — a graceful degradation, not a separate
 * design target. */
export function LocationSheet({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const [sheetState, setSheetState] = useState<SheetState>(() =>
    isMobileViewport() ? 'peek' : 'expanded'
  )
  // Tracked in state (not just read inline on render) and kept live via a
  // resize listener below — otherwise a width change that crosses the
  // breakpoint without some unrelated re-render (e.g. a tablet rotating from
  // desktop-width landscape into mobile-width portrait while the sheet is
  // expanded) would leave this stale, silently reintroducing the
  // blocked-controls bug the backdrop below exists to fix.
  const [isMobileWidth, setIsMobileWidth] = useState(isMobileViewport)
  const prevLocationRef = useRef(game.player.location)

  useEffect(() => {
    const onResize = () => setIsMobileWidth(isMobileViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Arriving somewhere new opens the sheet so the player sees what's here.
  // Taking an action at the *same* location deliberately does NOT collapse
  // it back anymore (an earlier version did) — that auto-collapse fought
  // anyone doing several actions in a row at one location (buying groceries
  // repeatedly at MegaMart, working multiple shifts), and some locations had
  // no peek action at all, so it collapsed into a dead, un-actionable state
  // requiring a manual re-expand every time. The persistent End Week button
  // below replaces auto-collapse as the way back to the board, so the sheet
  // no longer needs to manage that on its own.
  useEffect(() => {
    if (prevLocationRef.current !== game.player.location) {
      setSheetState('expanded')
    }
    prevLocationRef.current = game.player.location
  }, [game.player.location])

  const loc = LOCATIONS[game.player.location]
  const p = game.player
  const atWork = p.jobId != null && jobById(p.jobId).workplace === p.location
  const PeekAction = atWork ? WorkAction : PEEK_ACTIONS[loc.id]
  const LocIcon = LOCATION_ICONS[loc.id]
  const expanded = sheetState === 'expanded'

  return (
    <>
      {expanded && isMobileWidth && (
        <div
          className="location-sheet-backdrop"
          // Tap anywhere outside the sheet to collapse it — the same
          // dismiss path `.modal-backdrop` already gives Help/the week
          // report. Real bug this fixes: on a short viewport, the sheet's
          // own content (not even the max-height cap) can cover controls
          // behind it (e.g. Home's blurb over the board's End Week button)
          // with previously no way back except finding the small handle.
          onClick={() => setSheetState('peek')}
          aria-hidden
        />
      )}
      <div className={`location-sheet panel${expanded ? ' expanded' : ''}`}>
        <button
          type="button"
          className="location-sheet-handle"
          aria-expanded={expanded}
          aria-controls="location-sheet-body"
          onClick={() => setSheetState((s) => (s === 'peek' ? 'expanded' : 'peek'))}
        >
          <span className="drag-pill" aria-hidden />
          <span className="icon-chip" aria-hidden>
            <LocIcon size={18} />
          </span>
          <span className="location-sheet-heading">
            <strong>{loc.name}</strong>
            <span className="desc">{loc.blurb}</span>
          </span>
          <ChevronDownIcon size={14} className="disclosure-chevron" />
        </button>
        {isMobileWidth && (
          <button
            type="button"
            className="location-sheet-end-week"
            onClick={() => dispatchGame({ type: 'endWeek' })}
          >
            End week {p.timeLeft > 0 ? `(${p.timeLeft}h unused)` : ''}
          </button>
        )}
        {!expanded && PeekAction && (
          <div className="location-sheet-peek-action">
            <PeekAction game={game} />
          </div>
        )}
        {expanded && (
          <div className="location-sheet-body" id="location-sheet-body">
            <LocationPanelBody game={game} />
          </div>
        )}
      </div>
    </>
  )
}
