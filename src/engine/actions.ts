// Per-player action implementations. Each mutates a draft GameState in place
// and throws EngineError on invalid moves; the reducer and the AI both call
// these so human and rival play by identical rules.

import {
  FOOD_NEEDED,
  GROCERY_CAP_BASE,
  GROCERY_CAP_FRIDGE,
  GROCERY_PRICE_MARKET,
  GROCERY_PRICE_MEGAMART,
  LOCATIONS,
  LOTTERY_TICKET_PRICE,
  MEAL_PRICE,
  MEAL_TIME,
  CLASS_TIME,
  PAWN_RATE,
  RELAX_CAP,
  RENT,
  TUITION,
  itemById,
  jobById,
  travelCost,
} from './data'
import type { ApartmentTier, GameState, ItemId, LocationId, PlayerKey, PlayerState } from './types'

export class EngineError extends Error {}

function require_(cond: boolean, message: string): asserts cond {
  if (!cond) throw new EngineError(message)
}

export function price(state: GameState, base: number): number {
  return Math.round(base * state.economy.priceIndex)
}

export function wagePerHour(state: GameState, jobId: string): number {
  return jobById(jobId).wage * state.economy.wageIndex
}

function spendTime(p: PlayerState, units: number) {
  require_(units <= p.timeLeft, 'Not enough time left this week')
  p.timeLeft -= units
}

function spendCash(p: PlayerState, amount: number) {
  require_(amount <= p.cash, 'Not enough cash')
  p.cash = Math.round((p.cash - amount) * 100) / 100
}

function log(state: GameState, key: PlayerKey, text: string) {
  state.log.push({ week: state.week, actor: key, text, location: state[key].location })
}

export function hasItem(p: PlayerState, id: ItemId): boolean {
  return p.items.includes(id)
}

export function groceryCap(p: PlayerState): number {
  return hasItem(p, 'fridge') ? GROCERY_CAP_FRIDGE : GROCERY_CAP_BASE
}

export function travel(state: GameState, key: PlayerKey, to: LocationId) {
  const p = state[key]
  require_(to !== p.location, 'Already there')
  const cost = travelCost(p.location, to, hasItem(p, 'bike'))
  spendTime(p, cost)
  p.location = to
  log(state, key, `Walked to ${LOCATIONS[to].name}`)
}

export function work(state: GameState, key: PlayerKey, hours: number) {
  const p = state[key]
  require_(p.jobId !== null, 'No job')
  const job = jobById(p.jobId)
  require_(p.location === job.workplace, `You must be at your workplace to work`)
  require_(hours >= 1, 'Work at least one hour')
  spendTime(p, hours)
  const pay = Math.round(hours * wagePerHour(state, job.id))
  p.cash += pay
  p.experience += hours
  log(state, key, `Worked ${hours}h as ${job.title} for $${pay}`)
}

export function qualifiesFor(p: PlayerState, jobId: string): { ok: boolean; reasons: string[] } {
  const job = jobById(jobId)
  const reasons: string[] = []
  if (p.education < job.minEducation) reasons.push(`needs ${job.minEducation} classes`)
  if (p.dress < job.minDress) reasons.push(`needs dress ${job.minDress}`)
  if (p.experience < job.minExperience) reasons.push(`needs ${job.minExperience}h experience`)
  return { ok: reasons.length === 0, reasons }
}

export function applyJob(state: GameState, key: PlayerKey, jobId: string) {
  const p = state[key]
  require_(
    p.location === 'employment' || hasItem(p, 'phone'),
    'Apply at the Job Center (or get a smartphone)'
  )
  const job = jobById(jobId)
  const qual = qualifiesFor(p, jobId)
  require_(qual.ok, `Not qualified: ${qual.reasons.join(', ')}`)
  spendTime(p, 2)
  p.jobId = job.id
  log(state, key, `Hired as ${job.title} at $${wagePerHour(state, job.id).toFixed(2)}/h`)
}

export function quitJob(state: GameState, key: PlayerKey) {
  const p = state[key]
  require_(p.jobId !== null, 'No job to quit')
  log(state, key, `Quit job as ${jobById(p.jobId).title}`)
  p.jobId = null
}

export function takeClass(state: GameState, key: PlayerKey) {
  const p = state[key]
  require_(p.location === 'university', 'Classes are at City University')
  spendTime(p, CLASS_TIME)
  spendCash(p, price(state, TUITION))
  p.education += 1
  log(state, key, `Completed a class (${p.education} total)`)
}

export function buyMeal(state: GameState, key: PlayerKey) {
  const p = state[key]
  require_(p.location === 'burgers', 'Meals are at Burger Barn')
  spendTime(p, MEAL_TIME)
  spendCash(p, price(state, MEAL_PRICE))
  p.fed += 1
  p.happiness = Math.min(100, p.happiness + 1)
  log(state, key, 'Grabbed a hot meal')
}

