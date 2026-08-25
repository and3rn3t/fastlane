// End-of-week processing: upkeep for both players, economy drift, random
// events, the rival's simulated week, and the victory check.

import { foodShortfall, hasItem, netWorth, price } from './actions'
import {
  CREDIT_GAIN_ON_PAYMENT,
  CREDIT_LOSS_ON_MISS,
  DRESS_WEAR_PER_WEEK,
  EVICTION_WEEKS,
  FOOD_NEEDED,
  HEALTH_CHEAP_FOOD_DRAIN,
  HEALTH_LOW_HAPPINESS_PENALTY,
  HEALTH_LOW_THRESHOLD,
  HEALTH_OVERWORK_RATE,
  HEALTH_SICK_THRESHOLD,
  ITEM_THEFT_CHANCE,
  LOAN_INTEREST_RATE,
  LOAN_MISSED_WEEKS_FOR_GARNISHMENT,
  LOTTERY_WIN_CHANCE,
  MAX_PROMOTIONS,
  OVERWORK_THRESHOLD,
  PROMOTION_PRESTIGE_BONUS,
  PROMOTION_TENURE_WEEKS,
  RENT,
  WEEK_TIME,
  itemById,
  jobById,
} from './data'
import { roll, rollInt } from './rng'
import type { GameState, Goals, PlayerKey, PlayerState } from './types'

function log(state: GameState, actor: PlayerKey | 'world', text: string) {
  state.log.push({ week: state.week, actor, text })
}

export function careerScore(p: PlayerState): number {
  if (!p.jobId) return 0
  return Math.min(100, jobById(p.jobId).prestige + p.promotionLevel * PROMOTION_PRESTIGE_BONUS)
}

export function meetsGoals(p: PlayerState, goals: Goals): boolean {
  return (
    netWorth(p) >= goals.wealth &&
    p.happiness >= goals.happiness &&
    p.education >= goals.education &&
    careerScore(p) >= goals.career
  )
}

/** Fraction of the way to victory, 0–1, for progress bars and AI planning. */
export function goalProgress(p: PlayerState, goals: Goals) {
  return {
    wealth: Math.min(1, netWorth(p) / goals.wealth),
    happiness: Math.min(1, p.happiness / goals.happiness),
    education: Math.min(1, p.education / goals.education),
    career: Math.min(1, careerScore(p) / goals.career),
  }
}

/** Overwork and a groceries-only diet both cost health; low health then
 * drags happiness down too. Split out of upkeep() to keep it readable. */
function healthUpkeep(state: GameState, key: PlayerKey, fedFromGroceries: number) {
  const p = state[key]
  const who = p.name

  const overHours = p.hoursWorkedThisWeek - OVERWORK_THRESHOLD
  if (overHours > 0) {
    const drain = Math.round(overHours * HEALTH_OVERWORK_RATE)
    p.health = Math.max(0, p.health - drain)
    log(state, key, `${who} overworked (${p.hoursWorkedThisWeek}h): health -${drain}`)
  }

  const ateWithoutGoingHungry = p.fed + fedFromGroceries >= FOOD_NEEDED
  if (ateWithoutGoingHungry && fedFromGroceries > p.fed) {
    p.health = Math.max(0, p.health - HEALTH_CHEAP_FOOD_DRAIN)
    log(state, key, `${who} lived on cheap groceries all week: health -${HEALTH_CHEAP_FOOD_DRAIN}`)
  }

  if (p.health < HEALTH_LOW_THRESHOLD) {
    p.happiness = Math.max(0, p.happiness - HEALTH_LOW_HAPPINESS_PENALTY)
  }
}

/** Tenure builds while employed and showing up (working ≥1h that week); a
 * no-show week resets the clock toward the *next* promotion without rolling
 * back one already earned. Split out of upkeep() to keep it readable. */
function careerUpkeep(state: GameState, key: PlayerKey) {
  const p = state[key]
  if (!p.jobId) {
    p.jobTenureWeeks = 0
    return
  }
  if (p.hoursWorkedThisWeek > 0) {
    p.jobTenureWeeks += 1
  } else {
    p.jobTenureWeeks = 0
    return
  }
  const eligibleLevel = Math.min(
    MAX_PROMOTIONS,
    Math.floor(p.jobTenureWeeks / PROMOTION_TENURE_WEEKS)
  )
  if (eligibleLevel > p.promotionLevel) {
    p.promotionLevel = eligibleLevel
    const job = jobById(p.jobId)
    log(state, key, `${p.name} got promoted at ${job.title} (level ${eligibleLevel})`)
  }
}

/** Durable goods at an unsecured, uninsured home can be stolen — a roll
 * independent of the cash robbery in upkeep(), so a broke player can still
 * lose a TV. Split out to keep upkeep() readable. */
