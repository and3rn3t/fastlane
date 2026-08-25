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

describe('save migration', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  function legacyPlayer(name: string, cash: number) {
    return {
      name,
      isAI: name !== 'Legacy',
      location: 'home',
      timeLeft: 42,
      cash,
      savings: 0,
      happiness: 60,
      education: 2,
      jobId: null,
      experience: 0,
      dress: 20,
      items: [],
      apartment: 'none',
      rentDue: 0,
      weeksBehindOnRent: 0,
      fed: 0,
      groceries: 0,
      lotteryTickets: 0,
      relaxedThisWeek: 0,
    }
  }

  it('upgrades a legacy (unversioned, pre-history) save in place — no data loss', () => {
    // No `version`, no `history` — the exact shape every save had before
    // this system and the end-of-game recap chart existed.
    const legacy = {
      week: 5,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: legacyPlayer('Legacy', 777),
      riley: legacyPlayer('Riley', 300),
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(legacy))

    renderApp()

    // Resumed the real save, not bounced to StartScreen — the $777 and
    // Week 5 prove it's the actual legacy progress, not a fresh game.
    expect(screen.getByText(/Week 5/)).toBeTruthy()
    // Cash and net worth both read $777 (no savings) — either confirms it's
    // the real legacy save, not a fresh one.
    expect(screen.getAllByText('$777').length).toBeGreaterThan(0)

    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(4)
    expect(upgraded.history).toEqual([])
    // 0 → 1 → 2 → 3 → 4 ran in sequence — every field along the way backfilled.
    expect(upgraded.player.health).toBe(100)
    expect(upgraded.player.hoursWorkedThisWeek).toBe(0)
    expect(upgraded.player.jobTenureWeeks).toBe(0)
    expect(upgraded.player.promotionLevel).toBe(0)
    expect(upgraded.player.loanBalance).toBe(0)
    expect(upgraded.player.creditScore).toBe(50)
    expect(upgraded.player.garnished).toBe(false)
  })

  it('upgrades a v1 (pre-Health) save, backfilling health in place', () => {
    const v1 = {
      version: 1,
      week: 3,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: legacyPlayer('V1Player', 555),
      riley: legacyPlayer('Riley', 300),
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v1))

    renderApp()

    expect(screen.getByText(/Week 3/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(4)
    expect(upgraded.player.health).toBe(100)
    expect(upgraded.riley.health).toBe(100)
    expect(upgraded.player.hoursWorkedThisWeek).toBe(0)
    expect(upgraded.player.promotionLevel).toBe(0)
    expect(upgraded.player.loanBalance).toBe(0)
  })

  it('upgrades a v2 (pre-Promotions) save, backfilling tenure in place', () => {
    const v2 = {
      version: 2,
      week: 4,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: { ...legacyPlayer('V2Player', 444), health: 88, hoursWorkedThisWeek: 12 },
      riley: { ...legacyPlayer('Riley', 300), health: 100, hoursWorkedThisWeek: 0 },
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v2))

    renderApp()

    expect(screen.getByText(/Week 4/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(4)
    expect(upgraded.player.health).toBe(88) // untouched by this migration
    expect(upgraded.player.jobTenureWeeks).toBe(0)
    expect(upgraded.player.promotionLevel).toBe(0)
    expect(upgraded.player.loanBalance).toBe(0)
    expect(upgraded.player.creditScore).toBe(50)
  })

  it('upgrades a v3 (pre-Loans) save, backfilling credit in place', () => {
    const v3 = {
      version: 3,
      week: 6,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: {
        ...legacyPlayer('V3Player', 333),
        health: 90,
        hoursWorkedThisWeek: 0,
        jobTenureWeeks: 6,
        promotionLevel: 1,
      },
      riley: {
        ...legacyPlayer('Riley', 300),
        health: 100,
        hoursWorkedThisWeek: 0,
        jobTenureWeeks: 0,
        promotionLevel: 0,
      },
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v3))

    renderApp()

    expect(screen.getByText(/Week 6/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(4)
    expect(upgraded.player.promotionLevel).toBe(1) // untouched by this migration
    expect(upgraded.player.loanBalance).toBe(0)
    expect(upgraded.player.loanWeeksBehind).toBe(0)
    expect(upgraded.player.creditScore).toBe(50)
    expect(upgraded.player.garnished).toBe(false)
  })

  it('falls back to a fresh game and surfaces an error toast on corrupted JSON', () => {
    localStorage.setItem('fastlane-save-v1', '{not valid json')
    renderApp()
    expect(screen.getByText(/Start new game/)).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('falls back to a fresh game on a save version newer than this build', () => {
    const fromTheFuture = {
      version: 999,
      week: 1,
      phase: 'playing',
      player: legacyPlayer('You', 200),
      riley: legacyPlayer('Riley', 200),
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(fromTheFuture))
    renderApp()
    expect(screen.getByText(/Start new game/)).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
