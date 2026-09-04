import { useEffect, useRef, useState } from 'react'
import { LOCATIONS, type GameState } from '@/engine'
import { useGame } from '@/state/GameContext'
import { ChevronDownIcon } from './Icon'
import { LOCATION_ICONS } from './icons'
import { LocationPanelBody } from './LocationPanel'
import { useModalDialog } from './useModalDialog'

/** Must match the mobile media queries in index.css (and `.game-layout`'s
 * single-column collapse) — the one JS source of the breakpoint. */
const MOBILE_MEDIA_QUERY = '(max-width: 899.98px)'

// matchMedia is universal in real browsers but absent in jsdom (same guard
// as InstallPrompt) — tests without a mock get the static desktop card.
function supportsMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => supportsMatchMedia() && window.matchMedia(MOBILE_MEDIA_QUERY).matches
  )
  useEffect(() => {
    if (!supportsMatchMedia()) return
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

function LocationHeading({ game }: { game: GameState }) {
  const loc = LOCATIONS[game.player.location]
  const LocIcon = LOCATION_ICONS[loc.id]
  return (
    <>
      <span className="icon-chip" aria-hidden>
        <LocIcon size={18} />
      </span>
      <span className="location-heading">
        <strong>{loc.name}</strong>
        <span className="desc">{loc.blurb}</span>
      </span>
    </>
  )
}

/** The current location's actions as a real modal bottom sheet, reusing the
 * `.modal` pattern (and useModalDialog's focus trap / Escape / focus restore)
 * that Help and WeekReportModal already rely on — instead of the hand-rolled
 * fixed overlay this replaced, which kept re-growing dismiss/z-order/coverage
 * bugs the standard modal never had. */
function LocationActionsSheet({ game, onClose }: { game: GameState; onClose: () => void }) {
  const loc = LOCATIONS[game.player.location]
  const dialogRef = useModalDialog(onClose)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Closes only on a click landing directly on the backdrop, not one that
  // bubbled up from a click inside the dialog — same pattern as Help.
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        className="modal location-modal"
        role="dialog"
        aria-modal="true"
        aria-label={loc.name}
        ref={dialogRef}
      >
        <div className="location-modal-header">
          <LocationHeading game={game} />
        </div>
        <LocationPanelBody game={game} />
      </div>
    </div>
  )
}

/** Current-location UI. On desktop (≥900px, where `.game-layout` has a side
 * column) it's a plain static card. On mobile it's a slim fixed-height dock
 * (location + End Week, so ending the week can never be covered) plus the
 * modal sheet above, opened by tapping the dock or arriving somewhere new.
 * Taking an action at the same location keeps the sheet open — an earlier
 * auto-collapse fought anyone doing several actions in a row. */
export function LocationSheet({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const prevLocationRef = useRef(game.player.location)

  // Arriving somewhere new opens the sheet so the player sees what's here.
  useEffect(() => {
    if (prevLocationRef.current !== game.player.location) {
      setSheetOpen(true)
    }
    prevLocationRef.current = game.player.location
  }, [game.player.location])

  // Ending the week (or the game) must never leave this sheet mounted under
  // WeekReportModal — two dialogs would double up useModalDialog's focus trap.
  useEffect(() => {
    if (game.phase !== 'playing') setSheetOpen(false)
  }, [game.phase])

  if (!isMobile) {
    return (
      <div className="location-card panel">
        <div className="location-card-header">
          <LocationHeading game={game} />
        </div>
        <LocationPanelBody game={game} />
      </div>
    )
  }

  const p = game.player
  return (
    <>
      <div className="location-dock">
        <button
          type="button"
          className="location-dock-open"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          <LocationHeading game={game} />
          <ChevronDownIcon size={14} className="disclosure-chevron up" />
        </button>
        <button
          type="button"
          className="location-dock-end-week"
          onClick={() => dispatchGame({ type: 'endWeek' })}
        >
          End week {p.timeLeft > 0 ? `(${p.timeLeft}h left)` : ''}
        </button>
      </div>
      {sheetOpen && <LocationActionsSheet game={game} onClose={() => setSheetOpen(false)} />}
    </>
  )
}
