import { describe, expect, it } from 'vitest'
import { AI_PROFILES } from '../ai'
import { EngineError, netWorth, wagePerHour } from '../actions'
import { FOOD_NEEDED, WEEK_TIME, maxLoan, travelCost } from '../data'
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
    // Wraps around the loop the other way — 3h now that Clinic and Casino
    // (loopIndex 12, 13) both sit between rentoffice and home on that side.
    expect(travelCost('home', 'rentoffice', false)).toBe(3)
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

describe('durable goods', () => {
  it('gates senior office jobs on owning a computer', () => {
    const s = applyAction(game(), { type: 'travel', to: 'employment' })
    expect(() => applyAction(s, { type: 'applyJob', jobId: 'analyst' })).toThrow(/computer/)
  })

  it('an uninsured item can be stolen from an unsecured home', () => {
    // Seed found by brute force: bike goes missing on the 6th endWeek. (This
    // shifted from the 4th once Casino was added — Casino's new travel
    // distances change Riley's AI decisions, which shifts how many RNG
    // rolls Riley's own upkeep consumes, which shifts the shared rngSeed
    // stream the player's own rolls draw from later in the same week.)
    let s = applyAction(game(easyGoals, 2), { type: 'travel', to: 'gadgets' })
    s = applyAction(s, { type: 'buyItem', itemId: 'bike' })
    for (let i = 0; i < 6; i++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    expect(s.player.items).not.toContain('bike')
    expect(s.lastReport?.entries.some((e) => e.text.includes('stolen'))).toBe(true)
  })

  it('insurance protects durable goods from that same theft', () => {
    // Actions never touch the RNG stream (only week.ts's upkeep/personalEvent/
    // driftEconomy do), so working first to afford both purchases doesn't
    // change the endWeek-by-endWeek roll sequence from the test above.
    let s = applyAction(game(easyGoals, 2), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    s = applyAction(s, { type: 'work', hours: 40 })
    s = applyAction(s, { type: 'travel', to: 'gadgets' })
    s = applyAction(s, { type: 'buyItem', itemId: 'bike' })
    s = applyAction(s, { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'buyItem', itemId: 'insurance' })
    for (let i = 0; i < 6; i++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    expect(s.player.items).toContain('bike')
  })
})

describe('casino', () => {
  it('rejects bets below the minimum, above the max, or away from the casino', () => {
    expect(() => applyAction(game(), { type: 'playCasino', bet: 50 })).toThrow(/casino/)
    const atCasino = applyAction(game(), { type: 'travel', to: 'casino' })
    expect(() => applyAction(atCasino, { type: 'playCasino', bet: 1 })).toThrow(/at least/)
    expect(() => applyAction(atCasino, { type: 'playCasino', bet: 9999 })).toThrow(/capped/)
  })

  it('a win pays out double the bet; a loss costs the bet — seeds found by brute force', () => {
    let win = applyAction(game(easyGoals, 0), { type: 'travel', to: 'casino' })
    const winCashBefore = win.player.cash
    win = applyAction(win, { type: 'playCasino', bet: 50 })
    expect(win.player.cash).toBe(winCashBefore + 50) // net +50: staked 50, paid back 100
    expect(win.lastReport).toBeNull() // resolves immediately, not at week's end
    expect(win.log.some((e) => e.text.includes('won'))).toBe(true)

    let lose = applyAction(game(easyGoals, 1), { type: 'travel', to: 'casino' })
    const loseCashBefore = lose.player.cash
    lose = applyAction(lose, { type: 'playCasino', bet: 50 })
    expect(lose.player.cash).toBe(loseCashBefore - 50)
    expect(lose.log.some((e) => e.text.includes('lost'))).toBe(true)
  })
})

describe('loans', () => {
  it('borrows up to the credit limit and adds it to cash, not net worth', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    const cashBefore = s.player.cash
    const netWorthBefore = netWorth(s.player)
    s = applyAction(s, { type: 'takeLoan', amount: 300 })
    expect(s.player.cash).toBe(cashBefore + 300)
    expect(s.player.loanBalance).toBe(300)
    // Borrowing is a wash on net worth — cash up, debt up by the same amount.
    expect(netWorth(s.player)).toBe(netWorthBefore)

    const limit = maxLoan(s.player.creditScore)
    expect(() => applyAction(s, { type: 'takeLoan', amount: limit })).toThrow(/limit/)
  })

  it('accrues interest weekly regardless of payment', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'takeLoan', amount: 1000 })
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.loanBalance).toBe(1020) // 1000 * 1.02
    expect(s.player.loanWeeksBehind).toBe(1)
    expect(s.player.creditScore).toBeLessThan(50) // missed payment
  })

  it('a payment resets the missed-weeks clock and raises credit', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'takeLoan', amount: 1000 })
    s = applyAction(s, { type: 'repayLoan', amount: 500 })
    expect(s.player.loanBalance).toBe(500)
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.loanBalance).toBe(510) // 500 * 1.02
    expect(s.player.loanWeeksBehind).toBe(0)
    expect(s.player.creditScore).toBeGreaterThan(50)
  })

  it('garnishes wages after enough consecutive missed weeks', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'takeLoan', amount: 500 })
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    expect(s.player.garnished).toBe(true)

    s = applyAction(s, { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    const cashBefore = s.player.cash
    const balanceBefore = s.player.loanBalance
    s = applyAction(s, { type: 'work', hours: 10 })
    expect(s.player.loanBalance).toBeLessThan(balanceBefore)
    expect(s.player.cash).toBeGreaterThan(cashBefore) // still got a cut, just not all of it
    expect(s.player.loanPaidThisWeek).toBe(true)
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

describe('AI personalities', () => {
  function run(seed: number, rileyProfile: keyof typeof AI_PROFILES, weeks: number): GameState {
    let s = newGame({ playerName: 'Tester', goals: easyGoals, seed, rileyProfile })
    for (let i = 0; i < weeks && s.phase !== 'over'; i++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    return s
  }

  it('defaults a new game to the Balanced profile', () => {
    expect(newGame({ playerName: 'Tester', goals: easyGoals }).rileyProfile).toBe('balanced')
  })

  it('stores whichever profile newGame was given', () => {
    expect(game().rileyProfile).toBe('balanced') // the shared test helper's default
    const s = newGame({ playerName: 'T', goals: easyGoals, rileyProfile: 'hustler' })
    expect(s.rileyProfile).toBe('hustler')
  })

  it('Hustler works more hours than Balanced given the same seed', () => {
    // Seed found by brute force: a clear gap by week 8.
    const balanced = run(12, 'balanced', 8)
    const hustler = run(12, 'hustler', 8)
    expect(hustler.riley.experience).toBeGreaterThan(balanced.riley.experience)
  })

  it('Gambler visits the casino; Balanced never does', () => {
    // Seed found by brute force: Gambler plays the wheel at least once by week 25.
    const gambler = run(1, 'gambler', 25)
    const balanced = run(1, 'balanced', 25)
    const gambledAtAll = (s: GameState) =>
      s.log.some((e) => e.actor === 'riley' && e.text.includes('wheel'))
    expect(gambledAtAll(gambler)).toBe(true)
    expect(gambledAtAll(balanced)).toBe(false)
  })

  it('Scholar studies without going broke or homeless', () => {
    const s = run(7, 'scholar', 10)
    expect(s.riley.apartment).not.toBe('none')
    expect(s.riley.education).toBeGreaterThan(0)
  })

  it('every profile produces a playable game — none stalls or crashes', () => {
    for (const profile of Object.keys(AI_PROFILES) as Array<keyof typeof AI_PROFILES>) {
      const s = run(0, profile, 10)
      expect(s.riley.jobId).not.toBeNull()
      expect(s.riley.cash + s.riley.savings).toBeGreaterThanOrEqual(0)
    }
  })
})
