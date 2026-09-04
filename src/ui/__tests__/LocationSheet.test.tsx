import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

/** jsdom has no matchMedia; LocationSheet's useIsMobile is its only viewport
 * signal, so mock it with working change-listeners to drive width changes. */
let mediaListeners: ((e: MediaQueryListEvent) => void)[] = []
let mediaMatches = false

function installMatchMedia(matches: boolean) {
  mediaMatches = matches
  mediaListeners = []
  window.matchMedia = ((query: string) =>
    ({
      matches: mediaMatches,
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        mediaListeners.push(cb)
      },
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        mediaListeners = mediaListeners.filter((l) => l !== cb)
      },
    }) as MediaQueryList) as typeof window.matchMedia
}

function crossBreakpoint(matches: boolean) {
  mediaMatches = matches
  for (const cb of [...mediaListeners]) cb({ matches } as MediaQueryListEvent)
}

afterEach(() => {
  cleanup()
  localStorage.removeItem(SAVE_KEY)
})

describe('LocationSheet on mobile (dock + modal actions sheet)', () => {
  beforeEach(() => installMatchMedia(true))

  it('starts as a closed dock: location + End Week visible, no dialog open', () => {
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    expect(screen.getByRole('button', { name: /Home/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^End week/i })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the actions sheet as a real dialog from the dock, and closes it via backdrop and Escape', () => {
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    const dialog = screen.getByRole('dialog', { name: /Home/i })
    expect(dialog).toBeTruthy()

    // Backdrop click closes — a click inside the dialog must not.
    fireEvent.click(dialog)
    expect(screen.getByRole('dialog', { name: /Home/i })).toBeTruthy()
    fireEvent.click(document.querySelector('.modal-backdrop')!)
    expect(screen.queryByRole('dialog')).toBeNull()

    // Escape closes too (useModalDialog), the piece the old hand-rolled
    // overlay never had.
    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    expect(screen.getByRole('dialog', { name: /Home/i })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the actions sheet on arriving at a new location', () => {
    const game = freshGame()
    const { rerender } = render(
      <GameProvider>
        <LocationSheet game={game} />
      </GameProvider>
    )
    expect(screen.queryByRole('dialog')).toBeNull()

    const atBank: GameState = { ...game, player: { ...game.player, location: 'bank' } }
    rerender(
      <GameProvider>
        <LocationSheet game={atBank} />
      </GameProvider>
    )
    expect(screen.getByRole('dialog', { name: /First Bank/i })).toBeTruthy()
  })

  it('keeps the sheet open after taking an action at the same location', () => {
    // Regression guard carried over from the old sheet: an early version
    // auto-collapsed on every action, which fought anyone doing several
    // actions in a row (repeat grocery runs, multiple shifts).
    const game = freshGame()
    const { rerender } = render(
      <GameProvider>
        <LocationSheet game={game} />
      </GameProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    expect(screen.getByRole('dialog', { name: /Home/i })).toBeTruthy()

    const gameAfterAction: GameState = {
      ...game,
      log: [...game.log, { week: game.week, actor: 'player', text: 'Relaxed 4h.' }],
    }
    rerender(
      <GameProvider>
        <LocationSheet game={gameAfterAction} />
      </GameProvider>
    )
    expect(screen.getByRole('dialog', { name: /Home/i })).toBeTruthy()
  })

  it('closes the sheet when the phase leaves playing, so it never stacks under WeekReportModal', () => {
    const game = freshGame()
    const { rerender } = render(
      <GameProvider>
        <LocationSheet game={game} />
      </GameProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    const reportPhase: GameState = { ...game, phase: 'weekReport' }
    rerender(
      <GameProvider>
        <LocationSheet game={reportPhase} />
      </GameProvider>
    )
    // Two mounted dialogs would double up useModalDialog's focus trap.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('actually dispatches endWeek from the dock, advancing the game past a broken/removed handler', () => {
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
})

describe('LocationSheet on desktop (static card)', () => {
  beforeEach(() => installMatchMedia(false))

  it('renders an always-visible card with the location actions and no dock, dialog, or End Week copy', () => {
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    expect(document.querySelector('.location-card')).toBeTruthy()
    expect(document.querySelector('.location-heading strong')?.textContent).toBe('Home')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.location-dock')).toBeNull()
    // The board's own End Week button serves desktop; the dock's copy would
    // be a duplicate control.
    expect(screen.queryByRole('button', { name: /^End week/i })).toBeNull()
  })

  it('swaps to the dock when the viewport crosses into mobile width', () => {
    // Regression guard carried over: a tablet rotating from desktop-width
    // landscape into mobile-width portrait must not be left on the desktop
    // layout (the old sheet once went stale here and blocked controls).
    render(
      <GameProvider>
        <LocationSheet game={freshGame()} />
      </GameProvider>
    )
    expect(document.querySelector('.location-dock')).toBeNull()

    act(() => crossBreakpoint(true))

    expect(document.querySelector('.location-dock')).toBeTruthy()
    expect(document.querySelector('.location-card')).toBeNull()
  })
})
