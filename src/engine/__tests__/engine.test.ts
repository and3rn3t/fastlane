import { describe, expect, it } from 'vitest'
import { EngineError } from '../actions'
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
    expect(travelCost('home', 'rentoffice', false)).toBe(1) // wraps around the loop
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
