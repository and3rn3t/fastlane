import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newGame, type GameState } from '@/engine'
import { GameProvider, SAVE_KEY, useGame } from '@/state/GameContext'
import { LocationSheet } from '@/ui/LocationSheet'

function freshGame(): GameState {
  const goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
  return newGame({ playerName: 'Tester', goals, seed: 1 })
}

/** Renders LocationSheet against GameProvider's own live game state (seeded
 * via localStorage before mount, the same path a real save load takes)
 * instead of a static prop, and surfaces the current phase — so a test can
 * click the button and observe a real dispatch actually landing, rather than
 * only checking the button exists. */
function LiveGameHarness() {
  const { game } = useGame()
  if (!game) return null
  return (
    <>
      <span data-testid="phase">{game.phase}</span>
      <LocationSheet game={game} />
    </>
  )
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

describe('LocationSheet backdrop (mobile bottom-sheet mode)', () => {
  const originalWidth = window.innerWidth

  beforeEach(() => setViewportWidth(375)) // below DESKTOP_BREAKPOINT_PX — starts in 'peek'
  afterEach(() => {
    cleanup()
    setViewportWidth(originalWidth)
  })

  it('shows no backdrop while collapsed (peek)', () => {
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    expect(document.querySelector('.location-sheet-backdrop')).toBeNull()
  })

  it('shows a backdrop once expanded, and tapping it collapses back to peek', () => {
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    expect(document.querySelector('.location-sheet-backdrop')).toBeTruthy()

    // Regression test for a real reported bug: the expanded sheet's own
    // content height (independent of any max-height cap) could cover
    // controls behind it on a short viewport, with no way back except
    // finding the small handle. The backdrop is the fix — tapping it
    // anywhere must collapse the sheet, same as .modal-backdrop already
    // does for Help/the week report.
    fireEvent.click(document.querySelector('.location-sheet-backdrop')!)
    expect(document.querySelector('.location-sheet-backdrop')).toBeNull()
    expect(screen.getByRole('button', { name: /Home/i }).getAttribute('aria-expanded')).toBe(
      'false'
    )
  })

  it('never shows a backdrop on desktop, where the panel is a static always-expanded card', () => {
    setViewportWidth(1280)
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    // Desktop starts (and stays) expanded, but the backdrop must not exist —
    // it would otherwise block the rest of the page for no reason.
    expect(screen.getByRole('button', { name: /Home/i }).getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.location-sheet-backdrop')).toBeNull()
  })

  it('picks up a backdrop after resizing from desktop into mobile width while expanded', () => {
    // Regression test for a real gap: a tablet rotating from desktop-width
    // landscape into mobile-width portrait while the sheet is expanded must
    // not silently reintroduce the blocked-controls bug just because no
    // other prop/state change happened to trigger a re-render.
    setViewportWidth(1280)
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    expect(document.querySelector('.location-sheet-backdrop')).toBeNull()

    setViewportWidth(375)
    fireEvent(window, new Event('resize'))

    expect(screen.getByRole('button', { name: /Home/i }).getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.location-sheet-backdrop')).toBeTruthy()
  })
})

describe('LocationSheet persistent End Week control', () => {
  const originalWidth = window.innerWidth

  afterEach(() => {
    cleanup()
    setViewportWidth(originalWidth)
    localStorage.removeItem(SAVE_KEY)
  })

  it('is available on mobile whether the sheet is peeked or expanded, and never on desktop', () => {
    setViewportWidth(375)
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    expect(screen.getByRole('button', { name: /^End week/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    expect(screen.getByRole('button', { name: /^End week/i })).toBeTruthy()
    cleanup()

    setViewportWidth(1280)
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    expect(screen.queryByRole('button', { name: /^End week/i })).toBeNull()
  })

  it('actually dispatches endWeek when clicked, advancing the game past a broken/removed handler', () => {
    setViewportWidth(375)
    localStorage.setItem(SAVE_KEY, JSON.stringify(freshGame()))
    render(
      <GameProvider>
        <LiveGameHarness />
      </GameProvider>
    )
    expect(screen.getByTestId('phase').textContent).toBe('playing')

    fireEvent.click(screen.getByRole('button', { name: /^End week/i }))

    expect(screen.getByTestId('phase').textContent).toBe('weekReport')
  })

  it('does not collapse the expanded sheet back to peek after taking an action at the same location', () => {
    // Regression test: an earlier version force-collapsed the sheet to peek
    // whenever the game log grew at the same location, which fought anyone
    // taking several actions in a row (e.g. buying groceries repeatedly at
    // MegaMart, where there was no peek action at all, so it collapsed into
    // a dead un-actionable state). Simulates that same-location log growth
    // via a rerender and asserts the sheet is left exactly as the player set
    // it, per the redesign.
    setViewportWidth(375)
    const game = freshGame()
    const { rerender } = render(
      <GameProvider>
        <LocationSheet game={game} />
      </GameProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    expect(screen.getByRole('button', { name: /Home/i }).getAttribute('aria-expanded')).toBe('true')

    const gameAfterAction: GameState = {
      ...game,
      log: [...game.log, { week: game.week, actor: 'player', text: 'Relaxed 4h.' }],
    }
    rerender(
      <GameProvider>
        <LocationSheet game={gameAfterAction} />
      </GameProvider>
    )

    expect(screen.getByRole('button', { name: /Home/i }).getAttribute('aria-expanded')).toBe('true')
  })

  it('shows a hint instead of an empty peek at a location with no peek action, and stays genuinely collapsible', () => {
    // Regression test for two real reported bugs in sequence. First: several
    // locations (First Bank, Gadget City, the Rent Office, ...) have no
    // single "most relevant" action to show compactly, so collapsing there
    // used to leave a peek state with nothing in it but the handle and End
    // Week — no way to deposit, withdraw, invest, etc. without re-expanding,
    // and it read as broken. Second, a first attempt at fixing that forced
    // the sheet permanently expanded wherever there was no peek action —
    // which, on a short viewport, could cover board tiles with a fixed
    // overlay the player could no longer dismiss (the backdrop and handle
    // both set state to 'peek', but expanded no longer answered to it),
    // trapping them behind it with no way to travel elsewhere except ending
    // the week. Peek must stay non-empty *and* genuinely collapsible.
    setViewportWidth(375)
    const game = freshGame()
    const gameAtBank: GameState = { ...game, player: { ...game.player, location: 'bank' } }
    render(
      <GameProvider>
        <LocationSheet game={gameAtBank} />
      </GameProvider>
    )
    // Starts peeked (mobile default) with a non-empty hint, not nothing.
    expect(screen.getByRole('button', { name: /First Bank/i }).getAttribute('aria-expanded')).toBe(
      'false'
    )
    expect(document.querySelector('.location-sheet-peek-action')?.textContent).toMatch(/tap/i)
    expect(document.querySelector('.location-sheet-body')).toBeNull()
    expect(document.querySelector('.location-sheet-backdrop')).toBeNull()

    // Tapping the handle expands it, same as everywhere else.
    fireEvent.click(screen.getByRole('button', { name: /First Bank/i }))
    expect(screen.getByRole('button', { name: /First Bank/i }).getAttribute('aria-expanded')).toBe(
      'true'
    )
    expect(document.querySelector('.location-sheet-body')).toBeTruthy()

    // And tapping it again must genuinely collapse back — not get stuck
    // expanded, which is exactly what trapped the player behind the sheet.
    fireEvent.click(screen.getByRole('button', { name: /First Bank/i }))
    expect(screen.getByRole('button', { name: /First Bank/i }).getAttribute('aria-expanded')).toBe(
      'false'
    )
    expect(document.querySelector('.location-sheet-body')).toBeNull()
    expect(document.querySelector('.location-sheet-backdrop')).toBeNull()
  })
})
