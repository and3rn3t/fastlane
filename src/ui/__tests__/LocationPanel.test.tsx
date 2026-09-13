import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  JOBS,
  LOCATIONS,
  newGame,
  type GameState,
  type LocationId,
  type PlayerState,
} from '@/engine'
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

function gameAt(location: LocationId, playerOverrides: Partial<PlayerState> = {}): GameState {
  const goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
  const game = newGame({ playerName: 'Tester', goals, seed: 1 })
  return {
    ...game,
    player: { ...game.player, location, ...playerOverrides },
  }
}

function jobListing(title: string) {
  // Wave 21 grouped JobBoard by workplace (ActionGroup headers), so the
  // per-job title no longer repeats "· Workplace" — exact match now that
  // it's unambiguous within its own group.
  const heading = screen.getByText(title, { selector: '.title' })
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

  it('renders each workplace header once and keeps jobs under their workplace section', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={employmentGame()} />
      </GameProvider>
    )
    const workplaces = [...new Set(JOBS.map((job) => job.workplace))]
    for (const workplace of workplaces) {
      expect(
        screen.getAllByText(LOCATIONS[workplace].name, {
          selector: '.section-label',
        })
      ).toHaveLength(1)
    }

    const burgersGroup = screen
      .getByText(LOCATIONS.burgers.name, { selector: '.section-label' })
      .closest('.action-group') as HTMLElement
    const bankGroup = screen
      .getByText(LOCATIONS.bank.name, { selector: '.section-label' })
      .closest('.action-group') as HTMLElement

    expect(within(burgersGroup).getByText('Fry Cook', { selector: '.title' })).toBeTruthy()
    expect(within(bankGroup).getByText('Financial Analyst', { selector: '.title' })).toBeTruthy()
    expect(within(burgersGroup).queryByText('Financial Analyst', { selector: '.title' })).toBeNull()
    expect(within(bankGroup).queryByText('Fry Cook', { selector: '.title' })).toBeNull()
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

describe('InsuranceActions (First Bank)', () => {
  afterEach(cleanup)

  it('shows two buyable tiers and no cancel row when uninsured', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={gameAt('bank', { insurance: 'none' })} />
      </GameProvider>
    )
    expect(screen.getAllByText('Buy (1h)')).toHaveLength(2)
    expect(screen.queryByText('Cancel (1h)')).toBeNull()
    expect(screen.getByText(/off Clinic visits and doctor's-bill mishaps/)).toBeTruthy()
  })

  it('shows Current coverage for the active tier and a cancel row once insured', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={gameAt('bank', { insurance: 'full' })} />
      </GameProvider>
    )
    expect(screen.getByText('Current coverage')).toBeTruthy()
    expect(screen.getByText('Buy (1h)')).toBeTruthy() // basic tier still buyable
    expect(screen.getByText('Cancel (1h)')).toBeTruthy()
  })
})

describe('FitnessAction (Home)', () => {
  afterEach(cleanup)

  it('shows a placeholder when the player has no apartment', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={gameAt('home', { apartment: 'none' })} />
      </GameProvider>
    )
    expect(screen.getByText(/need a place to live/)).toBeTruthy()
  })

  it('shows a peak-fitness message once fitness hits 100', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={gameAt('home', { apartment: 'secure', fitness: 100 })} />
      </GameProvider>
    )
    expect(screen.getByText(/Peak fitness/)).toBeTruthy()
  })

  it('shows remaining weekly hours and an enabled workOut button below the cap', () => {
    render(
      <GameProvider>
        <LocationPanelBody
          game={gameAt('home', {
            apartment: 'secure',
            fitness: 20,
            workedOutThisWeek: 2,
            timeLeft: 40,
          })}
        />
      </GameProvider>
    )
    const button = screen.getByText(/Work out \d+h/).closest('button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})

describe('HomeActions (Home)', () => {
  afterEach(cleanup)

  it('shows a placeholder when the player has no apartment', () => {
    render(
      <GameProvider>
        <LocationPanelBody game={gameAt('home', { apartment: 'none' })} />
      </GameProvider>
    )
    expect(screen.getByText(/Sleeping rough costs happiness/)).toBeTruthy()
  })

  it('shows a burnout note once burnout is above 0, omitted at 0', () => {
    const { unmount } = render(
      <GameProvider>
        <LocationPanelBody game={gameAt('home', { apartment: 'secure', burnout: 30 })} />
      </GameProvider>
    )
    expect(screen.getByText(/Burnout: 30\/100/)).toBeTruthy()
    unmount()

    render(
      <GameProvider>
        <LocationPanelBody game={gameAt('home', { apartment: 'secure', burnout: 0 })} />
      </GameProvider>
    )
    expect(screen.queryByText(/Burnout:/)).toBeNull()
  })
})

describe('WorkAction burnout/promotion display', () => {
  afterEach(cleanup)

  it('shows a pay-cut note once burned out, omitted at 0 burnout', () => {
    const { unmount } = render(
      <GameProvider>
        <LocationPanelBody
          game={gameAt('burgers', { jobId: 'fry-cook', burnout: 80, timeLeft: 40 })}
        />
      </GameProvider>
    )
    expect(screen.getByText(/burned out: pay cut/)).toBeTruthy()
    unmount()

    render(
      <GameProvider>
        <LocationPanelBody
          game={gameAt('burgers', { jobId: 'fry-cook', burnout: 0, timeLeft: 40 })}
        />
      </GameProvider>
    )
    expect(screen.queryByText(/burned out/)).toBeNull()
  })

  it('shows the promotion multiplier once promoted', () => {
    render(
      <GameProvider>
        <LocationPanelBody
          game={gameAt('burgers', {
            jobId: 'fry-cook',
            promotionLevel: 1,
            jobTenureWeeks: 0,
            timeLeft: 40,
          })}
        />
      </GameProvider>
    )
    expect(screen.getByText(/promoted ×1/)).toBeTruthy()
  })

  it('dispatches workOut on click', () => {
    render(
      <GameProvider>
        <LocationPanelBody
          game={gameAt('home', { apartment: 'secure', fitness: 20, timeLeft: 40 })}
        />
      </GameProvider>
    )
    const button = screen.getByText(/Work out \d+h/).closest('button') as HTMLButtonElement
    expect(() => fireEvent.click(button)).not.toThrow()
  })
})
