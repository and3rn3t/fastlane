// Jones — the rival. Each week he runs this priority-driven policy using the
// exact same action functions (and therefore rules) as the human player.

import * as act from './actions'
import { EngineError } from './actions'
import { ITEMS, JOBS, RENT, TUITION, jobById, travelCost } from './data'
import { careerScore } from './week'
import type { GameState, ItemId, JobDef, LocationId } from './types'

const KEY = 'jones'

function jones(state: GameState) {
  return state.jones
}

/** Cash Jones tries to keep on hand for rent and food before splurging. */
function reserve(state: GameState): number {
  return act.price(state, RENT.basic) + 60
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

/** Travel if needed; false if he can't afford the time. */
function goTo(state: GameState, to: LocationId): boolean {
  const p = jones(state)
  if (p.location === to) return true
  if (travelCost(p.location, to, act.hasItem(p, 'bike')) > p.timeLeft) return false
  return attempt(() => act.travel(state, KEY, to))
}

function ensureFood(state: GameState): boolean {
  const p = jones(state)
  const needed = act.foodShortfall(p)
  if (needed === 0) return false
  const unitCost = act.price(state, 4)
  if (p.cash < unitCost * needed + 10) return false
  if (!goTo(state, 'megamart')) return false
  const stockUp = act.hasItem(p, 'fridge') ? needed + 6 : needed
  const affordable = Math.floor((p.cash - 10) / unitCost)
  const cap = act.groceryCap(p) - p.groceries
  const units = Math.min(stockUp, affordable, cap)
  if (units < 1) return false
  return attempt(() => act.buyGroceries(state, KEY, units))
}

function ensureHousing(state: GameState): boolean {
  const p = jones(state)
  if (p.apartment === 'none') {
    if (p.cash < act.price(state, RENT.basic) * 1.5) return false
    if (!goTo(state, 'rentoffice')) return false
    return attempt(() => act.rentApartment(state, KEY, 'basic'))
  }
  if (p.rentDue > 0 && p.cash >= p.rentDue) {
    if (!act.hasItem(p, 'phone') && !goTo(state, 'rentoffice')) return false
    return attempt(() => act.payRent(state, KEY))
  }
  return false
}

function bestQualifiedJob(state: GameState): JobDef | null {
  const p = jones(state)
  const current = careerScore(p)
  const candidates = JOBS.filter(
    (j) => j.prestige > current && act.qualifiesFor(p, j.id).ok
  ).sort((a, b) => b.prestige - a.prestige)
  return candidates[0] ?? null
}

/** The job Jones is working toward: lowest-prestige job above his current one. */
function nextTargetJob(state: GameState): JobDef | null {
  const p = jones(state)
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current).sort((a, b) => a.prestige - b.prestige)
  return candidates[0] ?? null
}

function pursueCareer(state: GameState): boolean {
  const p = jones(state)
  const better = bestQualifiedJob(state)
  if (better) {
    if (!act.hasItem(p, 'phone') && !goTo(state, 'employment')) return false
    return attempt(() => act.applyJob(state, KEY, better.id))
  }
  const target = nextTargetJob(state)
  if (!target) return false
  // Clear the cheapest blocker: dress first (one purchase), then education.
  if (p.dress < target.minDress) {
    const outfit = ITEMS.filter((i) => (i.dress ?? 0) >= target.minDress).sort(
      (a, b) => a.price - b.price
    )[0]
    if (outfit && p.cash >= act.price(state, outfit.price) + reserve(state)) {
      if (!goTo(state, 'clothing')) return false
      return attempt(() => act.buyItem(state, KEY, outfit.id))
    }
  }
  if (p.education < target.minEducation) {
    return studyOnce(state)
  }
  return false
}

function studyOnce(state: GameState): boolean {
  const p = jones(state)
  if (p.cash < act.price(state, TUITION) + reserve(state)) return false
  if (!goTo(state, 'university')) return false
  return attempt(() => act.takeClass(state, KEY))
}

function workShift(state: GameState, maxHours: number): boolean {
  const p = jones(state)
  if (!p.jobId) return false
  const job = jobById(p.jobId)
  if (!goTo(state, job.workplace)) return false
  const hours = Math.min(maxHours, p.timeLeft)
  if (hours < 1) return false
  return attempt(() => act.work(state, KEY, hours))
}

function pursueHappiness(state: GameState): boolean {
  const p = jones(state)
  if (p.happiness >= state.goals.happiness) return false
  const fun: ItemId[] = ['tv', 'stereo', 'console']
  const toBuy = fun.find((id) => !act.hasItem(p, id))
  if (toBuy) {
    const item = ITEMS.find((i) => i.id === toBuy)!
    if (p.cash >= act.price(state, item.price) + reserve(state) * 2) {
      if (!goTo(state, 'gadgets')) return false
      return attempt(() => act.buyItem(state, KEY, toBuy))
    }
  }
  if (p.apartment !== 'none' && p.relaxedThisWeek < 10) {
    if (!goTo(state, 'home')) return false
    return attempt(() => act.relax(state, KEY, Math.min(4, p.timeLeft)))
  }
  return false
}

function bankSurplus(state: GameState): boolean {
  const p = jones(state)
  const surplus = p.cash - reserve(state) * 3
  if (surplus < 200) return false
  if (!goTo(state, 'bank')) return false
  return attempt(() => act.deposit(state, KEY, Math.round(surplus)))
}

/** Play out Jones's week. Called by the reducer before end-of-week upkeep. */
export function runJonesWeek(state: GameState) {
  const p = jones(state)
  let guard = 0
  while (p.timeLeft > 0 && guard < 80) {
    guard += 1
    const g = state.goals

    if (ensureFood(state)) continue
    if (ensureHousing(state)) continue
    if (pursueCareer(state)) continue

    const behindOnMoney = act.netWorth(p) < g.wealth
    const behindOnEdu = p.education < g.education
    const behindOnFun = p.happiness < g.happiness

    // Keep a working float before anything else.
    if (p.cash < reserve(state) && workShift(state, 20)) continue
    if (behindOnEdu && studyOnce(state)) continue
    if (behindOnFun && p.cash > reserve(state) * 2 && pursueHappiness(state)) continue
    if (behindOnMoney && workShift(state, 25)) continue
    if (bankSurplus(state)) continue
    // Nothing better to do: top up happiness, then run out the clock working.
    if (pursueHappiness(state)) continue
    if (workShift(state, p.timeLeft)) continue
    break
  }
}
