import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameProvider, SAVE_KEY } from '@/state/GameContext'
import { StartScreen } from '@/ui/StartScreen'

function renderStartScreen() {
  return render(
    <GameProvider>
      <StartScreen />
    </GameProvider>
  )
}

function savedPlayerOriginId(): string {
  return JSON.parse(localStorage.getItem(SAVE_KEY)!).player.originId
}

describe('StartScreen origin picker', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('defaults to the neutral Career Changer origin', () => {
    renderStartScreen()
    expect(screen.getByText(/no head start, no handicap/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Start new game/))
    expect(savedPlayerOriginId()).toBe('career-changer')
  })

  it('selecting a different background updates the shown blurb and threads through to the started game', () => {
    renderStartScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Veteran' }))
    expect(screen.getByText(/service stipend/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Start new game/))
    expect(savedPlayerOriginId()).toBe('veteran')
  })

  it('does not apply the chosen origin to the Daily Challenge, which stays identical for everyone', () => {
    renderStartScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Trust Fund Kid' }))
    fireEvent.click(screen.getByText(/Play today's challenge/))
    expect(savedPlayerOriginId()).toBe('career-changer')
  })
})
