import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { newGame, type GameState, type PlayerState } from '@/engine'
import { GameProvider } from '@/state/GameContext'
import { LocationPanelBody } from '@/ui/LocationPanel'

function employmentGame(playerOverrides: Partial<PlayerState> = {}): GameState {
  const goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
  const game = newGame({ playerName: 'Tester', goals, seed: 1 })
  return {
    ...game,
    player: { ...game.player, location: 'employment', ...playerOverrides },
  }
}

function jobListing(title: string) {
  const heading = screen.getByText(new RegExp(`^${title} ·`))
  // .job-listing is the shared ancestor row — the requirement chips and the
  // Apply button both live inside it, not inside the title itself.
  return within(heading.closest('.job-listing') as HTMLElement)
}

describe('JobBoard requirement checklist', () => {
  afterEach(cleanup)

  it('renders a met requirement with progress text and a check icon', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={employmentGame({ dress: 20 })} />
      </GameProvider>
    )
    // Fry Cook only gates on dress (minDress 10) — a fresh player's starting
    // dress (20) already clears it.
    const row = jobListing('Fry Cook')
    expect(row.getByText(/Dress 20\/10/)).toBeTruthy()
    expect(row.getByText(/^Met:/)).toBeTruthy()
  })

  it('renders an unmet requirement with progress text and "Not met" status', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={employmentGame({ dress: 0 })} />
      </GameProvider>
    )
    const row = jobListing('Fry Cook')
    expect(row.getByText(/Dress 0\/10/)).toBeTruthy()
    expect(row.getByText(/^Not met:/)).toBeTruthy()
  })

  it('renders the Computer requirement as a plain label, not a numeric fraction', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={employmentGame()} />
      </GameProvider>
    )
    // Financial Analyst (First Bank) requires a computer — no owned
    // computer here, so it should read just "Computer", never "Computer 0/1".
    const row = jobListing('Financial Analyst')
    expect(row.getByText('Computer')).toBeTruthy()
    expect(row.queryByText(/Computer \d+\/\d+/)).toBeNull()
  })

  it('floors fractional skill progress instead of rounding it up to the threshold', () => {
    // Store Manager needs 40 sales skill. 39.6 must not display as "40/40"
    // next to a lock — Math.round would show that, Math.floor (matching
    // week.ts's own skill-gain log) correctly shows "39/40".
    render(
      <GameProvider>
        <LocationPanelBody
          game={employmentGame({
            dress: 100,
            education: 100,
            experience: 1000,
            skills: { sales: 39.6, trades: 0, tech: 0 },
          })}
        />
      </GameProvider>
    )
    const row = jobListing('Store Manager')
    expect(row.getByText(/Sales skill 39\/40/)).toBeTruthy()
    expect(row.queryByText(/Sales skill 40\/40/)).toBeNull()
    expect(row.getByText(/^Not met:/)).toBeTruthy()
  })

  it('marks a waived requirement during a layoff as met, with a "(waived)" note', () => {
    render(
      <GameProvider>
        <LocationPanelBody
          game={employmentGame({
            dress: 0,
            activeEvents: [{ chainId: 'layoff', stage: 0, weeksInStage: 0 }],
          })}
        />
      </GameProvider>
    )
    const row = jobListing('Fry Cook')
    expect(row.getByText(/Dress 0\/10 \(waived\)/)).toBeTruthy()
    expect(row.getByText(/^Met:/)).toBeTruthy()
  })
})
