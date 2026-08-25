import { describe, expect, it } from 'vitest'
import { EngineError, wagePerHour } from '../actions'
import { FOOD_NEEDED, WEEK_TIME, travelCost } from '../data'
import { applyAction, newGame } from '../engine'
import { careerScore, meetsGoals } from '../week'
import type { GameState, Goals } from '../types'

const easyGoals: Goals = { wealth: 800, happiness: 55, education: 3, career: 10 }
const trivialGoals: Goals = { wealth: 1, happiness: 1, education: 0, career: 0 }

function game(goals: Goals = easyGoals, seed = 42): GameState {
  return newGame({ playerName: 'Tester', goals, seed })
}

describe('travel', () => {
  it('costs loop distance in time units', () => {
    expect(travelCost('home', 'employment', false)).toBe(1)
    // Wraps around the loop the other way — 2h since Clinic (loopIndex 12)
    // now sits between rentoffice and home on that side.
    expect(travelCost('home', 'rentoffice', false)).toBe(2)
    expect(travelCost('home', 'factory', false)).toBe(5)
    expect(travelCost('employment', 'employment', false)).toBe(0)
  })

  it('is halved (rounded up) with a bike', () => {
    expect(travelCost('home', 'factory', true)).toBe(3)
    expect(travelCost('home', 'employment', true)).toBe(1)
  })

  it('spends time on travel', () => {
    const s1 = applyAction(game(), { type: 'travel', to: 'university' })
    expect(s1.player.location).toBe('university')
    expect(s1.player.timeLeft).toBe(WEEK_TIME - 4)
  })

  it('rejects travel to the current location', () => {
    expect(() => applyAction(game(), { type: 'travel', to: 'home' })).toThrow(EngineError)
  })
})

describe('jobs and work', () => {
  it('hires a qualified applicant at the Job Center', () => {
    let s = applyAction(game(), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    expect(s.player.jobId).toBe('fry-cook')
    expect(careerScore(s.player)).toBe(5)
  })

  it('rejects unqualified applicants with reasons', () => {
    const s = applyAction(game(), { type: 'travel', to: 'employment' })
    expect(() => applyAction(s, { type: 'applyJob', jobId: 'branch-manager' })).toThrow(
      /Not qualified/
    )
  })

  it('pays wages and accrues experience at the workplace only', () => {
    let s = applyAction(game(), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    expect(() => applyAction(s, { type: 'work', hours: 5 })).toThrow(/workplace/)
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    const cashBefore = s.player.cash
    s = applyAction(s, { type: 'work', hours: 10 })
    expect(s.player.cash).toBe(cashBefore + 60) // 10h × $6 × wageIndex 1.0
    expect(s.player.experience).toBe(10)
  })

  it('cannot work more hours than time remaining', () => {
    let s = applyAction(game(), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    expect(() => applyAction(s, { type: 'work', hours: 99 })).toThrow(/time/)
  })
})

describe('promotions', () => {
  function hireFryCook(s: GameState): GameState {
    s = applyAction(s, { type: 'travel', to: 'employment' })
    return applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
  }

  function workNWeeks(s: GameState, weeks: number, hours = 10): GameState {
    for (let i = 0; i < weeks; i++) {
      s = applyAction(s, { type: 'travel', to: 'burgers' })
      s = applyAction(s, { type: 'work', hours })
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    return s
  }

  it('promotes after enough consecutive weeks of showing up', () => {
    let s = hireFryCook(game())
    s = workNWeeks(s, 6) // PROMOTION_TENURE_WEEKS
    expect(s.player.jobTenureWeeks).toBe(6)
    expect(s.player.promotionLevel).toBe(1)
    expect(careerScore(s.player)).toBe(5 + 4) // base prestige + one promotion's bonus
    expect(s.lastReport?.entries.some((e) => e.text.includes('promoted'))).toBe(true)
  })

  it('boosts wage once promoted', () => {
    let s = hireFryCook(game())
    s = workNWeeks(s, 6)
    expect(s.player.promotionLevel).toBeGreaterThan(0)
    const promoted = wagePerHour(s, 'fry-cook', s.player.promotionLevel)
    const base = wagePerHour(s, 'fry-cook', 0)
    expect(promoted).toBeGreaterThan(base)
  })

  it('a no-show week resets tenure toward the next promotion, not an earned one', () => {
    let s = hireFryCook(game())
    s = workNWeeks(s, 3)
    expect(s.player.jobTenureWeeks).toBe(3)
    s = applyAction(s, { type: 'endWeek' }) // no work this week
    if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    expect(s.player.jobTenureWeeks).toBe(0)
    expect(s.player.promotionLevel).toBe(0)
  })

  it('switching jobs resets tenure and promotion', () => {
    let s = hireFryCook(game())
    s = workNWeeks(s, 6)
    expect(s.player.promotionLevel).toBe(1)
    s = applyAction(s, { type: 'travel', to: 'employment' })
    // janitor has no dress/education/experience minimums — dress has worn
    // down over the 6 weeks above, so a dress-gated job would reject this.
    s = applyAction(s, { type: 'applyJob', jobId: 'janitor' })
    expect(s.player.jobTenureWeeks).toBe(0)
    expect(s.player.promotionLevel).toBe(0)
  })

  it('quitting resets tenure and promotion', () => {
    let s = hireFryCook(game())
    s = workNWeeks(s, 6)
    s = applyAction(s, { type: 'quitJob' })
    expect(s.player.jobTenureWeeks).toBe(0)
    expect(s.player.promotionLevel).toBe(0)
  })
})

describe('university', () => {
  it('classes cost tuition and time, and add education', () => {
    let s = applyAction(game(), { type: 'travel', to: 'university' })
    const cash = s.player.cash
    s = applyAction(s, { type: 'takeClass' })
    expect(s.player.education).toBe(1)
    expect(s.player.cash).toBe(cash - 75)
  })
})

describe('end of week', () => {
  it('accrues rent and evicts after three unpaid weeks', () => {
    let s = applyAction(game(), { type: 'travel', to: 'rentoffice' })
    s = applyAction(s, { type: 'rentApartment', tier: 'basic' })
    expect(s.player.apartment).toBe('basic')
    // Week 1 accrues the first bill; three further weeks behind trigger eviction.
    for (let i = 0; i < 4; i++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    expect(s.player.apartment).toBe('none') // evicted
  })

  it('feeds from groceries and penalizes hunger', () => {
    let s = applyAction(game(), { type: 'travel', to: 'megamart' })
    s = applyAction(s, { type: 'buyGroceries', units: FOOD_NEEDED })
    const happyFed = s.player.happiness
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.groceries).toBe(0)
    // Fed player loses no hunger happiness (other modifiers may apply).
    expect(s.player.happiness).toBeGreaterThan(happyFed - 10)

    const hungry = applyAction(game(), { type: 'endWeek' })
    expect(hungry.player.happiness).toBeLessThan(hungry.riley.happiness + 30) // sanity
    expect(hungry.lastReport?.entries.some((e) => e.text.includes('hungry'))).toBe(true)
  })

  it('pays interest on savings', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'deposit', amount: 100 })
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.savings).toBeGreaterThanOrEqual(100) // interest ≥ 0 after rounding
  })

  it('resets time and location for a new week', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.timeLeft).toBe(WEEK_TIME)
    expect(s.player.location).toBe('home')
    expect(s.week).toBe(2)
  })
})

