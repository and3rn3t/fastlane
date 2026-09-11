import { describe, expect, it } from 'vitest'
import { AI_PROFILES, DIFFICULTY_SKILL, runAIWeek } from '../ai'
import {
  EngineError,
  jobRequirements,
  netWorth,
  qualifiesFor,
  seasonalPrice,
  wagePerHour,
} from '../actions'
import { bestQualifiedJob, nextTargetJob } from '../career'
import {
  COSTLY_MISTAKE_HAPPINESS_PENALTY,
  FOOD_NEEDED,
  GROCERY_PRICE_MEGAMART,
  HOLIDAY_BEATS,
  JOBS,
  LOST_WALLET_HAPPINESS_PENALTY,
  LUCKY_FIND_HAPPINESS_BONUS,
  MARKET_INDEX_MAX,
  MARKET_INDEX_MIN,
  RENT,
  RULE_PRESETS,
  SEASON_LENGTH_WEEKS,
  SEASON_MULTIPLIERS,
  SKILL_GAIN_PER_HOUR,
  SKILL_TRAIN_GAIN,
  SKILL_TRAIN_PRICE,
  VIRAL_WINDFALL_HAPPINESS_BONUS,
  WEEK_TIME,
  jobById,
  maxLoan,
  seasonForWeek,
  travelCost,
  weekInCycle,
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

describe('jobRequirements', () => {
  it('only emits rows for criteria the job actually gates on', () => {
    // fry-cook: minDress 10, minEducation 0, minExperience 0, no computer/skills
    // — only dress should appear, not the three zero/absent requirements.
    const reqs = jobRequirements(game().player, 'fry-cook')
    expect(reqs.map((r) => r.key)).toEqual(['dress'])
  })

  it('reports current/required/met per criterion, not just pass/fail', () => {
    const p = { ...game().player, dress: 18, education: 5, experience: 30 }
    const reqs = jobRequirements(p, 'cashier') // minDress 25, minEducation 2, minExperience 20
    expect(reqs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'education', current: 5, required: 2, met: true }),
        expect.objectContaining({ key: 'dress', current: 18, required: 25, met: false }),
        expect.objectContaining({ key: 'experience', current: 30, required: 20, met: true }),
      ])
    )
  })

  it('marks a skill requirement with its display name and progress', () => {
    const p = { ...game().player, dress: 100, education: 100, experience: 1000 }
    const reqs = jobRequirements(p, 'store-manager')
    const skillReq = reqs.find((r) => r.key === 'skill:sales')
    expect(skillReq).toEqual(
      expect.objectContaining({ label: 'Sales skill', current: 0, required: 40, met: false })
    )
  })

  it('marks a computer requirement as a 0/1 boolean, not a raw count', () => {
    const withoutComputer = jobRequirements(game().player, 'analyst').find(
      (r) => r.key === 'computer'
    )
    expect(withoutComputer).toEqual(
      expect.objectContaining({ current: 0, required: 1, met: false })
    )
  })

  it('marks dress/experience as met-but-waived during a layoff, not silently met', () => {
    const laidOff = {
      ...game().player,
      dress: 0,
      experience: 0,
      activeEvents: [{ chainId: 'layoff' as const, stage: 0, weeksInStage: 0 }],
    }
    const reqs = jobRequirements(laidOff, 'cashier')
    const dressReq = reqs.find((r) => r.key === 'dress')
    const expReq = reqs.find((r) => r.key === 'experience')
    expect(dressReq).toEqual(
      expect.objectContaining({ current: 0, required: 25, met: true, waived: true })
    )
    expect(expReq).toEqual(
      expect.objectContaining({ current: 0, required: 20, met: true, waived: true })
    )
  })

  it('qualifiesFor stays derived from jobRequirements, not a second source of truth', () => {
    const p = { ...game().player, dress: 5 }
    const reqs = jobRequirements(p, 'cashier')
    const qual = qualifiesFor(p, 'cashier')
    expect(qual.ok).toBe(reqs.every((r) => r.met))
  })
})

