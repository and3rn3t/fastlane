// The AI policy — a priority-driven agent using the exact same action
// functions (and therefore rules) as the human player. Runs Riley's turn in
// the real game; parameterized by PlayerKey (rather than hardcoded to
// 'riley') so scripts/sim.ts can also run it for 'player' in an AI-vs-AI
// balance simulation, with zero behavior change for the real game.
//
// AI_PROFILES layers named weight presets on top of that shared policy —
// same decision tree, different thresholds (and, for Gambler, one extra
// branch). 'balanced' reproduces the original single-policy behavior
// exactly (all multipliers neutral, no eager study, no gambling), so it's
// the only profile the sim's baseline and an unmigrated save assume.

import * as act from './actions'
import { EngineError } from './actions'
import {
  CASINO_MAX_BET,
  CASINO_MIN_BET,
  DOCTOR_PRICE,
  HEALTH_SICK_THRESHOLD,
  ITEMS,
  JOBS,
  RENT,
  TUITION,
  itemById,
  jobById,
  travelCost,
} from './data'
import { careerScore } from './week'
import type { AiProfileName, GameState, ItemId, JobDef, LocationId, PlayerKey } from './types'

export interface AiProfile {
  name: string
  /** Multiplier on the price half of the cash reserve (RENT.basic × this + 60). */
  reserveMultiplier: number
  /** Extra hours layered onto both work-shift priority caps. */
  extraWorkHours: number
  /** Studies proactively once affordable, not just when behind a job's requirement. */
  studyEagerly: boolean
  /** Stakes a cut of spare cash at the casino instead of banking all of it. */
  gambles: boolean
}

export const AI_PROFILES: Record<AiProfileName, AiProfile> = {
  balanced: {
    name: 'Balanced',
    reserveMultiplier: 1,
    extraWorkHours: 0,
    studyEagerly: false,
    gambles: false,
  },
  hustler: {
    name: 'Hustler',
    reserveMultiplier: 0.6,
    extraWorkHours: 10,
    studyEagerly: false,
    gambles: false,
  },
  scholar: {
    name: 'Scholar',
    reserveMultiplier: 1,
    extraWorkHours: 0,
    studyEagerly: true,
    gambles: false,
  },
  gambler: {
    name: 'Gambler',
    reserveMultiplier: 1,
    extraWorkHours: 0,
    studyEagerly: false,
    gambles: true,
  },
}

function get(state: GameState, key: PlayerKey) {
  return state[key]
}

/** Cash the AI tries to keep on hand for rent and food before splurging. */
function reserve(state: GameState, profile: AiProfile): number {
  return act.price(state, RENT.basic) * profile.reserveMultiplier + 60
}

function attempt(fn: () => void): boolean {
  try {
    fn()
    return true
  } catch (e) {
    if (e instanceof EngineError) return false
    throw e
  }
}

/** Travel if needed; false if they can't afford the time. */
function goTo(state: GameState, key: PlayerKey, to: LocationId): boolean {
  const p = get(state, key)
  if (p.location === to) return true
  if (travelCost(p.location, to, act.hasItem(p, 'bike')) > p.timeLeft) return false
  return attempt(() => act.travel(state, key, to))
}

function ensureFood(state: GameState, key: PlayerKey): boolean {
  const p = get(state, key)
  const needed = act.foodShortfall(p)
  if (needed === 0) return false
  const unitCost = act.price(state, 4)
  if (p.cash < unitCost * needed + 10) return false
  if (!goTo(state, key, 'megamart')) return false
  const stockUp = act.hasItem(p, 'fridge') ? needed + 6 : needed
  const affordable = Math.floor((p.cash - 10) / unitCost)
  const cap = act.groceryCap(p) - p.groceries
  const units = Math.min(stockUp, affordable, cap)
  if (units < 1) return false
  return attempt(() => act.buyGroceries(state, key, units))
}

function ensureHousing(state: GameState, key: PlayerKey): boolean {
  const p = get(state, key)
  if (p.apartment === 'none') {
    if (p.cash < act.price(state, RENT.basic) * 1.5) return false
    if (!goTo(state, key, 'rentoffice')) return false
    return attempt(() => act.rentApartment(state, key, 'basic'))
  }
  if (p.rentDue > 0 && p.cash >= p.rentDue) {
    if (!act.hasItem(p, 'phone') && !goTo(state, key, 'rentoffice')) return false
    return attempt(() => act.payRent(state, key))
  }
  return false
}

function ensureHealth(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  if (p.health >= HEALTH_SICK_THRESHOLD) return false
  if (p.cash < act.price(state, DOCTOR_PRICE) + reserve(state, profile)) return false
  if (!goTo(state, key, 'clinic')) return false
  return attempt(() => act.seeDoctor(state, key))
}

function bestQualifiedJob(state: GameState, key: PlayerKey): JobDef | null {
  const p = get(state, key)
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current && act.qualifiesFor(p, j.id).ok).sort(
    (a, b) => b.prestige - a.prestige
  )
  return candidates[0] ?? null
}

/** The job this AI is working toward: lowest-prestige job above their current one. */
function nextTargetJob(state: GameState, key: PlayerKey): JobDef | null {
  const p = get(state, key)
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current).sort(
    (a, b) => a.prestige - b.prestige
  )
  return candidates[0] ?? null
}

