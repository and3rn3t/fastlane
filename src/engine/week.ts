// End-of-week processing: upkeep for both players, economy drift, random
// events, the rival's simulated week, and the victory check.

import { foodShortfall, netWorth, price } from './actions'
import {
  DRESS_WEAR_PER_WEEK,
  EVICTION_WEEKS,
  FOOD_NEEDED,
  LOTTERY_WIN_CHANCE,
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
  return p.jobId ? jobById(p.jobId).prestige : 0
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

  // Fresh week.
  p.fed = 0
  p.relaxedThisWeek = 0
  p.timeLeft = WEEK_TIME
  p.location = 'home'
}

const HEADLINES: Array<{ text: string; apply: (s: GameState) => void }> = [
  { text: 'Steady week in the city.', apply: () => {} },
  { text: 'Inflation ticks up — prices rise.', apply: (s) => (s.economy.priceIndex *= 1.05) },
  { text: 'Retail price war! Prices dip.', apply: (s) => (s.economy.priceIndex *= 0.95) },
  { text: 'Labor shortage — wages climb.', apply: (s) => (s.economy.wageIndex *= 1.05) },
  { text: 'Layoffs downtown — wages soften.', apply: (s) => (s.economy.wageIndex *= 0.96) },
  { text: 'Fed hikes rates — savers rejoice.', apply: (s) => (s.economy.interestRate = Math.min(0.012, s.economy.interestRate + 0.002)) },
  { text: 'Rates cut — savings earn less.', apply: (s) => (s.economy.interestRate = Math.max(0.002, s.economy.interestRate - 0.002)) },
]

function personalEvent(state: GameState, key: PlayerKey) {
  const p = state[key]
  if (roll(state) >= 0.35) return
  const which = rollInt(state, 4)
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
  }
}

function driftEconomy(state: GameState) {
  const headline = HEADLINES[rollInt(state, HEADLINES.length)]
  headline.apply(state)
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
 */
export function endWeek(state: GameState) {
  const logStart = state.log.length

  upkeep(state, 'player')
  upkeep(state, 'jones')
  personalEvent(state, 'player')
  personalEvent(state, 'jones')
  driftEconomy(state)

  const playerWins = meetsGoals(state.player, state.goals)
  const jonesWins = meetsGoals(state.jones, state.goals)
  if (playerWins || jonesWins) {
    state.phase = 'over'
    // Ties go to the human — Jones has enough advantages.
    state.winner = playerWins ? 'player' : 'jones'
  } else {
    state.phase = 'weekReport'
  }

  state.lastReport = {
    week: state.week,
    headline: state.headline,
    entries: state.log.slice(logStart),
  }
  state.week += 1
}
