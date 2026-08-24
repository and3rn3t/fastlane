import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'
import { GameProvider } from '@/state/GameContext'

function renderApp() {
  return render(
    <GameProvider>
      <App />
    </GameProvider>
  )
}

describe('App', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('shows the start screen and starts a game', () => {
    renderApp()
    expect(screen.getByText(/Start new game/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Start new game/))
    expect(screen.getByText(/Week 1/)).toBeTruthy()
    expect(screen.getAllByText(/Job Center/).length).toBeGreaterThan(0)
  })

  it('travels, applies for a job, and works a shift', () => {
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))

    // Travel to the Job Center and take the fry cook job.
    fireEvent.click(screen.getByRole('button', { name: /Job Center/ }))
    const applyButtons = screen.getAllByRole('button', { name: /Apply \(2h\)/ })
    fireEvent.click(applyButtons[0]) // Fry Cook listing is first
    // Commute to Burger Barn and work.
    fireEvent.click(screen.getByRole('button', { name: /Burger Barn/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Work \d+h/ }))
    expect(screen.getByText(/Worked \d+h as Fry Cook/)).toBeTruthy()
  })

  it("ends the week, plays Riley's turn back, and shows the report", () => {
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    // Dismiss the auto-opened Help dialog first so it doesn't shadow the report below.
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }))
    fireEvent.click(screen.getByRole('button', { name: /End week/ }))
    // Riley's turn replays before the report — skip it to reach the dialog,
    // same as a player would.
    expect(screen.getByRole('button', { name: /Skip/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    expect(screen.getByRole('dialog', { name: /Week 1 report/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Start week 2/ }))
    expect(screen.getByText(/Week 2/)).toBeTruthy()
  })

  it('persists the game to localStorage', () => {
    const first = renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    expect(localStorage.getItem('fastlane-save-v1')).toBeTruthy()
    first.unmount()
    renderApp()
    expect(screen.getByText(/Week 1/)).toBeTruthy() // resumed, not start screen
  })

  it('shows help automatically once, then only via the ? button', () => {
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    expect(screen.getByRole('dialog', { name: /How to play/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }))
    expect(screen.queryByRole('dialog', { name: /How to play/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Help$/i }))
    expect(screen.getByRole('dialog', { name: /How to play/i })).toBeTruthy()
  })
})