describe('deepened career ladders (Wave 12)', () => {
  it('gives Burger Barn, MegaMart, and First Bank a fourth tier, matching Assembly Works', () => {
    const tiersByWorkplace = new Map<string, number>()
    for (const job of JOBS) {
      tiersByWorkplace.set(job.workplace, (tiersByWorkplace.get(job.workplace) ?? 0) + 1)
    }
    expect(tiersByWorkplace.get('burgers')).toBe(4)
    // MegaMart has 5 entries, not 4 — Department Manager forks into two
    // (Regional Buyer, Ops Director) rather than one linear 4th rung; see
    // the "career fork" describe block below for that fork's own coverage.
    expect(tiersByWorkplace.get('megamart')).toBe(5)
    expect(tiersByWorkplace.get('factory')).toBe(4) // unchanged — already the deepest ladder
    expect(tiersByWorkplace.get('bank')).toBe(4)
    // University: still shallower by design — a third tier fills the old
    // 30->88 gap, but a hard jump to 4 wasn't the ask (see roadmap note).
    expect(tiersByWorkplace.get('university')).toBe(3)
  })

  it("keeps every new tier strictly above its ladder's previous ceiling", () => {
    expect(jobById('regional-manager').prestige).toBeGreaterThan(jobById('store-manager').prestige)
    expect(jobById('regional-director').prestige).toBeGreaterThan(jobById('dept-manager').prestige)
    expect(jobById('ops-director').prestige).toBeGreaterThan(jobById('dept-manager').prestige)
    expect(jobById('regional-vp').prestige).toBeGreaterThan(jobById('branch-manager').prestige)
    expect(jobById('lecturer').prestige).toBeGreaterThan(jobById('ta').prestige)
    expect(jobById('professor').prestige).toBeGreaterThan(jobById('lecturer').prestige)
  })

  it("keeps Regional VP below Professor — a banking role should not outrank the game's academic ceiling", () => {
    expect(jobById('regional-vp').prestige).toBeLessThan(jobById('professor').prestige)
  })

  it('every new tier is actually reachable — a maxed-out player qualifies for all of them', () => {
    const maxed = {
      ...game().player,
      dress: 100,
      education: 100,
      experience: 1000,
      skills: { sales: 100, trades: 100, tech: 100 },
      items: ['computer' as const],
    }
    for (const id of [
      'regional-manager',
      'regional-director',
      'ops-director',
      'regional-vp',
      'lecturer',
    ]) {
      expect(qualifiesFor(maxed, id).ok).toBe(true)
    }
  })

  it('gates each new tier on a higher skill bar than the tier below it, where the ladder already gated on skill', () => {
    expect(jobById('regional-manager').minSkills?.sales).toBeGreaterThan(
      jobById('store-manager').minSkills?.sales ?? 0
    )
    expect(jobById('regional-director').minSkills?.sales).toBeGreaterThan(
      jobById('dept-manager').minSkills?.sales ?? 0
    )
    expect(jobById('regional-vp').minSkills?.tech).toBeGreaterThan(
      jobById('branch-manager').minSkills?.tech ?? 0
    )
  })
})

