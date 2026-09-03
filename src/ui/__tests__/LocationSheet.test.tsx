import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newGame, type GameState } from '@/engine'
import { GameProvider } from '@/state/GameContext'
import { LocationSheet } from '@/ui/LocationSheet'

function freshGame(): GameState {
  const goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
  return newGame({ playerName: 'Tester', goals, seed: 1 })
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