function pursueCareer(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  const better = bestQualifiedJob(state, key)
  if (better) {
    if (!act.hasItem(p, 'phone') && !goTo(state, key, 'employment')) return false
    return attempt(() => act.applyJob(state, key, better.id))
  }
  const target = nextTargetJob(state, key)
  if (!target) return false
  // Clear the cheapest blocker: dress first (one purchase), then education.
  if (p.dress < target.minDress) {
    const outfit = ITEMS.filter((i) => (i.dress ?? 0) >= target.minDress).sort(
      (a, b) => a.price - b.price
    )[0]
    if (outfit && p.cash >= act.price(state, outfit.price) + reserve(state, profile)) {
      if (!goTo(state, key, 'clothing')) return false
      return attempt(() => act.buyItem(state, key, outfit.id))
    }
  }
  if (target.requiresComputer && !act.hasItem(p, 'computer')) {
    const computer = itemById('computer')
    if (p.cash >= act.price(state, computer.price) + reserve(state, profile)) {
      if (!goTo(state, key, 'gadgets')) return false
      return attempt(() => act.buyItem(state, key, 'computer'))
    }
  }
  if (p.education < target.minEducation) {
    return studyOnce(state, key, profile)
  }
  return false
}

/** Once there's something worth protecting and cash to spare, insure it —
 * cheaper than risking a burglary replay every uninsured week. */
function protectValuables(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  if (p.items.length === 0 || act.hasItem(p, 'insurance')) return false
  const insurance = itemById('insurance')
  if (p.cash < act.price(state, insurance.price) + reserve(state, profile) * 2) return false
  if (!goTo(state, key, 'bank')) return false
  return attempt(() => act.buyItem(state, key, 'insurance'))
}

function studyOnce(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  if (p.cash < act.price(state, TUITION) + reserve(state, profile)) return false
  if (!goTo(state, key, 'university')) return false
  return attempt(() => act.takeClass(state, key))
}

function workShift(state: GameState, key: PlayerKey, maxHours: number): boolean {
  const p = get(state, key)
  if (!p.jobId) return false
  const job = jobById(p.jobId)
  if (!goTo(state, key, job.workplace)) return false
  const hours = Math.min(maxHours, p.timeLeft)
  if (hours < 1) return false
  return attempt(() => act.work(state, key, hours))
}

function pursueHappiness(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  if (p.happiness >= state.goals.happiness) return false
  const fun: ItemId[] = ['tv', 'stereo', 'console']
  const toBuy = fun.find((id) => !act.hasItem(p, id))
  if (toBuy) {
    const item = ITEMS.find((i) => i.id === toBuy)!
    if (p.cash >= act.price(state, item.price) + reserve(state, profile) * 2) {
      if (!goTo(state, key, 'gadgets')) return false
      return attempt(() => act.buyItem(state, key, toBuy))
    }
  }
  if (p.apartment !== 'none' && p.relaxedThisWeek < 10) {
    if (!goTo(state, key, 'home')) return false
    return attempt(() => act.relax(state, key, Math.min(4, p.timeLeft)))
  }
  return false
}

function bankSurplus(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  const surplus = p.cash - reserve(state, profile) * 3
  if (surplus < 200) return false
  if (!goTo(state, key, 'bank')) return false
  return attempt(() => act.deposit(state, key, Math.round(surplus)))
}

/** Gambler only: stakes a fifth of genuine surplus at the casino instead of
 * banking all of it. Doesn't decide *whether* to gamble via an extra RNG
 * roll — only the spin's outcome consumes one, via the normal playCasino
 * action — so this stays deterministic given the profile and state. */
function gambleAtCasino(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  if (!profile.gambles) return false
  const p = get(state, key)
  const surplus = p.cash - reserve(state, profile) * 3
  if (surplus < CASINO_MIN_BET) return false
  const bet = Math.min(CASINO_MAX_BET, Math.round(surplus * 0.2))
  if (!goTo(state, key, 'casino')) return false
  return attempt(() => act.playCasino(state, key, bet))
}

/** Plays out one player's week using the AI policy. Called by the reducer
 * for 'riley' before end-of-week upkeep in the real game; scripts/sim.ts
 * also calls it for 'player' to run AI-vs-AI balance simulations. Defaults
 * to the Balanced profile, which reproduces the original single-policy
 * behavior exactly. */
export function runAIWeek(
  state: GameState,
  key: PlayerKey,
  profile: AiProfile = AI_PROFILES.balanced
) {
  const p = get(state, key)
  let guard = 0
  while (p.timeLeft > 0 && guard < 80) {
    guard += 1
    const g = state.goals

    if (ensureFood(state, key)) continue
    if (ensureHousing(state, key)) continue
    if (ensureHealth(state, key, profile)) continue
    if (pursueCareer(state, key, profile)) continue

    const behindOnMoney = act.netWorth(p) < g.wealth
    const behindOnEdu = p.education < g.education
    const behindOnFun = p.happiness < g.happiness
    const workCap = 20 + profile.extraWorkHours
    const pushCap = 25 + profile.extraWorkHours

    // Keep a working float before anything else.
    if (p.cash < reserve(state, profile) && workShift(state, key, workCap)) continue
    if (behindOnEdu && studyOnce(state, key, profile)) continue
    if (
      behindOnFun &&
      p.cash > reserve(state, profile) * 2 &&
      pursueHappiness(state, key, profile)
    ) {
      continue
    }
    if (behindOnMoney && workShift(state, key, pushCap)) continue
    if (protectValuables(state, key, profile)) continue
    // Scholar only: reinvests genuine surplus into more classes instead of
    // banking it, rather than studying before securing income — that
    // ordering change is what separates "studies proactively" from "goes
    // broke chasing tuition," which an earlier top-priority version did.
    if (profile.studyEagerly && studyOnce(state, key, profile)) continue
    if (gambleAtCasino(state, key, profile)) continue
    if (bankSurplus(state, key, profile)) continue
    // Nothing better to do: top up happiness, then run out the clock working.
    if (pursueHappiness(state, key, profile)) continue
    if (workShift(state, key, p.timeLeft)) continue
    break
  }
}
