import { useEffect, useRef, useState } from 'react'
import { jobById, LOCATIONS, type GameState, type LocationId } from '@/engine'
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
  const [sheetState, setSheetState] = useState<SheetState>(() =>
    typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT_PX
      ? 'expanded'
      : 'peek'
  )
  const prevLocationRef = useRef(game.player.location)
  const prevLogLengthRef = useRef(game.log.length)

  useEffect(() => {
    const locationChanged = prevLocationRef.current !== game.player.location
    if (locationChanged) {
      setSheetState('expanded')
    } else if (game.log.length !== prevLogLengthRef.current) {
      // An action was taken at the same location — collapse back to peek on
      // mobile only; on desktop the panel stays expanded.
      if (window.innerWidth < DESKTOP_BREAKPOINT_PX) {
        setSheetState((s) => (s === 'expanded' ? 'peek' : s))
      }
    }
    prevLocationRef.current = game.player.location
    prevLogLengthRef.current = game.log.length
  }, [game.player.location, game.log.length])

  const loc = LOCATIONS[game.player.location]
  const p = game.player
  const atWork = p.jobId != null && jobById(p.jobId).workplace === p.location
  const PeekAction = atWork ? WorkAction : PEEK_ACTIONS[loc.id]
  const LocIcon = LOCATION_ICONS[loc.id]
  const expanded = sheetState === 'expanded'

  // Explicit width check, not just CSS's desktop-hides-it rule below — the
  // desktop panel is a permanent static card, not a temporary sheet, so it
  // should never even mount a click-blocking overlay, and this makes that
  // guarantee visible/testable in JS rather than relying on the stylesheet
  // alone. Matches the same ad-hoc `window.innerWidth` check the effect
  // above already uses for other mobile-only sheet behavior.
  const isMobileWidth = typeof window !== 'undefined' && window.innerWidth < DESKTOP_BREAKPOINT_PX

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