function burglaryUpkeep(state: GameState, key: PlayerKey) {
  const p = state[key]
  const who = p.name
  const stealable = p.items.filter((id) => id !== 'insurance')
  if (
    stealable.length === 0 ||
    p.apartment === 'secure' ||
    hasItem(p, 'insurance') ||
    roll(state) >= ITEM_THEFT_CHANCE
  ) {
    return
  }
  const stolenId = stealable[rollInt(state, stealable.length)]
  const item = itemById(stolenId)
  p.items = p.items.filter((id) => id !== stolenId)
  if (item.dress !== undefined) p.dress = Math.min(p.dress, 10)
  p.happiness = Math.max(0, p.happiness - 6)
  log(state, key, `${who}'s ${item.name} was stolen!`)
}

/** Interest accrues on any outstanding balance every week regardless of
 * payment; a payment (voluntary or garnished, tracked via
 * loanPaidThisWeek) raises credit and resets the missed-weeks clock, a
 * skipped week lowers credit and — after enough of them — triggers
 * garnishment in work(). Split out to keep upkeep() readable. */
function loanUpkeep(state: GameState, key: PlayerKey) {
  const p = state[key]
  const who = p.name
  if (p.loanBalance <= 0) {
    p.loanWeeksBehind = 0
    return
  }
  const interest = Math.round(p.loanBalance * LOAN_INTEREST_RATE)
  p.loanBalance += interest
  if (interest > 0) log(state, key, `${who}'s loan accrued $${interest} interest`)

  if (p.loanPaidThisWeek) {
    p.loanWeeksBehind = 0
    p.creditScore = Math.min(100, p.creditScore + CREDIT_GAIN_ON_PAYMENT)
    return
  }
  p.loanWeeksBehind += 1
  p.creditScore = Math.max(0, p.creditScore - CREDIT_LOSS_ON_MISS)
  if (p.loanWeeksBehind >= LOAN_MISSED_WEEKS_FOR_GARNISHMENT && !p.garnished) {
    p.garnished = true
    log(state, key, `${who}'s wages are being garnished for the unpaid loan!`)
  }
}

function upkeep(state: GameState, key: PlayerKey) {
  const p = state[key]
  const who = p.name

  // Eat: meals eaten during the week count, then groceries fill the gap.
  const shortfall = foodShortfall(p)
  const fromGroceries = Math.min(p.groceries, Math.max(0, FOOD_NEEDED - p.fed))
  p.groceries -= fromGroceries
  if (shortfall > 0) {
    p.happiness = Math.max(0, p.happiness - 4 * shortfall)
    log(state, key, `${who} went hungry (${shortfall} meals short): happiness -${4 * shortfall}`)
  }
  healthUpkeep(state, key, fromGroceries)

  // Rent accrues; miss enough weeks and you're out.
  if (p.apartment !== 'none') {
    const rent = price(state, RENT[p.apartment])
    p.rentDue += rent
    if (p.rentDue > rent) {
      p.weeksBehindOnRent += 1
      if (p.weeksBehindOnRent >= EVICTION_WEEKS) {
        p.apartment = 'none'
        p.rentDue = 0
        p.weeksBehindOnRent = 0
        p.happiness = Math.max(0, p.happiness - 12)
        log(state, key, `${who} was evicted for unpaid rent!`)
      }
    }
  } else {
    p.happiness = Math.max(0, p.happiness - 6)
    p.groceries = 0 // nowhere to store food
    log(state, key, `${who} slept rough: happiness -6`)
  }

  // Possessions and apartment comfort.
  let passive = 0
  for (const id of p.items) passive += itemById(id).weeklyHappiness ?? 0
  if (p.apartment === 'secure') passive += 2
  if (passive > 0) p.happiness = Math.min(100, p.happiness + passive)

  // Happiness drifts toward a neutral 50 — comfort must be maintained.
  p.happiness = Math.round(p.happiness + (50 - p.happiness) * 0.05)

  // Clothes wear out.
  p.dress = Math.max(0, p.dress - DRESS_WEAR_PER_WEEK)

  // Savings interest.
  if (p.savings > 0) {
    const interest = Math.round(p.savings * state.economy.interestRate)
    p.savings += interest
    if (interest > 0) log(state, key, `${who} earned $${interest} interest`)
  }

  // Street crime: carrying a lot of cash with no secure place to keep it.
  if (p.cash > 400 && p.apartment !== 'secure' && roll(state) < 0.12) {
    const stolen = Math.round(p.cash * 0.4)
    p.cash -= stolen
    p.happiness = Math.max(0, p.happiness - 8)
    log(state, key, `${who} was robbed of $${stolen}!`)
  }

  burglaryUpkeep(state, key)
  loanUpkeep(state, key)

  // Lottery draw.
  if (p.lotteryTickets > 0) {
    if (roll(state) < LOTTERY_WIN_CHANCE * p.lotteryTickets) {
      const jackpot = Math.round(state.economy.lotteryJackpot)
      p.cash += jackpot
      p.happiness = Math.min(100, p.happiness + 10)
      state.economy.lotteryJackpot = 500
      log(state, key, `${who} WON THE LOTTERY: $${jackpot}!`)
    }
    p.lotteryTickets = 0
  }

  careerUpkeep(state, key)

  // Fresh week.
  p.fed = 0
  p.relaxedThisWeek = 0
  p.hoursWorkedThisWeek = 0
  p.loanPaidThisWeek = false
  p.timeLeft = WEEK_TIME
  p.location = 'home'
}