describe('career fork: Department Manager -> Regional Buyer / Ops Director (Wave 12)', () => {
  it('puts both branches at the same prestige — a genuine either/or, not a real tier plus a decoy', () => {
    expect(jobById('regional-director').prestige).toBe(jobById('ops-director').prestige)
  })

  it('diverges the two branches on skill and computer requirements, not just a title swap', () => {
    const buyer = jobById('regional-director')
    const ops = jobById('ops-director')
    expect(buyer.minSkills).toEqual({ sales: 60 })
    expect(ops.minSkills).toEqual({ tech: 60 })
    expect(buyer.requiresComputer).toBeFalsy()
    expect(ops.requiresComputer).toBe(true)
  })

  it("nextTargetJob breaks the prestige tie toward whichever branch the player's skills already favor", () => {
    const s = game()
    // analyst: prestige 45. Everything above it that's *lower* than the
    // fork's 48 (store-manager 30, technician 35, ta 30, etc.) is already
    // below 45 too, so the fork genuinely is the tied-lowest candidate
    // above this specific career score — unlike dept-manager's 28, where
    // store-manager (30) would beat the fork to the punch and the tie-break
    // would never even be reached.
    const salesLeaning = {
      ...s,
      player: { ...s.player, jobId: 'analyst', skills: { sales: 30, trades: 0, tech: 0 } },
    }
    const techLeaning = {
      ...s,
      player: { ...s.player, jobId: 'analyst', skills: { sales: 0, trades: 0, tech: 30 } },
    }
    expect(nextTargetJob(salesLeaning, 'player')?.id).toBe('regional-director')
    expect(nextTargetJob(techLeaning, 'player')?.id).toBe('ops-director')
  })

  it('falls back to the first-listed branch (Regional Buyer) when neither skill has any lead', () => {
    const s = game()
    const noLean = { ...s, player: { ...s.player, jobId: 'analyst' } }
    expect(nextTargetJob(noLean, 'player')?.id).toBe('regional-director')
  })

  it('bestQualifiedJob returns the fork branch whose specific requirements are met, not the other one', () => {
    const s = game()
    const qualifiedForOps = {
      ...s,
      player: {
        ...s.player,
        jobId: 'dept-manager',
        dress: 60,
        education: 15,
        experience: 150,
        skills: { sales: 0, trades: 0, tech: 60 },
        items: ['computer' as const],
      },
    }
    // Meets ops-director's bars but not regional-buyer's (0 sales skill,
    // dress/experience below its higher bars) or lecturer's (education 15
    // < its 18) — isolates that bestQualifiedJob is reading each fork
    // branch's own requirements, not just picking whichever comes first.
    expect(bestQualifiedJob(qualifiedForOps, 'player')?.id).toBe('ops-director')
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

describe('seasons', () => {
  it('cycles spring/summer/fall/winter in fixed 3-week blocks, wrapping at week 13', () => {
    expect(SEASON_LENGTH_WEEKS).toBe(3)
    expect(seasonForWeek(1)).toBe('spring')
    expect(seasonForWeek(3)).toBe('spring')
    expect(seasonForWeek(4)).toBe('summer')
    expect(seasonForWeek(6)).toBe('summer')
    expect(seasonForWeek(7)).toBe('fall')
    expect(seasonForWeek(9)).toBe('fall')
    expect(seasonForWeek(10)).toBe('winter')
    expect(seasonForWeek(12)).toBe('winter')
    expect(seasonForWeek(13)).toBe('spring') // wraps into a second cycle
  })

  it('seasonalPrice scales grocery/rent by the current season on top of priceIndex', () => {
    const s = game()
    s.week = 10 // winter
    expect(seasonalPrice(s, GROCERY_PRICE_MEGAMART, 'grocery')).toBe(
      Math.round(GROCERY_PRICE_MEGAMART * SEASON_MULTIPLIERS.winter.grocery)
    )
    expect(seasonalPrice(s, RENT.basic, 'rent')).toBe(
      Math.round(RENT.basic * SEASON_MULTIPLIERS.winter.rent)
    )
    s.economy.priceIndex = 1.2
    expect(seasonalPrice(s, RENT.basic, 'rent')).toBe(
      Math.round(RENT.basic * 1.2 * SEASON_MULTIPLIERS.winter.rent)
    )
  })

  it('charges seasonal rent when leasing and when rent accrues at week end', () => {
    let s = applyAction(game(), { type: 'travel', to: 'rentoffice' })
    s.week = 10 // winter — rent costs more
    const cashBefore = s.player.cash
    s = applyAction(s, { type: 'rentApartment', tier: 'basic' })
    const winterFirstWeek = cashBefore - s.player.cash
    expect(winterFirstWeek).toBe(seasonalPrice(s, RENT.basic, 'rent'))
    expect(winterFirstWeek).toBeGreaterThan(RENT.basic) // pricier than the flat base rate
  })

  it('replaces one week in four with a season-transition headline instead of the usual roll', () => {
    // Goals no game can meet within 13 weeks — this test cares about the
    // headline sequence, not the outcome, and a mid-loop win would make
    // further endWeek calls throw (the game is already over).
    const noWinGoals: Goals = { wealth: 1_000_000, happiness: 1000, education: 1000, career: 1000 }
    let s = game(noWinGoals)
    const headlinesAtSeasonBoundaries: string[] = []
    for (let week = 1; week <= 13; week++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
      // A transition fires ending week 3, 6, 9, 12 (entering summer/fall/winter/spring).
      if ([3, 6, 9, 12].includes(week)) headlinesAtSeasonBoundaries.push(s.headline)
    }
    expect(headlinesAtSeasonBoundaries).toEqual([
      '☀️ Summer heat rolls in — cooling costs nudge rent and groceries up.',
      '🍂 Fall settles in — prices level off.',
      '❄️ Winter sets in — heating drives rent up, groceries cost more too.',
      '🌱 Spring arrives — grocery prices ease up.',
    ])
  })
})

describe('holiday one-offs', () => {
  it('positions every beat away from a season-transition week', () => {
    for (const cycleWeek of Object.keys(HOLIDAY_BEATS).map(Number)) {
      expect([1, 4, 7, 10]).not.toContain(cycleWeek)
    }
  })

  it('fires spring cleaning, tax week, and the holiday bonus at their fixed weeks, and recurs next cycle', () => {
    const noWinGoals: Goals = { wealth: 1_000_000, happiness: 1000, education: 1000, career: 1000 }
    let s = game(noWinGoals)
    // Isolate the beats' own cash deltas from personalEvent/street-robbery
    // noise — same guards as the tax-week cap test below.
    s.rules = { ...s.rules, eventFrequency: 0 }
    s.player.apartment = 'secure'
    s.riley.apartment = 'secure'
    const beats: Array<{ week: number; headline: string; playerCashDelta: number }> = []
    let prevCash = s.player.cash
    for (let week = 1; week <= 24; week++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
      if ([1, 2, 10, 13, 14, 22].includes(week)) {
        beats.push({ week, headline: s.headline, playerCashDelta: s.player.cash - prevCash })
      }
      prevCash = s.player.cash
    }
    // First cycle: spring cleaning (+15) entering week 2, tax week (-60)
    // entering week 3, holiday bonus (+80) entering week 11.
    expect(beats[0]).toMatchObject({
      week: 1,
      headline: '🧹 Spring cleaning week — everyone declutters and pockets a little extra.',
      playerCashDelta: 15,
    })
    expect(beats[1]).toMatchObject({
      week: 2,
      headline: '🧾 Tax week — everyone owes the city a cut.',
      playerCashDelta: -60,
    })
    expect(beats[2]).toMatchObject({
      week: 10,
      headline: '🎁 Holiday bonus season — a little extra shows up in every paycheck.',
      playerCashDelta: 80,
    })
    // Second cycle (weeks 13-24) repeats identically.
    expect(beats[3]).toMatchObject({ ...beats[0], week: 13 })
    expect(beats[4]).toMatchObject({ ...beats[1], week: 14 })
    expect(beats[5]).toMatchObject({ ...beats[2], week: 22 })
  })

  it("logs each player's own line, and caps tax week so it can never go negative", () => {
    let s = game()
    // engine.ts's 'endWeek' case runs Riley's full AI turn *before* week.ts's
    // endWeek (and therefore driftEconomy) — so unlike the player, Riley's
    // cash isn't a fixed starting value here; only the player side (who
    // takes no autonomous actions) gives a fully deterministic tax amount.
    s.rules = { ...s.rules, eventFrequency: 0 }
    s.player.apartment = 'secure' // street robbery only rolls for a non-secure apartment
    s.week = 2 // entering week 3 = tax week
    s.player.cash = 40 // less than the $60 tax
    s = applyAction(s, { type: 'endWeek' })
    expect(s.player.cash).toBe(0) // capped, not negative
    expect(
      s.lastReport?.entries.some((e) => e.actor === 'player' && e.text.includes('taxes'))
    ).toBe(true)
    expect(s.lastReport?.entries.some((e) => e.actor === 'riley' && e.text.includes('taxes'))).toBe(
      true
    )
  })
})

describe('durable goods', () => {
  it('gates senior office jobs on owning a computer', () => {
    const s = applyAction(game(), { type: 'travel', to: 'employment' })
    expect(() => applyAction(s, { type: 'applyJob', jobId: 'analyst' })).toThrow(/computer/)
  })

  it('an uninsured item can be stolen from an unsecured home', () => {
    // Seed/week found by brute force: the player's own bike goes missing by
    // the 3rd endWeek (was seed 8/3 weeks before Wave 14's Origin backgrounds
    // added a seeded RNG draw at newGame() construction time — every game's
    // roll() stream now starts one step later than before, per Standing
    // Constraints' RNG-draw-count fragility note).
    // burglaryUpkeep's roll() is only spent when a player actually owns a
    // stealable item that week, so any change to *when* either side buys or
    // loses things shifts how many rolls get consumed, which shifts the
    // shared rngSeed stream every other roll draws from later — expect this
    // to drift again after any future AI/economy change; re-run a
    // brute-force search rather than guessing.
    let s = applyAction(game(easyGoals, 14), { type: 'travel', to: 'gadgets' })
    s = applyAction(s, { type: 'buyItem', itemId: 'bike' })
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    expect(s.player.items).not.toContain('bike')
    expect(s.lastReport?.entries.some((e) => e.text.includes('stolen'))).toBe(true)
  })

  it('insurance protects durable goods from that same theft', () => {
    // Actions never touch the RNG stream (only week.ts's upkeep/personalEvent/
    // driftEconomy do), so working first to afford both purchases doesn't
    // change the endWeek-by-endWeek roll sequence from the test above — same
    // 3-week window as that test, for the same reason (see its comment).
    let s = applyAction(game(easyGoals, 8), { type: 'travel', to: 'employment' })
    s = applyAction(s, { type: 'applyJob', jobId: 'fry-cook' })
    s = applyAction(s, { type: 'travel', to: 'burgers' })
    s = applyAction(s, { type: 'work', hours: 40 })
    s = applyAction(s, { type: 'travel', to: 'gadgets' })
    s = applyAction(s, { type: 'buyItem', itemId: 'bike' })
    s = applyAction(s, { type: 'travel', to: 'bank' })
    s = applyAction(s, { type: 'buyItem', itemId: 'insurance' })
    for (let i = 0; i < 3; i++) {
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
    // Lose seed re-found (1 → 5) after Wave 14's Origin backgrounds added a
    // seeded RNG draw at newGame() construction — see Standing Constraints'
    // RNG-draw-count fragility note. Win seed 0 happened to still work.
    let win = applyAction(game(easyGoals, 0), { type: 'travel', to: 'casino' })
    const winCashBefore = win.player.cash
    win = applyAction(win, { type: 'playCasino', bet: 50 })
    expect(win.player.cash).toBe(winCashBefore + 50) // net +50: staked 50, paid back 100
    expect(win.lastReport).toBeNull() // resolves immediately, not at week's end
    expect(win.log.some((e) => e.text.includes('won'))).toBe(true)

    let lose = applyAction(game(easyGoals, 5), { type: 'travel', to: 'casino' })
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
    // Reassign, don't mutate — s.rules defaults to the shared RULE_PRESETS.classic
    // object (newGame() doesn't clone it until the first applyAction), so
    // `s.rules.eventFrequency = 0` would zero it for every later test in this
    // file too, silencing personal events file-wide instead of just here.
    s.rules = { ...s.rules, eventFrequency: 0 }
    // Off week 1 (Wave 7's Holiday one-offs fires a cash-changing beat
    // entering week 2, unrelated to this chain) so the cash assertions
    // below isolate the inheritance payout, not incidental week-tied noise.
    s.week = 5
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
    // Seed found by brute force: a clear gap by week 11. (Was seed 4/week 8
    // before Wave 7's Expand personalEvent() shifted the shared rngSeed
    // stream — see the durable-goods theft test's comment for why this
    // keeps happening.)
    const balanced = run(2, 'balanced', 11)
    const hustler = run(2, 'hustler', 11)
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

describe('newGame playerCashBonus', () => {
  // seed: 7 — Riley's random origin draw lands on 'career-changer' (index 0
  // in ORIGINS, every field a no-op delta), so Riley's cash is the plain
  // preset value with no origin noise, same as before origins existed. An
  // unseeded newGame() would make riley.cash flaky here since a non-neutral
  // origin can shift it — see Standing Constraints' RNG-draw-count note.
  const seed = 7

  it('adds bonus only to the player, not Riley', () => {
    const bonus = 50
    const s = newGame({ playerName: 'Tester', goals: easyGoals, seed, playerCashBonus: bonus })
    expect(s.player.cash).toBe(RULE_PRESETS.classic.startingCash + bonus)
    expect(s.riley.cash).toBe(RULE_PRESETS.classic.startingCash)
  })

  it('uses plain starting cash when playerCashBonus is omitted', () => {
    const s = newGame({ playerName: 'Tester', goals: easyGoals, seed })
    expect(s.player.cash).toBe(RULE_PRESETS.classic.startingCash)
    expect(s.riley.cash).toBe(RULE_PRESETS.classic.startingCash)
  })

  it('treats playerCashBonus of 0 the same as omitting it', () => {
    const s = newGame({ playerName: 'Tester', goals: easyGoals, seed, playerCashBonus: 0 })
    expect(s.player.cash).toBe(RULE_PRESETS.classic.startingCash)
    expect(s.riley.cash).toBe(RULE_PRESETS.classic.startingCash)
  })
})

describe('rule presets', () => {
  it('defaults a new game to Classic rules', () => {
    const s = newGame({ playerName: 'Tester', goals: easyGoals })
    expect(s.rules).toEqual(RULE_PRESETS.classic)
  })

  it('starting cash follows the chosen preset for both players', () => {
    // seed: 7 — Riley's random origin draw lands on 'career-changer' (a
    // no-op delta), so riley.cash reads the plain preset value with no
    // origin noise; see the newGame playerCashBonus describe block above.
    const brutal = newGame({
      playerName: 'T',
      goals: easyGoals,
      seed: 7,
      rules: RULE_PRESETS.brutal,
    })
    expect(brutal.player.cash).toBe(100)
    expect(brutal.riley.cash).toBe(100)

    const zen = newGame({ playerName: 'T', goals: easyGoals, seed: 7, rules: RULE_PRESETS.zen })
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
      // Wave 7's Expand personalEvent() additions:
      'lost their wallet',
      "'s post went viral",
      'jury duty',
      'car broke down',
      'surprise $',
      'fix something around the apartment',
      'incredibly lucky',
      'costly mistake',
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

describe('wilder global headlines', () => {
  it('fires the new boom/bust headlines meaningfully less often than an everyday one, aggregated across seeds', () => {
    // A single-seed comparison would be as fragile as the Casino RNG-sharing
    // note elsewhere in this file warns about — aggregate over many
    // seeds/weeks instead, same approach as the Brutal-vs-Zen tests above.
    // Goals no game can meet in 24 weeks, so a mid-loop win never cuts a
    // seed's sample short (same reasoning as the seasons describe block).
    const noWinGoals: Goals = { wealth: 1_000_000, happiness: 1000, education: 1000, career: 1000 }
    const WILDER_MARKERS = ['💥', '📉', '🔥', '🧊', '💣', '🐂']
    let wilderCount = 0
    let steadyCount = 0
    for (let seed = 0; seed < 30; seed++) {
      let s = newGame({ playerName: 'T', goals: noWinGoals, seed })
      for (let w = 0; w < 24; w++) {
        s = applyAction(s, { type: 'endWeek' })
        if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
        if (WILDER_MARKERS.some((m) => s.headline.includes(m))) wilderCount++
        if (s.headline === 'Steady week in the city.') steadyCount++
      }
    }
    expect(wilderCount).toBeGreaterThan(0) // the mechanism actually fires
    expect(wilderCount).toBeLessThan(steadyCount) // combined rare weight (0.7) < one common entry's (1)
  })

  it("applies a wilder headline's wage/market swing to the shared economy indices", () => {
    // Deterministic seed/week found by brute force where the very next
    // driftEconomy() call lands on the Boom year headline. Re-found (156 →
    // 194) after Wave 14's Origin backgrounds added a seeded RNG draw at
    // newGame() construction — see Standing Constraints' RNG-draw-count
    // fragility note.
    let s = newGame({ playerName: 'T', goals: easyGoals, seed: 194 })
    s.week = 4 // an ordinary week — not a season-transition or holiday week
    const priceIndexBefore = s.economy.priceIndex
    const wageIndexBefore = s.economy.wageIndex
    const marketIndexBefore = s.economy.marketIndex
    s = applyAction(s, { type: 'endWeek' })
    expect(s.headline).toBe('💥 Boom year — wages surge and the market takes off.')
    expect(s.economy.wageIndex).toBeGreaterThan(wageIndexBefore)
    expect(s.economy.marketIndex).toBeGreaterThan(marketIndexBefore)
    expect(s.economy.priceIndex).toBe(priceIndexBefore) // Boom year has no priceDelta
  })
})

describe('expanded personal events (Wave 7)', () => {
  // eventFrequency cranked up (triggerChance caps at 0.9) so a fixed,
  // brute-forced seed hits every new outcome within a bounded number of
  // weeks instead of needing a separate seed hunted per outcome.
  const highFrequencyRules = { ...RULE_PRESETS.classic, eventFrequency: 3 }
  const noWinGoals: Goals = { wealth: 1_000_000, happiness: 1000, education: 1000, career: 1000 }
  // Season transitions (weekInCycle 1/4/7/10) and Holiday one-offs
  // (2/3/11) override that week's usual roll entirely, and can themselves
  // move cash — a week landing on one of these could be mistaken for
  // personalEvent's own effect. Every outcome below was brute-forced to
  // land on a "free" week outside this set.
  const RESERVED_CYCLE_POSITIONS = new Set([1, 2, 3, 4, 7, 10, 11])
  function isFreeWeek(upcomingWeek: number): boolean {
    return !RESERVED_CYCLE_POSITIONS.has(weekInCycle(upcomingWeek))
  }

  // Neutralizes every OTHER thing endWeek() can do to cash/happiness/time
  // for a bare player, so a found/lost amount is provably personalEvent's
  // own contribution, not incidental noise: hot meals (no hunger penalty,
  // no cheap-food health drain that would eventually drag happiness down
  // once health crosses HEALTH_LOW_THRESHOLD), rent never due (secure
  // apartment, reset every week), and no maturing event chain landing in
  // the same week (resolveActiveEvents runs before personalEvent and would
  // otherwise inject its own cash change).
  function neutralizeConfounds(s: GameState) {
    s.player.fed = FOOD_NEEDED
    s.player.apartment = 'secure'
    s.player.rentDue = 0
    s.player.weeksBehindOnRent = 0
    s.player.activeEvents = []
  }

  // The secure apartment's own constant +2 "comfort" happiness (upkeep())
  // plus the drift-toward-50 are the only other things that can move
  // happiness once neutralizeConfounds() holds everything else still.
  // Predicting that baseline and diffing the real post-endWeek happiness
  // against it isolates personalEvent's own delta exactly, instead of
  // just checking direction.
  function predictedHappinessBeforePersonalEvent(happinessBefore: number): number {
    const withComfort = Math.min(100, happinessBefore + 2)
    return Math.round(withComfort + (50 - withComfort) * 0.05)
  }

  it('fires viral windfall, car trouble, surprise refund, costly mistake, lucky find, jury duty, and lost wallet with exact cash/happiness/time effects — seed found by brute force', () => {
    // Re-found (weeks, cash deltas, jury-duty hours) twice: once after Wave
    // 14's Origin backgrounds added a seeded RNG draw at newGame()
    // construction, and again after rebalancing the ORIGINS deltas
    // themselves — Riley's origin changes what her AI does with its turn
    // (runAIWeek), which changes how many rolls her turn consumes, which
    // shifts the shared stream for every week after. Same seed (0) still
    // hits all seven outcomes both times, just at different weeks/amounts;
    // see Standing Constraints' RNG-draw-count fragility note.
    const expected: Record<
      string,
      { week: number; cashDelta: number; happinessDelta: number; hours?: number }
    > = {
      "'s post went viral": {
        week: 4,
        cashDelta: 38,
        happinessDelta: VIRAL_WINDFALL_HAPPINESS_BONUS,
      },
      'car broke down': { week: 8, cashDelta: -100, happinessDelta: 0 },
      'surprise $': { week: 101, cashDelta: 74, happinessDelta: 0 },
      'jury duty': { week: 17, cashDelta: 0, happinessDelta: 0, hours: 12 },
      'incredibly lucky': { week: 29, cashDelta: 174, happinessDelta: LUCKY_FIND_HAPPINESS_BONUS },
      'costly mistake': {
        week: 11,
        cashDelta: -155,
        happinessDelta: -COSTLY_MISTAKE_HAPPINESS_PENALTY,
      },
      'lost their wallet': {
        week: 56,
        cashDelta: -58,
        happinessDelta: -LOST_WALLET_HAPPINESS_PENALTY,
      },
    }
    let s = newGame({ playerName: 'T', goals: noWinGoals, seed: 0, rules: highFrequencyRules })
    for (let w = 1; w <= 101; w++) {
      neutralizeConfounds(s)
      const cashBefore = s.player.cash
      const happinessBefore = s.player.happiness
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
      for (const [marker, exp] of Object.entries(expected)) {
        if (exp.week !== w) continue
        expect(isFreeWeek(w + 1)).toBe(true) // sanity: not a holiday/season override week
        const entry = s.lastReport?.entries.find(
          (e) => e.actor === 'player' && e.text.includes(marker)
        )
        expect(entry).toBeDefined()
        expect(s.player.cash - cashBefore).toBe(exp.cashDelta)
        expect(s.player.happiness - predictedHappinessBeforePersonalEvent(happinessBefore)).toBe(
          exp.happinessDelta
        )
        if (exp.hours !== undefined) {
          expect(s.player.timeLeft).toBe(WEEK_TIME - exp.hours)
        }
      }
    }
  })

  it('fires home repair only for a player with a place to fix, with an exact cash effect — seed found by brute force', () => {
    // Seed/week/cash-delta re-found twice (was seed 5/week 5/-$68, then seed
    // 0/week 23/-$122) — once after Wave 14's Origin backgrounds added a
    // seeded RNG draw at newGame() construction, and again after rebalancing
    // the ORIGINS deltas themselves shifted how many rolls Riley's AI turn
    // consumes. See Standing Constraints' RNG-draw-count fragility note.
    let s = applyAction(
      newGame({ playerName: 'T', goals: noWinGoals, seed: 0, rules: highFrequencyRules }),
      { type: 'travel', to: 'rentoffice' }
    )
    s = applyAction(s, { type: 'rentApartment', tier: 'basic' })
    // Weeks 1-23 pass uneventfully (this outcome needs an actual apartment,
    // so it can't reuse neutralizeConfounds()'s secure-apartment default);
    // week 24 is the target, isolated the same way — no rent due, no
    // maturing chain, no hunger — so the cash delta is provably this
    // outcome's own effect.
    for (let w = 1; w <= 23; w++) {
      s.player.fed = FOOD_NEEDED
      s.player.rentDue = 0
      s.player.weeksBehindOnRent = 0
      s.player.activeEvents = []
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    s.player.fed = FOOD_NEEDED
    s.player.rentDue = 0
    s.player.weeksBehindOnRent = 0
    s.player.activeEvents = []
    const cashBefore = s.player.cash
    s = applyAction(s, { type: 'endWeek' })
    const repair = s.lastReport?.entries.find(
      (e) => e.actor === 'player' && e.text.includes('fix something around the apartment')
    )
    expect(repair).toBeDefined()
    expect(s.player.cash - cashBefore).toBe(-66)
  })

  it("caps a cash-cost outcome at the player's available cash, never going negative", () => {
    // Same cap pattern as the doctor's bill (case 1) and Holiday one-offs'
    // tax week — targets the known costly-mistake week from the first test
    // above (week 11, $155 cost — re-found alongside it after Wave 14's
    // Origin backgrounds shifted the RNG stream) with far less cash than
    // that on hand.
    let s = newGame({ playerName: 'T', goals: noWinGoals, seed: 0, rules: highFrequencyRules })
    for (let w = 1; w <= 11; w++) {
      neutralizeConfounds(s)
      if (w === 11) s.player.cash = 10 // below the $155 this week is about to cost
      s = applyAction(s, { type: 'endWeek' })
      if (s.phase === 'weekReport') s = applyAction(s, { type: 'dismissReport' })
    }
    const mistake = s.lastReport?.entries.find(
      (e) => e.actor === 'player' && e.text.includes('costly mistake')
    )
    expect(mistake).toBeDefined()
    expect(s.player.cash).toBe(0) // capped, not -277
  })
})
