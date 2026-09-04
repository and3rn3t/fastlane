import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRegisterSW } from 'virtual:pwa-register/react'
import App from '@/App'
import { GameProvider } from '@/state/GameContext'
import { reportError } from '@/telemetry'

// virtual:pwa-register/react does real navigator.serviceWorker/workbox-window
// work that isn't meaningful in jsdom — mocked so UpdateToast's own behavior
// (needRefresh, reload, dismiss, registration-error reporting) can be
// exercised directly instead of depending on whatever a real registration
// attempt happens to no-op into. A per-test mockImplementation below can
// still back it with real React state where a test needs re-renders.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn().mockReturnValue({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))
vi.mock('@/telemetry', () => ({ reportError: vi.fn() }))

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
    // Matches twice on purpose: once in the (collapsed) event log, and once
    // in the visually-hidden aria-live announcer added for screen readers.
    expect(screen.getAllByText(/Worked \d+h as Fry Cook/)).toHaveLength(2)
  })

  it("ends the week, plays Riley's turn back, and shows the report", async () => {
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    // Dismiss the auto-opened Help dialog first so it doesn't shadow the report below.
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }))
    fireEvent.click(screen.getByRole('button', { name: /End week/ }))
    // Riley's turn replays before the report — skip it to reach the dialog,
    // same as a player would.
    expect(screen.getByRole('button', { name: /Skip/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    // WeekReportModal is lazy-loaded (Wave 5 perf item) — findByRole awaits
    // the dynamic import resolving instead of assuming it's already mounted.
    expect(await screen.findByRole('dialog', { name: /Week 1 report/i })).toBeTruthy()
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

  it('shows a next-step hint, dismisses it, and updates it once the suggested action is taken', () => {
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }))

    // A fresh player is hungry (0 fed, 0 groceries) — the hint should say so.
    expect(screen.getByText(/Running low on food/)).toBeTruthy()

    // Dismissing hides this specific suggestion.
    fireEvent.click(screen.getByRole('button', { name: /Dismiss suggestion/i }))
    expect(screen.queryByText(/Running low on food/)).toBeNull()

    // Resolving the actual shortfall (buy enough groceries at MegaMart)
    // recomputes the hint — it's no longer the food suggestion, proving the
    // hint tracks live state rather than being dismissed-forever or static.
    fireEvent.click(screen.getByRole('button', { name: /MegaMart/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Buy \d+/ }))
    expect(screen.queryByText(/Running low on food/)).toBeNull()
  })

  it('shows a recent-failure hint after a bad week, taking priority over the forward-looking hint', async () => {
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }))

    // A fresh player never eats, so week 1's upkeep logs "went hungry" —
    // same setup the forward-looking hint test above starts from.
    fireEvent.click(screen.getByRole('button', { name: /End week/ }))
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    await screen.findByRole('dialog', { name: /Week 1 report/i })
    fireEvent.click(screen.getByRole('button', { name: /Start week 2/ }))

    // The reactive "you went hungry last week" hint wins over the generic
    // forward-looking "Running low on food" one — both would otherwise apply.
    expect(screen.getByText(/You went hungry last week/)).toBeTruthy()
    expect(screen.queryByText(/Running low on food/)).toBeNull()

    // Dismisses the same way the forward-looking hint does.
    fireEvent.click(screen.getByRole('button', { name: /Dismiss suggestion/i }))
    expect(screen.queryByText(/You went hungry last week/)).toBeNull()

    // The player still hasn't eaten, so week 2 logs the same "went hungry"
    // keyword again. The hint's dismiss key includes the report's week
    // number specifically so this recurrence isn't shadowed by the week 1
    // dismissal above — without that, this would incorrectly stay hidden.
    fireEvent.click(screen.getByRole('button', { name: /End week/ }))
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    await screen.findByRole('dialog', { name: /Week 2 report/i })
    fireEvent.click(screen.getByRole('button', { name: /Start week 3/ }))
    expect(screen.getByText(/You went hungry last week/)).toBeTruthy()
  })

  it('shows a job-switch nudge for a free upgrade, and "Switch now" travels there', () => {
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }))

    // A fresh, job-less player already qualifies for Stocker at MegaMart
    // (no requirements) — the nudge should surface it alongside the
    // unrelated food hint, not replace it.
    expect(screen.getByText(/You now qualify for Stocker at MegaMart/)).toBeTruthy()
    expect(screen.getByText(/Running low on food/)).toBeTruthy()

    // "Switch now" can't apply immediately (not at Employment, no phone) —
    // it travels there instead, same first-step logic the AI itself uses.
    fireEvent.click(screen.getByRole('button', { name: /Switch now/ }))
    expect(screen.getByText(/Browse openings across town and apply/)).toBeTruthy()

    // Dismissing hides it independently of the food hint.
    fireEvent.click(screen.getByRole('button', { name: /Dismiss job suggestion/i }))
    expect(screen.queryByText(/You now qualify for Stocker at MegaMart/)).toBeNull()
    expect(screen.getByText(/Running low on food/)).toBeTruthy()
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
    expect(upgraded.version).toBe(10)
    expect(upgraded.history).toEqual([])
    // 0 → 1 → 2 → 3 → 4 ran in sequence — every field along the way backfilled.
    expect(upgraded.player.health).toBe(100)
    expect(upgraded.player.hoursWorkedThisWeek).toBe(0)
    expect(upgraded.player.jobTenureWeeks).toBe(0)
    expect(upgraded.player.promotionLevel).toBe(0)
    expect(upgraded.player.loanBalance).toBe(0)
    expect(upgraded.player.creditScore).toBe(50)
    expect(upgraded.player.garnished).toBe(false)
    expect(upgraded.rileyProfile).toBe('balanced')
    expect(upgraded.rules).toEqual({ eventFrequency: 1, economyVolatility: 1, startingCash: 200 })
    expect(upgraded.isDailyChallenge).toBe(false)
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
    expect(upgraded.version).toBe(10)
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
    expect(upgraded.version).toBe(10)
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
    expect(upgraded.version).toBe(10)
    expect(upgraded.player.promotionLevel).toBe(1) // untouched by this migration
    expect(upgraded.player.loanBalance).toBe(0)
    expect(upgraded.player.loanWeeksBehind).toBe(0)
    expect(upgraded.player.creditScore).toBe(50)
    expect(upgraded.player.garnished).toBe(false)
    expect(upgraded.rileyProfile).toBe('balanced')
  })

  it('upgrades a v4 (pre-AI-personalities) save, defaulting Riley to Balanced', () => {
    const v4 = {
      version: 4,
      week: 7,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: {
        ...legacyPlayer('V4Player', 222),
        loanBalance: 500,
        loanWeeksBehind: 1,
        creditScore: 42,
        garnished: false,
        loanPaidThisWeek: false,
      },
      riley: {
        ...legacyPlayer('Riley', 300),
        loanBalance: 0,
        loanWeeksBehind: 0,
        creditScore: 50,
        garnished: false,
        loanPaidThisWeek: false,
      },
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v4))

    renderApp()

    expect(screen.getByText(/Week 7/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(10)
    expect(upgraded.player.loanBalance).toBe(500) // untouched by this migration
    expect(upgraded.rileyProfile).toBe('balanced')
    expect(upgraded.rules).toEqual({ eventFrequency: 1, economyVolatility: 1, startingCash: 200 })
  })

  it('upgrades a v5 (pre-Rule-presets) save, defaulting to Classic rules', () => {
    const v5 = {
      version: 5,
      week: 8,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: legacyPlayer('V5Player', 111),
      riley: legacyPlayer('Riley', 300),
      rileyProfile: 'hustler',
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v5))

    renderApp()

    expect(screen.getByText(/Week 8/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(10)
    expect(upgraded.rileyProfile).toBe('hustler') // untouched by this migration
    expect(upgraded.rules).toEqual({ eventFrequency: 1, economyVolatility: 1, startingCash: 200 })
    expect(upgraded.isDailyChallenge).toBe(false)
  })

  it('upgrades a v6 (pre-Daily-challenge) save, defaulting isDailyChallenge to false', () => {
    const v6 = {
      version: 6,
      week: 9,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: legacyPlayer('V6Player', 99),
      riley: legacyPlayer('Riley', 300),
      rileyProfile: 'balanced',
      rules: { eventFrequency: 1.5, economyVolatility: 1.5, startingCash: 100 },
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v6))

    renderApp()

    expect(screen.getByText(/Week 9/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(10)
    expect(upgraded.rules.startingCash).toBe(100) // untouched by this migration
    expect(upgraded.isDailyChallenge).toBe(false)
  })

  it('upgrades a v7 (pre-Riley-difficulty) save, defaulting rileyDifficulty to normal', () => {
    const v7 = {
      version: 7,
      week: 10,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: { priceIndex: 1, wageIndex: 1, interestRate: 0.005, lotteryJackpot: 500 },
      player: legacyPlayer('V7Player', 88),
      riley: legacyPlayer('Riley', 300),
      rileyProfile: 'scholar',
      rules: { eventFrequency: 1, economyVolatility: 1, startingCash: 200 },
      isDailyChallenge: false,
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v7))

    renderApp()

    expect(screen.getByText(/Week 10/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(10)
    expect(upgraded.rileyProfile).toBe('scholar') // untouched by this migration
    expect(upgraded.rileyDifficulty).toBe('normal')
  })

  it('upgrades a v8 save, normalizing skills and defaulting new fields', () => {
    const v8 = {
      version: 8,
      week: 11,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: {
        priceIndex: 1,
        wageIndex: 1,
        interestRate: 0.005,
        lotteryJackpot: 500,
        marketIndex: 0,
      },
      player: {
        ...legacyPlayer('V8Player', 77),
        skills: { sales: 'oops', trades: 180, tech: -3 },
        investments: -50,
        activeEvents: [null],
      },
      riley: legacyPlayer('Riley', 300),
      rileyProfile: 'hustler',
      rileyDifficulty: 'easy',
      rules: { eventFrequency: 1, economyVolatility: 1, startingCash: 200 },
      isDailyChallenge: false,
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v8))

    renderApp()

    expect(screen.getByText(/Week 11/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(10)
    expect(upgraded.rileyDifficulty).toBe('easy') // untouched by this migration
    expect(upgraded.economy.marketIndex).toBe(1)
    expect(upgraded.player.skills).toEqual({ sales: 0, trades: 100, tech: 0 })
    expect(upgraded.player.investments).toBe(0)
    expect(upgraded.player.activeEvents).toEqual([])
  })

  it('upgrades a v9 (pre-rivalry-momentum) save, defaulting rileyMomentum to even', () => {
    // A genuine v9 save already has every field migrations 1-9 add — unlike
    // the v1-v8 tests above, this one isn't exercising those migrations, so
    // the fixture needs to actually be v9-shaped (bare legacyPlayer() is v0-
    // shaped) rather than relying on a migration this save claims is already
    // done. Real-world relevance: GameScreen's Next-step hint bar now clones
    // the active player on every render (previewNextAction), so a save
    // missing these fields crashes immediately instead of limping along
    // undetected — and both player and riley need to be v9-shaped here since
    // this fixture is reused as both.
    const v9Fields = {
      health: 100,
      hoursWorkedThisWeek: 0,
      jobTenureWeeks: 0,
      promotionLevel: 0,
      loanBalance: 0,
      loanWeeksBehind: 0,
      creditScore: 50,
      garnished: false,
      loanPaidThisWeek: false,
      skills: { sales: 0, trades: 0, tech: 0 },
      investments: 0,
      activeEvents: [],
    }
    const v9 = {
      version: 9,
      week: 12,
      rngSeed: 1,
      phase: 'playing',
      winner: null,
      goals: { wealth: 4000, happiness: 70, education: 12, career: 30 },
      economy: {
        priceIndex: 1,
        wageIndex: 1,
        interestRate: 0.005,
        lotteryJackpot: 500,
        marketIndex: 1,
      },
      player: { ...legacyPlayer('V9Player', 99), ...v9Fields },
      riley: { ...legacyPlayer('Riley', 300), ...v9Fields },
      rileyProfile: 'gambler',
      rileyDifficulty: 'hard',
      rules: { eventFrequency: 1, economyVolatility: 1, startingCash: 200 },
      isDailyChallenge: false,
      headline: 'A new life in the fast lane begins.',
      log: [],
      lastReport: null,
      history: [],
    }
    localStorage.setItem('fastlane-save-v1', JSON.stringify(v9))

    renderApp()

    expect(screen.getByText(/Week 12/)).toBeTruthy()
    const upgraded = JSON.parse(localStorage.getItem('fastlane-save-v1')!)
    expect(upgraded.version).toBe(10)
    expect(upgraded.rileyProfile).toBe('gambler') // untouched by this migration
    expect(upgraded.rileyMomentum).toBe('even')
  })

  it('falls back to a fresh game and surfaces an error toast on corrupted JSON', () => {
    localStorage.setItem('fastlane-save-v1', '{not valid json')
    renderApp()
    expect(screen.getByText(/Start new game/)).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('dismisses the error toast via its own button, not just auto-timeout', () => {
    localStorage.setItem('fastlane-save-v1', '{not valid json')
    renderApp()
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }))
    expect(screen.queryByRole('alert')).toBeNull()
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

  it('keeps the default pawn on the Daily Challenge even with the New Look perk unlocked', () => {
    localStorage.setItem(
      'fastlane-stats-v1',
      JSON.stringify({
        gamesPlayed: 1,
        gamesWon: 1,
        gamesLost: 0,
        fastestWinWeeks: 10,
        unlockedAchievements: [],
        lastRecordedSeed: null,
        incidents: { layoffs: 0, thefts: 0, evictions: 0, robberies: 0, garnishments: 0 },
      })
    )
    renderApp()
    fireEvent.click(screen.getByText(/Play today's challenge/))
    expect(screen.getByLabelText('You is here').textContent).toBe('🙂')
  })
})

describe('UpdateToast', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    vi.mocked(useRegisterSW).mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    })
  })

  it('shows nothing when no update is available (the default)', () => {
    renderApp()
    expect(screen.queryByText(/new version/i)).toBeNull()
  })

  it('shows the toast and calls updateServiceWorker(true) when Reload is clicked', () => {
    const updateServiceWorker = vi.fn()
    vi.mocked(useRegisterSW).mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    })
    renderApp()

    expect(screen.getByText(/new version/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('dismissing hides the toast without reloading', () => {
    // Backed by real React state (not a static mock return) so clicking
    // dismiss's setNeedRefresh(false) actually re-renders — verifies the
    // toast reacts to its own setter, not just that the setter was called.
    vi.mocked(useRegisterSW).mockImplementation(() => {
      const [needRefresh, setNeedRefresh] = useState(true)
      return {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      }
    })
    renderApp()

    expect(screen.getByText(/new version/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }))
    expect(screen.queryByText(/new version/i)).toBeNull()
  })

  it('reports a registration error via telemetry instead of failing silently', () => {
    vi.mocked(useRegisterSW).mockImplementation((options) => {
      options?.onRegisterError?.(new Error('registration failed'))
      return {
        needRefresh: [false, vi.fn()],
        offlineReady: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      }
    })
    renderApp()
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'service-worker-registration')
  })
})

describe('Daily Challenge deep link (?daily=1)', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/?daily=1')
  })
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
  })

  it('auto-starts the Daily Challenge from a fresh visit and cleans the URL', () => {
    renderApp()
    expect(screen.getByText(/Week 1/)).toBeTruthy()
    expect(window.location.search).toBe('')
  })

  it('does not re-trigger on a later render once the URL is already clean', () => {
    // The effect only ever looks at the URL on mount — verifies that
    // finishing the auto-start also actually removed ?daily=1, so a
    // same-session re-render (e.g. dispatching another action) can't
    // accidentally re-read a stale query string and restart the game.
    renderApp()
    expect(screen.getByText(/Week 1/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Job Center/ }))
    expect(screen.getByText(/Week 1/)).toBeTruthy()
  })

  it('confirms before abandoning an existing, different save', () => {
    // Arrange with a clean URL — the shared beforeEach's ?daily=1 would
    // otherwise auto-start a save before "Start new game" is even clickable.
    window.history.replaceState(null, '', '/')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderApp()
    fireEvent.click(screen.getByText(/Start new game/))
    expect(screen.getByText(/Week 1/)).toBeTruthy()

    window.history.replaceState(null, '', '/?daily=1')
    render(
      <GameProvider>
        <App />
      </GameProvider>
    )

    expect(confirmSpy).toHaveBeenCalled()
    // Declined — the original (non-daily) save is untouched.
    expect(screen.queryAllByText(/Daily Challenge #/)).toHaveLength(0)
    confirmSpy.mockRestore()
  })

  it("skips the confirm entirely when the existing save is already today's Daily Challenge", () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderApp() // auto-starts today's challenge via the ?daily=1 in beforeEach

    window.history.replaceState(null, '', '/?daily=1')
    render(
      <GameProvider>
        <App />
      </GameProvider>
    )

    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