// Percentage/point deltas, not multipliers directly — driftEconomy() scales
// each by rules.economyVolatility before applying it, so Brutal/Zen presets
// don't need their own copy of this table.
const HEADLINES: Array<{
  text: string
  priceDelta?: number
  wageDelta?: number
  interestDelta?: number
}> = [
  { text: 'Steady week in the city.' },
  { text: 'Inflation ticks up — prices rise.', priceDelta: 0.05 },
  { text: 'Retail price war! Prices dip.', priceDelta: -0.05 },
  { text: 'Labor shortage — wages climb.', wageDelta: 0.05 },
  { text: 'Layoffs downtown — wages soften.', wageDelta: -0.04 },
  { text: 'Fed hikes rates — savers rejoice.', interestDelta: 0.002 },
  { text: 'Rates cut — savings earn less.', interestDelta: -0.002 },
]

function personalEvent(state: GameState, key: PlayerKey) {
  const p = state[key]
  const triggerChance = Math.min(0.9, 0.35 * state.rules.eventFrequency)
  if (roll(state) >= triggerChance) return
  const which = rollInt(state, 5)
  switch (which) {
    case 0: {
      const found = 10 + rollInt(state, 40)
      p.cash += found
      log(state, key, `${p.name} found $${found} on the sidewalk`)
      break
    }
    case 1: {
      const bill = 20 + rollInt(state, 60)
      const paid = Math.min(bill, p.cash)
      p.cash -= paid
      log(state, key, `${p.name} got hit with a $${paid} doctor's bill`)
      break
    }
    case 2: {
      if (p.jobId && roll(state) < 0.5) {
        const bonus = Math.round(20 + rollInt(state, 30) * state.economy.wageIndex)
        p.cash += bonus
        log(state, key, `${p.name} got a $${bonus} bonus at work`)
      }
      break
    }
    case 3: {
      p.happiness = Math.min(100, p.happiness + 3)
      log(state, key, `${p.name} ran into an old friend (+3 happiness)`)
      break
    }
    case 4: {
      // Health was just reset for the upcoming week (upkeep ran first), so
      // this lost time comes out of next week, same as a real sick day would.
      if (p.health < HEALTH_SICK_THRESHOLD) {
        const cost = Math.min(4 + rollInt(state, 8), p.timeLeft)
        p.timeLeft -= cost
        p.happiness = Math.max(0, p.happiness - 5)
        log(state, key, `${p.name} got sick and lost ${cost}h recovering`)
      } else {
        log(state, key, `${p.name} felt a cold coming on but shook it off`)
      }
      break
    }
  }
}

function driftEconomy(state: GameState) {
  const headline = HEADLINES[rollInt(state, HEADLINES.length)]
  const v = state.rules.economyVolatility
  if (headline.priceDelta) state.economy.priceIndex *= 1 + headline.priceDelta * v
  if (headline.wageDelta) state.economy.wageIndex *= 1 + headline.wageDelta * v
  if (headline.interestDelta) {
    state.economy.interestRate = Math.max(
      0.002,
      Math.min(0.012, state.economy.interestRate + headline.interestDelta * v)
    )
  }
  state.headline = headline.text
  // Clamp so a long game can't run away.
  state.economy.priceIndex = Math.min(1.6, Math.max(0.7, state.economy.priceIndex))
  state.economy.wageIndex = Math.min(1.6, Math.max(0.7, state.economy.wageIndex))
  state.economy.lotteryJackpot = Math.round(state.economy.lotteryJackpot * 1.1)
  log(state, 'world', headline.text)
}

/**
 * Close out the week for both players. The caller (reducer) is responsible for
 * running the AI's turn *before* this, so both have spent their time.
 *
 * @param logStart Index into state.log where this week's report should start
 *   — must be captured by the caller *before* Riley's turn runs, so the
 *   report actually includes it (see the endWeek case in engine.ts).
 */
export function endWeek(state: GameState, logStart: number) {
  upkeep(state, 'player')
  upkeep(state, 'riley')
  personalEvent(state, 'player')
  personalEvent(state, 'riley')
  driftEconomy(state)

  const playerWins = meetsGoals(state.player, state.goals)
  const rileyWins = meetsGoals(state.riley, state.goals)
  if (playerWins || rileyWins) {
    state.phase = 'over'
    // Ties go to the human — Riley has enough advantages.
    state.winner = playerWins ? 'player' : 'riley'
  } else {
    state.phase = 'weekReport'
  }

  state.lastReport = {
    week: state.week,
    headline: state.headline,
    entries: state.log.slice(logStart),
  }
  state.history.push({
    week: state.week,
    playerNetWorth: netWorth(state.player),
    playerCareer: careerScore(state.player),
    rileyNetWorth: netWorth(state.riley),
    rileyCareer: careerScore(state.riley),
  })
  state.week += 1
}
