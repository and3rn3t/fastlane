// Property-based tests for engine-wide invariants that the example-based
// suite in engine.test.ts can only sample a handful of fixed cases for.
// Kept in a separate file so a fuzz failure is easy to tell apart from a
// hand-written regression at a glance.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AI_PROFILES, runAIWeek } from '../ai'
import { EngineError, netWorth } from '../actions'
import { ITEMS, JOBS, LOCATIONS, WEEK_TIME } from '../data'
import { applyAction, newGame } from '../engine'
import type { GameAction, GameState, Goals, ItemId, LocationId, PlayerState } from '../types'

const goals: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }

const locationIds = Object.keys(LOCATIONS) as LocationId[]
const itemIds = ITEMS.map((i) => i.id) as ItemId[]
const jobIds = JOBS.map((j) => j.id)

// Deliberately includes out-of-range amounts (negative, zero, huge) — the
// point of fuzzing is to hit EngineError's validation branches too, not just
// the happy path each action's own example-based test already covers.
const actionArb: fc.Arbitrary<GameAction> = fc.oneof(
  fc.record({ type: fc.constant('travel' as const), to: fc.constantFrom(...locationIds) }),
  fc.record({ type: fc.constant('work' as const), hours: fc.integer({ min: -2, max: 30 }) }),
  fc.record({ type: fc.constant('applyJob' as const), jobId: fc.constantFrom(...jobIds) }),
  fc.record({ type: fc.constant('quitJob' as const) }),
  fc.record({ type: fc.constant('takeClass' as const) }),
  fc.record({ type: fc.constant('buyItem' as const), itemId: fc.constantFrom(...itemIds) }),
  fc.record({ type: fc.constant('buyMeal' as const) }),
  fc.record({
    type: fc.constant('buyGroceries' as const),
    units: fc.integer({ min: -2, max: 10 }),
  }),
  fc.record({ type: fc.constant('buyLottery' as const), tickets: fc.integer({ min: -2, max: 5 }) }),
  fc.record({ type: fc.constant('deposit' as const), amount: fc.integer({ min: -50, max: 500 }) }),
  fc.record({ type: fc.constant('withdraw' as const), amount: fc.integer({ min: -50, max: 500 }) }),
  fc.record({ type: fc.constant('payRent' as const) }),
  fc.record({
    type: fc.constant('rentApartment' as const),
    tier: fc.constantFrom('basic' as const, 'secure' as const),
  }),
  fc.record({ type: fc.constant('sellItem' as const), itemId: fc.constantFrom(...itemIds) }),
  fc.record({ type: fc.constant('relax' as const), hours: fc.integer({ min: -2, max: 15 }) }),
  fc.record({ type: fc.constant('seeDoctor' as const) }),
  fc.record({ type: fc.constant('takeLoan' as const), amount: fc.integer({ min: -50, max: 500 }) }),
  fc.record({
    type: fc.constant('repayLoan' as const),
    amount: fc.integer({ min: -50, max: 500 }),
  }),
  fc.record({ type: fc.constant('playCasino' as const), bet: fc.integer({ min: -10, max: 100 }) }),
  fc.record({ type: fc.constant('endWeek' as const) }),
  fc.record({ type: fc.constant('dismissReport' as const) })
)

/** Applies an action, treating an invalid move (EngineError) as a no-op —
 * exactly how a UI would react to a rejected action, and how the AI's own
 * attempt() wrapper already treats it. Every action's require_ checks run
 * before any roll()/rollInt() call, so a rejected move never advances the
 * RNG — safe to use inside a determinism comparison. */
function tryApply(state: GameState, action: GameAction): GameState {
  try {
    return applyAction(state, action)
  } catch (e) {
    if (e instanceof EngineError) return state
    throw e
  }
}

describe('invariant: determinism', () => {
  it('same seed + same action sequence always produces identical states', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(actionArb, { maxLength: 25 }), (seed, actions) => {
        const run = () => {
          let s = newGame({ playerName: 'Fuzz', goals, seed })
          for (const action of actions) s = tryApply(s, action)
          return s
        }
        expect(run()).toEqual(run())
      })
    )
  })
})

describe('invariant: time budget', () => {
  it('timeLeft never goes negative for either player across any action sequence', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(actionArb, { maxLength: 25 }), (seed, actions) => {
        let s = newGame({ playerName: 'Fuzz', goals, seed })
        for (const action of actions) {
          s = tryApply(s, action)
          expect(s.player.timeLeft).toBeGreaterThanOrEqual(0)
          expect(s.riley.timeLeft).toBeGreaterThanOrEqual(0)
        }
      })
    )
  })
})