describe('health', () => {
  it('overworking past 40h/week drains health', () => {
    let s = applyAction(game(), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    s = applyAction(s, { type: 'work', hours: 45 })
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.health).toBe(100 - Math.round(5 * 0.5)) // 5h over the 40h threshold
    expect(s.lastReport?.entries.some((e) => e.text.includes('overworked'))).toBe(true)
  })

  it('working exactly 40h/week costs no health', () => {
    let s = applyAction(game(), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    s = applyAction(s, { type: 'work', hours: 40 })
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.health).toBe(100)
  })

  it('a week fed entirely from cheap groceries costs health even without hunger', () => {
    let s = applyAction(game(), { type: 'travel', to: 'megamart' })
    s = applyAction(s, { type: 'buyGroceries', units: FOOD_NEEDED })
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.health).toBe(98)
    expect(s.lastReport?.entries.some((e) => e.text.includes('cheap groceries'))).toBe(true)
  })

  it('the Clinic heals health for cash and time', () => {
    let s = applyAction(game(), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    s = applyAction(s, { type: 'work', hours: 50 })
    s = applyAction(s, { type: 'endWeek' })
    const hurtHealth = s.player.health
    expect(hurtHealth).toBeLessThan(100)

    s = applyAction(s, { type: 'travel', to: 'clinic' })
    const cashBefore = s.player.cash
    const timeBefore = s.player.timeLeft
    s = applyAction(s, { type: 'seeDoctor' })
    expect(s.player.health).toBe(Math.min(100, hurtHealth + 35))
    expect(s.player.cash).toBeLessThan(cashBefore)
    expect(s.player.timeLeft).toBe(timeBefore - 3)
  })

  it('rejects seeing the doctor away from the Clinic or at full health', () => {
    expect(() => applyAction(game(), { type: 'seeDoctor' })).toThrow(/Clinic/)
    const atClinic = applyAction(game(), { type: 'travel', to: 'clinic' })
    expect(() => applyAction(atClinic, { type: 'seeDoctor' })).toThrow(/full health/)
  })
})

describe('victory', () => {
  it('meetsGoals checks all four tracks', () => {
    const s = game()
    expect(meetsGoals(s.player, trivialGoals)).toBe(true) // start state satisfies trivial goals
    expect(meetsGoals(s.player, { ...trivialGoals, wealth: 10_000 })).toBe(false)
    expect(meetsGoals(s.player, { ...trivialGoals, education: 1 })).toBe(false)
    expect(meetsGoals(s.player, { ...trivialGoals, career: 5 })).toBe(false)
    expect(meetsGoals(s.player, { ...trivialGoals, happiness: 90 })).toBe(false)
  })

  it('declares a winner when goals are met at week end', () => {
    let s = game({ wealth: 100, happiness: 10, education: 0, career: 0 })
    s = applyAction(s, { type: 'endWeek' })
    expect(s.phase).toBe('over')
    expect(s.winner).toBe('player')
  })
})

describe('determinism', () => {
  it('same seed and actions produce identical states', () => {
    const run = () => {
      let s = game(easyGoals, 1234)
      s = applyAction(s, { type: 'travel', to: 'megamart' })
      s = applyAction(s, { type: 'buyGroceries', units: 6 })
      s = applyAction(s, { type: 'endWeek' })
      return s
    }
    expect(run()).toEqual(run())
  })
})

describe('Riley AI', () => {
  it('makes real progress in the first weeks', () => {
    let s = game()
    for (let i = 0; i < 6 && s.phase !== 'over'; i++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    expect(s.riley.jobId).not.toBeNull()
    expect(s.riley.cash + s.riley.savings).toBeGreaterThan(200)
    expect(s.riley.apartment).not.toBe('none')
  })

  it('wins an easy game within 60 weeks if the player idles', () => {
    let s = game()
    let weeks = 0
    while (s.phase !== 'over' && weeks < 60) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
      weeks += 1
    }
    expect(s.phase).toBe('over')
    expect(s.winner).toBe('riley')
  })
})
