import { describe, expect, it } from 'vitest'
import { AI_PROFILES, DIFFICULTY_SKILL, runAIWeek } from '../ai'
import { EngineError, netWorth, qualifiesFor, wagePerHour } from '../actions'
import {
  FOOD_NEEDED,
  MARKET_INDEX_MAX,
  MARKET_INDEX_MIN,
  RULE_PRESETS,
  SKILL_GAIN_PER_HOUR,
  SKILL_TRAIN_GAIN,
  SKILL_TRAIN_PRICE,
  WEEK_TIME,
  maxLoan,
  travelCost,
} from '../data'
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

describe('skills', () => {
  it('gains the workplace skill from working a job that trains it', () => {
    let s = applyAction(game(), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' }) // Burger Barn trains sales
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    s = applyAction(s, { type: 'work', hours: 10 })
    expect(s.player.skills.sales).toBeCloseTo(10 * SKILL_GAIN_PER_HOUR)
    expect(s.player.skills.trades).toBe(0)
    expect(s.player.skills.tech).toBe(0)
  })

  it('trainSkill spends cash and time at City University to raise a skill directly', () => {
    let s = applyAction(game(), { type: 'travel', to: 'university' })
    const cash = s.player.cash
    s = applyAction(s, { type: 'trainSkill', skillId: 'tech' })
    expect(s.player.skills.tech).toBe(SKILL_TRAIN_GAIN)
    expect(s.player.cash).toBe(cash - SKILL_TRAIN_PRICE)
  })

  it('gates a senior job on a minimum skill, on top of dress/education/experience', () => {
    const s = applyAction(game(), { type: 'travel', to: 'employment' })
    expect(() => applyAction(s, { type: 'applyJob', jobId: 'store-manager' })).toThrow(
      /sales skill/
    )
  })

  it('qualifiesFor passes once the required skill is met', () => {
    const s = game()
    const readyOtherwise = {
      ...s.player,
      dress: 100,
      education: 100,
      experience: 1000,
    }
    expect(qualifiesFor(readyOtherwise, 'store-manager').ok).toBe(false)
    expect(
      qualifiesFor(
        { ...readyOtherwise, skills: { ...readyOtherwise.skills, sales: 40 } },
        'store-manager'
      ).ok
    ).toBe(true)
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
    // Seed found by brute force: bike goes missing on the 6th endWeek.
    // burglaryUpkeep's roll() is only spent when Riley actually owns a
    // stealable item that week, so any change to *when* Riley buys things
    // shifts how many rolls Riley's own upkeep consumes, which shifts the
    // shared rngSeed stream the player's own rolls draw from later in the
    // same week — expect this count to drift again after any future AI
    // change; re-run a brute-force search rather than guessing.
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
    const netWorthBefore = netWorth(s.player, s.economy.marketIndex)
    s = applyAction(s, { type: 'takeLoan', amount: 300 })
    expect(s.player.cash).toBe(cashBefore + 300)
    expect(s.player.loanBalance).toBe(300)
    // Borrowing is a wash on net worth — cash up, debt up by the same amount.
    expect(netWorth(s.player, s.economy.marketIndex)).toBe(netWorthBefore)

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

describe('investing', () => {
  it('invest converts cash to units at the current market index', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    const cash = s.player.cash
    s = applyAction(s, { type: 'invest', amount: 200 })
    expect(s.player.cash).toBe(cash - 200)
    expect(s.player.investments).toBeCloseTo(200 / s.economy.marketIndex)
  })

  it('divest converts units back to cash at the current market index', () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'invest', amount: 200 })
    const units = s.player.investments
    const cashAfterInvest = s.player.cash
    s = applyAction(s, { type: 'divest', units })
    expect(s.player.investments).toBe(0)
    expect(s.player.cash).toBe(cashAfterInvest + Math.round(units * s.economy.marketIndex))
  })

  it("netWorth folds investments into the player's wealth at the current market index", () => {
    let s = applyAction(game(), { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'invest', amount: 200 })
    const p = s.player
    expect(netWorth(p, s.economy.marketIndex)).toBe(
      Math.round(p.cash + p.savings - p.loanBalance + p.investments * s.economy.marketIndex)
    )
  })

  it('rejects investing/divesting away from the bank or beyond what is held', () => {
    const s = game()
    expect(() => applyAction(s, { type: 'invest', amount: 100 })).toThrow(/First Bank/)
    let atBank = applyAction(s, { type: 'travel', to: 'bank' })
    atBank = applyAction(atBank, { type: 'invest', amount: 100 })
    expect(() =>
      applyAction(atBank, { type: 'divest', units: atBank.player.investments + 1 })
    ).toThrow(EngineError)
  })

  it('market index drifts but always stays within its clamp', () => {
    let s = game()
    for (let w = 0; w < 30 && s.phase !== 'over'; w++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
      expect(s.economy.marketIndex).toBeGreaterThanOrEqual(MARKET_INDEX_MIN)
      expect(s.economy.marketIndex).toBeLessThanOrEqual(MARKET_INDEX_MAX)
    }
  })
})

describe('event chains', () => {
  it('a layoff clears the job and eventually resolves, aggregated across seeds', () => {
    let sawLayoff = false
    let sawResolution = false
    for (let seed = 0; seed < 30 && !(sawLayoff && sawResolution); seed++) {
      let s = game(easyGoals, seed)
      for (let w = 0; w < 20 && s.phase !== 'over'; w++) {
        s = applyAction(s, { type: 'endWeek' })
        if (s.lastReport?.entries.some((e) => e.text.includes('was laid off'))) sawLayoff = true
        if (s.lastReport?.entries.some((e) => e.text.includes('rough patch'))) sawResolution = true
        if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
      }
    }
    expect(sawLayoff).toBe(true)
    expect(sawResolution).toBe(true)
  })

  it('an inheritance chain stays pending for one week, then pays out on the second', () => {
    let s = game()
    s.rules.eventFrequency = 0
    s.player.activeEvents = [{ chainId: 'inheritance', stage: 0, weeksInStage: 0 }]

    const cashBeforeDelayWeek = s.player.cash
    s = applyAction(s, { type: 'endWeek' })

    expect(s.lastReport?.entries.some((e) => e.text.includes('inheritance came through'))).toBe(
      false
    )
    expect(s.player.cash).toBe(cashBeforeDelayWeek)
    expect(s.player.activeEvents).toEqual([{ chainId: 'inheritance', stage: 0, weeksInStage: 1 }])

    s = applyAction(s, { type: 'dismissReport' })
    const cashBeforePayoutWeek = s.player.cash
    s = applyAction(s, { type: 'endWeek' })

    expect(s.lastReport?.entries.some((e) => e.text.includes('inheritance came through'))).toBe(
      true
    )
    expect(s.player.cash).toBeGreaterThan(cashBeforePayoutWeek)
    expect(s.player.activeEvents).toEqual([])
  })

  it('a layoff chain waives dress and experience requirements (sympathy hire)', () => {
    const s = game()
    const laidOff = {
      ...s.player,
      education: 5,
      dress: 0,
      experience: 0,
      activeEvents: [{ chainId: 'layoff' as const, stage: 0, weeksInStage: 0 }],
    }
    // cashier: minDress 25, minEducation 2, minExperience 20 — only the
    // waived two would otherwise block a dress-0/experience-0 player.
    expect(qualifiesFor(laidOff, 'cashier').ok).toBe(true)
    expect(qualifiesFor({ ...laidOff, activeEvents: [] }, 'cashier').ok).toBe(false)
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
    const mi = s.economy.marketIndex
    expect(meetsGoals(s.player, trivialGoals, mi)).toBe(true) // start state satisfies trivial goals
    expect(meetsGoals(s.player, { ...trivialGoals, wealth: 10_000 }, mi)).toBe(false)
    expect(meetsGoals(s.player, { ...trivialGoals, education: 1 }, mi)).toBe(false)
    expect(meetsGoals(s.player, { ...trivialGoals, career: 5 }, mi)).toBe(false)
    expect(meetsGoals(s.player, { ...trivialGoals, happiness: 90 }, mi)).toBe(false)
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

describe('state immutability', () => {
  it("does not mutate the input state's log/history when applying an action", () => {
    const s0 = game()
    const logLenBefore = s0.log.length
    const historyLenBefore = s0.history.length
    const s1 = applyAction(s0, { type: 'travel', to: 'university' })
    expect(s0.log).toHaveLength(logLenBefore)
    expect(s0.history).toHaveLength(historyLenBefore)
    expect(s1.log).toHaveLength(logLenBefore + 1)
    expect(s1).not.toBe(s0)
    expect(s1.log).not.toBe(s0.log)
  })

  it('copies the acting player without deep-cloning the other (structural sharing)', () => {
    const s0 = game()
    const s1 = applyAction(s0, { type: 'travel', to: 'university' })
    // The acted-on player is a genuine copy...
    expect(s1.player).not.toBe(s0.player)
    expect(s1.player.items).not.toBe(s0.player.items)
    // ...but untouched fields on the other player are still structurally
    // shared, proving this is a targeted shallow copy, not a reintroduced
    // structuredClone — a correctness-only test could pass even if the
    // deep clone came back, since deep-cloned values are still deep-equal.
    expect(s1.riley.items).toBe(s0.riley.items)
  })

  it('never trims the log/history over a long game (achievements scan the full log)', () => {
    let s = game()
    let weeks = 0
    while (s.phase !== 'over' && weeks < 60) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
      weeks += 1
    }
    expect(s.log.length).toBeGreaterThan(60)
    expect(s.log[0].week).toBe(1)
    expect(s.history.length).toBeGreaterThan(0)
    expect(s.history[0].week).toBe(1)
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

  it('pursueCareer buys a computer to clear a requiresComputer blocker on the next job', () => {
    // Career goal must be above the current careerScore, or pursueCareer's
    // own "goal already met, stop chasing prestige" gate returns early
    // before ever reaching the blocker-clearing logic below.
    const goals: Goals = { ...easyGoals, career: 50 }
    const s = newGame({ playerName: 'T', goals, seed: 42 })
    // Already technician (prestige 35, no computer needed) with everything
    // analyst (prestige 45, the unique next rung) requires except a
    // computer — isolates pursueCareer's requiresComputer branch instead of
    // an earlier, already-qualified rung winning bestQualifiedJob first.
    s.riley.jobId = 'technician'
    s.riley.dress = 80
    s.riley.education = 20
    s.riley.experience = 150
    s.riley.cash = 1000
    runAIWeek(s, 'riley', AI_PROFILES.balanced)
    expect(s.riley.items).toContain('computer')
  })

  it('a Gambler with the wealth goal already met but no cash surplus never visits the casino', () => {
    // wealth met via savings (untouched by spending), cash held far below
    // reserve×3 so gambleAtCasino's own surplus check can never clear
    // CASINO_MIN_BET regardless of what else Riley does this turn.
    const goals: Goals = { wealth: 100, happiness: 55, education: 3, career: 10 }
    const s = newGame({ playerName: 'T', goals, seed: 1, rileyProfile: 'gambler' })
    s.riley.savings = 200
    s.riley.cash = 50
    runAIWeek(s, 'riley', AI_PROFILES.gambler)
    expect(s.log.some((e) => e.actor === 'riley' && e.text.includes('wheel'))).toBe(false)
  })

  it('Easy skill spends extra rolls considering fewer candidates than Normal each turn', () => {
    // considerForAttempt's random-subset filtering is a real code path with
    // its own coverage, distinct from the mistake-free Normal/Hard path —
    // proven by the fact it burns extra rolls off the same seed, which
    // Normal (dropChance 0) never touches.
    const goals: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
    const runWith = (skillLevel: number) => {
      const s = newGame({ playerName: 'T', goals, seed: 5 })
      runAIWeek(s, 'riley', { ...AI_PROFILES.balanced, skillLevel })
      return s.rngSeed
    }
    expect(runWith(DIFFICULTY_SKILL.easy)).not.toBe(runWith(DIFFICULTY_SKILL.normal))
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
    const gambler = run(0, 'gambler', 25)
    const balanced = run(0, 'balanced', 25)
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

describe('rule presets', () => {
  it('defaults a new game to Classic rules', () => {
    const s = newGame({ playerName: 'Tester', goals: easyGoals })
    expect(s.rules).toEqual(RULE_PRESETS.classic)
  })

  it('starting cash follows the chosen preset for both players', () => {
    const brutal = newGame({ playerName: 'T', goals: easyGoals, rules: RULE_PRESETS.brutal })
    expect(brutal.player.cash).toBe(100)
    expect(brutal.riley.cash).toBe(100)

    const zen = newGame({ playerName: 'T', goals: easyGoals, rules: RULE_PRESETS.zen })
    expect(zen.player.cash).toBe(350)
  })

  it('Brutal produces more personal events than Zen, aggregated across seeds', () => {
    // A single-seed comparison would be fragile (see the Casino RNG-sharing
    // note above) — this aggregates over many seeds/weeks instead, the same
    // approach pnpm sim uses for balance signals. Counts only entries that
    // match one of personalEvent()'s own message patterns (week.ts) rather
    // than raw log growth — total log growth is dominated by however many
    // actions Riley's AI happens to take that week, which is a moving
    // target independent of eventFrequency and would make this test flaky
    // across AI policy changes.
    const PERSONAL_EVENT_MARKERS = [
      'found $',
      "doctor's bill",
      'bonus at work',
      'ran into an old friend',
      'got sick and lost',
      'felt a cold coming on',
      'was laid off',
      'left them something in their will',
    ]
    function countPersonalEvents(rules: typeof RULE_PRESETS.classic): number {
      let total = 0
      for (let seed = 0; seed < 20; seed++) {
        let s = newGame({ playerName: 'T', goals: easyGoals, seed, rules })
        for (let w = 0; w < 10 && s.phase !== 'over'; w++) {
          const before = s.log.length
          s = applyAction(s, { type: 'endWeek' })
          total += s.log
            .slice(before)
            .filter((e) => PERSONAL_EVENT_MARKERS.some((m) => e.text.includes(m))).length
          if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
        }
      }
      return total
    }
    const brutalCount = countPersonalEvents(RULE_PRESETS.brutal)
    const zenCount = countPersonalEvents(RULE_PRESETS.zen)
    expect(brutalCount).toBeGreaterThan(zenCount)
  })

  it('Brutal swings the economy further from neutral than Zen, aggregated across seeds', () => {
    function avgDrift(rules: typeof RULE_PRESETS.classic): number {
      let total = 0
      const seeds = 20
      for (let seed = 0; seed < seeds; seed++) {
        let s = newGame({ playerName: 'T', goals: easyGoals, seed, rules })
        for (let w = 0; w < 15 && s.phase !== 'over'; w++) {
          s = applyAction(s, { type: 'endWeek' })
          if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
        }
        total += Math.abs(s.economy.priceIndex - 1) + Math.abs(s.economy.wageIndex - 1)
      }
      return total / seeds
    }
    expect(avgDrift(RULE_PRESETS.brutal)).toBeGreaterThan(avgDrift(RULE_PRESETS.zen))
  })
})