describe('invariant: net worth', () => {
  it('netWorth() always matches cash + savings - loanBalance — a tripwire for clone bugs', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(actionArb, { maxLength: 25 }), (seed, actions) => {
        let s = newGame({ playerName: 'Fuzz', goals, seed })
        for (const action of actions) {
          s = tryApply(s, action)
          for (const key of ['player', 'riley'] as const) {
            const p = s[key]
            expect(netWorth(p, s.economy.marketIndex)).toBe(
              Math.round(p.cash + p.savings - p.loanBalance + p.investments * s.economy.marketIndex)
            )
          }
        }
      })
    )
  })
})

describe('invariant: state immutability', () => {
  it('applyAction never mutates its input state, for any single action', () => {
    fc.assert(
      fc.property(fc.integer(), actionArb, (seed, action) => {
        const s0 = newGame({ playerName: 'Fuzz', goals, seed })
        const before = structuredClone(s0)
        tryApply(s0, action)
        expect(s0).toEqual(before)
      })
    )
  })
})

// Loosely bounded, not restricted to states reachable from real play — the
// point is to drive ai.ts's many small guard branches (ensureFood's
// shortfall check, ensureHousing's can't-afford-rent check, etc.) far more
// thoroughly than the handful of hand-written "Riley AI" sanity tests can,
// since that file's branch coverage lags the rest of the engine.
function randomPlayerArb(): fc.Arbitrary<PlayerState> {
  return fc.record({
    name: fc.constant('Fuzz'),
    isAI: fc.constant(true),
    location: fc.constant<'home'>('home'),
    timeLeft: fc.constant(WEEK_TIME),
    cash: fc.integer({ min: 0, max: 3000 }),
    savings: fc.integer({ min: 0, max: 3000 }),
    happiness: fc.integer({ min: 0, max: 100 }),
    education: fc.integer({ min: 0, max: 30 }),
    jobId: fc.constantFrom(null, ...jobIds),
    experience: fc.integer({ min: 0, max: 300 }),
    dress: fc.integer({ min: 0, max: 100 }),
    items: fc.constant([]),
    apartment: fc.constantFrom('none' as const, 'basic' as const, 'secure' as const),
    rentDue: fc.integer({ min: 0, max: 300 }),
    weeksBehindOnRent: fc.integer({ min: 0, max: 2 }),
    fed: fc.integer({ min: 0, max: 6 }),
    groceries: fc.integer({ min: 0, max: 6 }),
    lotteryTickets: fc.constant(0),
    relaxedThisWeek: fc.constant(0),
    health: fc.integer({ min: 0, max: 100 }),
    hoursWorkedThisWeek: fc.constant(0),
    jobTenureWeeks: fc.integer({ min: 0, max: 20 }),
    promotionLevel: fc.integer({ min: 0, max: 3 }),
    loanBalance: fc.integer({ min: 0, max: 1000 }),
    loanWeeksBehind: fc.integer({ min: 0, max: 2 }),
    creditScore: fc.integer({ min: 0, max: 100 }),
    garnished: fc.boolean(),
    loanPaidThisWeek: fc.constant(false),
    skills: fc.record({
      sales: fc.integer({ min: 0, max: 100 }),
      trades: fc.integer({ min: 0, max: 100 }),
      tech: fc.integer({ min: 0, max: 100 }),
    }),
    investments: fc.integer({ min: 0, max: 2000 }),
    activeEvents: fc.constant([]),
  })
}

describe('invariant: Riley AI robustness', () => {
  it('runAIWeek never throws and always respects the time budget, from any starting state', () => {
    fc.assert(
      fc.property(fc.integer(), randomPlayerArb(), (seed, rileyStart) => {
        const s = newGame({ playerName: 'P', goals, seed })
        s.riley = rileyStart
        expect(() => runAIWeek(s, 'riley', AI_PROFILES.balanced)).not.toThrow()
        expect(s.riley.timeLeft).toBeGreaterThanOrEqual(0)
        expect(s.riley.timeLeft).toBeLessThanOrEqual(WEEK_TIME)
      })
    )
  })

  it('runAIWeek is itself deterministic for a given starting state and RNG seed', () => {
    fc.assert(
      fc.property(fc.integer(), randomPlayerArb(), (seed, rileyStart) => {
        const run = () => {
          const s = newGame({ playerName: 'P', goals, seed })
          s.riley = structuredClone(rileyStart)
          runAIWeek(s, 'riley', AI_PROFILES.balanced)
          return s
        }
        expect(run()).toEqual(run())
      })
    )
  })
})