export function buyGroceries(state: GameState, key: PlayerKey, units: number) {
  const p = state[key]
  require_(
    p.location === 'megamart' || p.location === 'market',
    'Groceries are at MegaMart or Fresh Market'
  )
  require_(units >= 1, 'Buy at least one unit')
  const cap = groceryCap(p)
  require_(
    p.groceries + units <= cap,
    `Storage full (${cap} units max${hasItem(p, 'fridge') ? '' : ' — a fridge holds more'})`
  )
  const unitPrice = p.location === 'megamart' ? GROCERY_PRICE_MEGAMART : GROCERY_PRICE_MARKET
  spendTime(p, 1)
  spendCash(p, price(state, unitPrice) * units)
  p.groceries += units
  log(state, key, `Bought ${units} unit${units === 1 ? '' : 's'} of groceries`)
}

export function buyLottery(state: GameState, key: PlayerKey, tickets: number) {
  const p = state[key]
  require_(p.location === 'megamart', 'Lottery tickets are at MegaMart')
  require_(tickets >= 1, 'Buy at least one ticket')
  spendTime(p, 1)
  spendCash(p, LOTTERY_TICKET_PRICE * tickets)
  p.lotteryTickets += tickets
  state.economy.lotteryJackpot += LOTTERY_TICKET_PRICE * tickets * 4
  log(state, key, `Bought ${tickets} lottery ticket${tickets === 1 ? '' : 's'}`)
}

export function buyItem(state: GameState, key: PlayerKey, itemId: ItemId) {
  const p = state[key]
  const item = itemById(itemId)
  require_(p.location === item.soldAt, `Sold at another store`)
  spendTime(p, 1)
  spendCash(p, price(state, item.price))
  if (item.dress !== undefined) {
    // Outfits replace what you're wearing rather than stacking.
    p.dress = Math.max(p.dress, item.dress)
    p.items = p.items.filter((i) => !itemById(i).dress)
    p.items.push(itemId)
  } else {
    require_(!hasItem(p, itemId), 'Already owned')
    p.items.push(itemId)
  }
  log(state, key, `Bought ${item.name}`)
}

export function sellItem(state: GameState, key: PlayerKey, itemId: ItemId) {
  const p = state[key]
  require_(p.location === 'pawn', 'Sell at the Pawn Shop')
  require_(hasItem(p, itemId), 'Not owned')
  const item = itemById(itemId)
  spendTime(p, 1)
  p.items = p.items.filter((i) => i !== itemId)
  const proceeds = Math.round(price(state, item.price) * PAWN_RATE)
  p.cash += proceeds
  if (item.dress !== undefined) p.dress = Math.min(p.dress, 10)
  log(state, key, `Pawned ${item.name} for $${proceeds}`)
}

export function deposit(state: GameState, key: PlayerKey, amount: number) {
  const p = state[key]
  require_(p.location === 'bank', 'Banking is at First Bank')
  require_(amount > 0, 'Nothing to deposit')
  spendTime(p, 1)
  spendCash(p, amount)
  p.savings += amount
  log(state, key, `Deposited $${amount}`)
}

export function withdraw(state: GameState, key: PlayerKey, amount: number) {
  const p = state[key]
  require_(p.location === 'bank', 'Banking is at First Bank')
  require_(amount > 0 && amount <= p.savings, 'Invalid amount')
  spendTime(p, 1)
  p.savings -= amount
  p.cash += amount
  log(state, key, `Withdrew $${amount}`)
}

export function payRent(state: GameState, key: PlayerKey) {
  const p = state[key]
  require_(
    p.location === 'rentoffice' || hasItem(p, 'phone'),
    'Pay at the Rent Office (or via smartphone)'
  )
  require_(p.rentDue > 0, 'No rent due')
  const amount = Math.min(p.rentDue, p.cash)
  require_(amount > 0, 'Not enough cash')
  spendTime(p, 1)
  spendCash(p, amount)
  p.rentDue -= amount
  if (p.rentDue === 0) p.weeksBehindOnRent = 0
  log(state, key, `Paid $${amount} rent`)
}

export function rentApartment(
  state: GameState,
  key: PlayerKey,
  tier: Exclude<ApartmentTier, 'none'>
) {
  const p = state[key]
  require_(p.location === 'rentoffice', 'Rent at the Rent Office')
  require_(p.apartment !== tier, 'Already renting that apartment')
  // First week's rent due up front.
  const firstWeek = price(state, RENT[tier])
  spendTime(p, 2)
  spendCash(p, firstWeek)
  p.apartment = tier
  p.rentDue = 0
  p.weeksBehindOnRent = 0
  log(state, key, `Moved into a ${tier === 'basic' ? 'basic' : 'secure'} apartment`)
}

export function relax(state: GameState, key: PlayerKey, hours: number) {
  const p = state[key]
  require_(p.location === 'home', 'Relax at home')
  require_(p.apartment !== 'none', 'You need an apartment to relax at home')
  require_(hours >= 1, 'Relax at least one hour')
  const available = RELAX_CAP - p.relaxedThisWeek
  require_(available > 0, 'Too much lounging for one week')
  const used = Math.min(hours, available)
  spendTime(p, used)
  p.relaxedThisWeek += used
  p.happiness = Math.min(100, p.happiness + used)
  log(state, key, `Relaxed ${used}h`)
}

export function netWorth(p: PlayerState): number {
  return Math.round(p.cash + p.savings)
}

export function foodOnHand(p: PlayerState): number {
  return p.fed + p.groceries
}

export function foodShortfall(p: PlayerState): number {
  return Math.max(0, FOOD_NEEDED - foodOnHand(p))
}
