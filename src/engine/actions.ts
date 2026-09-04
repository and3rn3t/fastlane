// Per-player action implementations. Each mutates a draft GameState in place
// and throws EngineError on invalid moves; the reducer and the AI both call
// these so human and rival play by identical rules.

import {
  APPLY_JOB_TIME,
  CASINO_MAX_BET,
  CASINO_MIN_BET,
  CASINO_PAYOUT_MULTIPLIER,
  CASINO_TIME,
  CASINO_WIN_CHANCE,
  DOCTOR_HEAL,
  DOCTOR_PRICE,
  DOCTOR_TIME,
  FOOD_NEEDED,
  GARNISHMENT_RATE,
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
  PROMOTION_WAGE_BONUS,
  RELAX_CAP,
  RENT,
  SKILL_GAIN_PER_HOUR,
  SKILL_TRAIN_GAIN,
  SKILL_TRAIN_PRICE,
  SKILL_TRAIN_TIME,
  SKILLS,
  TUITION,
  itemById,
  jobById,
  maxLoan,
  travelCost,
} from './data'
import { roll } from './rng'
import type {
  ApartmentTier,
  GameState,
  ItemId,
  JobRequirement,
  LocationId,
  PlayerKey,
  PlayerState,
  SkillId,
} from './types'

export class EngineError extends Error {}

function require_(cond: boolean, message: string): asserts cond {
  if (!cond) throw new EngineError(message)
}

export function price(state: GameState, base: number): number {
  return Math.round(base * state.economy.priceIndex)
}

export function wagePerHour(state: GameState, jobId: string, promotionLevel = 0): number {
  const base = jobById(jobId).wage * state.economy.wageIndex
  return base * (1 + promotionLevel * PROMOTION_WAGE_BONUS)
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

// Every action function below mutates a PlayerState by property assignment
// (`p.cash = ...`) or whole-field reassignment (`p.items =
// p.items.filter(...)`) — never in-place mutation of a nested array/object.
// So a one-level-deep shallow copy per array/record field is exactly as safe
// as a full deep clone here and far cheaper: PlayerState is a flat record of
// primitives plus `items` (array). If a future field holds a nested
// array/object of its own, it needs the same `.slice()`/spread treatment
// here, or this stops being safe. Used by engine.ts's applyAction (the real
// per-dispatch clone) and by ai.ts (scratch copies for scoring candidates).
export function clonePlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    items: p.items.slice(),
    skills: { ...p.skills },
    activeEvents: p.activeEvents.slice(),
  }
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
  const pay = Math.round(hours * wagePerHour(state, job.id, p.promotionLevel))
  p.experience += hours
  p.hoursWorkedThisWeek += hours
  if (job.trainsSkill) {
    const skillId = job.trainsSkill
    p.skills[skillId] = Math.min(100, p.skills[skillId] + hours * SKILL_GAIN_PER_HOUR)
  }
  if (p.garnished && p.loanBalance > 0) {
    const seized = Math.min(Math.round(pay * GARNISHMENT_RATE), p.loanBalance)
    p.cash += pay - seized
    p.loanBalance -= seized
    p.loanPaidThisWeek = true
    if (p.loanBalance <= 0) p.garnished = false
    log(
      state,
      key,
      `Worked ${hours}h as ${job.title} for $${pay} ($${seized} garnished toward the loan)`
    )
  } else {
    p.cash += pay
    log(state, key, `Worked ${hours}h as ${job.title} for $${pay}`)
  }
}

// Reason text a UI displayed before jobRequirements() existed — preserved
// verbatim (word-for-word) so qualifiesFor()'s `reasons` stays byte-identical
// for existing callers/tests even though it's now derived, not hand-written.
function reasonText(r: JobRequirement): string {
  switch (r.key) {
    case 'education':
      return `needs ${r.required} classes`
    case 'dress':
      return `needs dress ${r.required}`
    case 'experience':
      return `needs ${r.required}h experience`
    case 'computer':
      return 'needs a computer'
    default:
      // `skill:${SkillId}` — SKILLS' own ids are lowercase, matching the
      // original hand-written `needs ${needed} ${skillId} skill` text.
      return `needs ${r.required} ${r.key.slice('skill:'.length)} skill`
  }
}

/** Per-criterion detail behind `qualifiesFor()` — one row per requirement a
 * job actually gates on, `{ current, required, met }` instead of just a
 * pass/fail reason string, so a UI can render real progress ("Dress 18/25").
 * The single source of truth: `qualifiesFor()` below derives `ok`/`reasons`
 * from this, rather than duplicating the same threshold checks twice. */
export function jobRequirements(p: PlayerState, jobId: string): JobRequirement[] {
  const job = jobById(jobId)
  const reqs: JobRequirement[] = []
  // A layoff chain waives dress/experience (but not education, computer, or
  // skills) for its duration — a "sympathy hire" recognizing that a good
  // reference and a clean resume matter more right after a layoff than
  // whether your suit is sharp or you've clocked enough hours somewhere new.
  const sympathyHire = p.activeEvents.some((e) => e.chainId === 'layoff')

  if (job.minEducation > 0) {
    reqs.push({
      key: 'education',
      label: 'Classes',
      current: p.education,
      required: job.minEducation,
      met: p.education >= job.minEducation,
    })
  }
  if (job.minDress > 0) {
    const rawMet = p.dress >= job.minDress
    reqs.push({
      key: 'dress',
      label: 'Dress',
      current: p.dress,
      required: job.minDress,
      met: rawMet || sympathyHire,
      waived: !rawMet && sympathyHire ? true : undefined,
    })
  }
  if (job.minExperience > 0) {
    const rawMet = p.experience >= job.minExperience
    reqs.push({
      key: 'experience',
      label: 'Experience',
      current: p.experience,
      required: job.minExperience,
      met: rawMet || sympathyHire,
      waived: !rawMet && sympathyHire ? true : undefined,
    })
  }
  if (job.requiresComputer) {
    const owned = hasItem(p, 'computer')
    reqs.push({
      key: 'computer',
      label: 'Computer',
      current: owned ? 1 : 0,
      required: 1,
      met: owned,
    })
  }
  if (job.minSkills) {
    for (const [skillId, needed] of Object.entries(job.minSkills) as Array<[SkillId, number]>) {
      reqs.push({
        key: `skill:${skillId}`,
        label: `${SKILLS.find((s) => s.id === skillId)?.name ?? skillId} skill`,
        current: p.skills[skillId],
        required: needed,
        met: p.skills[skillId] >= needed,
      })
    }
  }
  return reqs
}

export function qualifiesFor(p: PlayerState, jobId: string): { ok: boolean; reasons: string[] } {
  const reasons = jobRequirements(p, jobId)
    .filter((r) => !r.met)
    .map(reasonText)
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
  spendTime(p, APPLY_JOB_TIME)
  p.jobId = job.id
  p.jobTenureWeeks = 0
  p.promotionLevel = 0
  log(state, key, `Hired as ${job.title} at $${wagePerHour(state, job.id).toFixed(2)}/h`)
}

export function quitJob(state: GameState, key: PlayerKey) {
  const p = state[key]
  require_(p.jobId !== null, 'No job to quit')
  log(state, key, `Quit job as ${jobById(p.jobId).title}`)
  p.jobId = null
  p.jobTenureWeeks = 0
  p.promotionLevel = 0
}

export function takeClass(state: GameState, key: PlayerKey) {
  const p = state[key]
  require_(p.location === 'university', 'Classes are at City University')
  spendTime(p, CLASS_TIME)
  spendCash(p, price(state, TUITION))
  p.education += 1
  log(state, key, `Completed a class (${p.education} total)`)
}

/** A direct, cash-for-time way to build a specific skill, at the same
 * location as takeClass — for someone who wants to clear a job's minSkills
 * bar without grinding hours at the right employer first. */
export function trainSkill(state: GameState, key: PlayerKey, skillId: SkillId) {
  const p = state[key]
  require_(p.location === 'university', 'Skill training is at City University')
  require_(p.skills[skillId] < 100, 'Already maxed out')
  spendTime(p, SKILL_TRAIN_TIME)
  spendCash(p, price(state, SKILL_TRAIN_PRICE))
  p.skills[skillId] = Math.min(100, p.skills[skillId] + SKILL_TRAIN_GAIN)
  log(state, key, `Trained ${skillId} (${Math.floor(p.skills[skillId])} now)`)
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

export function playCasino(state: GameState, key: PlayerKey, bet: number) {
  const p = state[key]
  require_(p.location === 'casino', 'The wheel is at the casino')
  require_(bet >= CASINO_MIN_BET, `Bet at least $${CASINO_MIN_BET}`)
  require_(bet <= CASINO_MAX_BET, `Bets are capped at $${CASINO_MAX_BET}`)
  spendTime(p, CASINO_TIME)
  spendCash(p, bet)
  const won = roll(state) < CASINO_WIN_CHANCE
  if (won) {
    const payout = Math.round(bet * CASINO_PAYOUT_MULTIPLIER)
    p.cash += payout
    log(state, key, `${p.name} won $${payout} at the wheel!`)
  } else {
    log(state, key, `${p.name} lost $${bet} at the wheel`)
  }
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

/** Buys units at the current mark-to-market price — a real risk/reward
 * alternative to deposit()'s flat, guaranteed interest. Units, not dollars,
 * are tracked so a later price move is reflected automatically (see
 * netWorth()) without the player having to do anything. */
export function invest(state: GameState, key: PlayerKey, amount: number) {
  const p = state[key]
  require_(p.location === 'bank', 'Investing is at First Bank')
  require_(amount > 0, 'Nothing to invest')
  spendTime(p, 1)
  spendCash(p, amount)
  p.investments += amount / state.economy.marketIndex
  log(state, key, `Invested $${amount}`)
}

export function divest(state: GameState, key: PlayerKey, units: number) {
  const p = state[key]
  require_(p.location === 'bank', 'Investing is at First Bank')
  require_(units > 0 && units <= p.investments, 'Invalid amount')
  spendTime(p, 1)
  const proceeds = Math.round(units * state.economy.marketIndex)
  p.investments -= units
  p.cash += proceeds
  log(state, key, `Sold investments for $${proceeds}`)
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

export function takeLoan(state: GameState, key: PlayerKey, amount: number) {
  const p = state[key]
  require_(p.location === 'bank', 'Loans are at First Bank')
  require_(amount > 0, 'Nothing to borrow')
  const limit = maxLoan(p.creditScore)
  require_(p.loanBalance + amount <= limit, `Exceeds your loan limit ($${limit})`)
  spendTime(p, 1)
  p.cash += amount
  p.loanBalance += amount
  log(state, key, `Took out a $${amount} loan`)
}

export function repayLoan(state: GameState, key: PlayerKey, amount: number) {
  const p = state[key]
  require_(p.location === 'bank', 'Loans are at First Bank')
  require_(amount > 0 && amount <= p.loanBalance, 'Invalid amount')
  spendTime(p, 1)
  spendCash(p, amount)
  p.loanBalance -= amount
  p.loanPaidThisWeek = true
  if (p.loanBalance <= 0) p.garnished = false
  log(state, key, `Paid $${amount} toward the loan`)
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

export function seeDoctor(state: GameState, key: PlayerKey) {
  const p = state[key]
  require_(p.location === 'clinic', 'The doctor is at the Clinic')
  require_(p.health < 100, 'Already at full health')
  spendTime(p, DOCTOR_TIME)
  spendCash(p, price(state, DOCTOR_PRICE))
  p.health = Math.min(100, p.health + DOCTOR_HEAL)
  log(state, key, `Saw the doctor (+${DOCTOR_HEAL} health)`)
}

/** marketIndex is required, not defaulted — every real caller has a
 * GameState in hand (state.economy.marketIndex), and a silent default of 1
 * would make it easy to accidentally price investments wrong wherever the
 * economy's actual index has drifted from 1. */
export function netWorth(p: PlayerState, marketIndex: number): number {
  return Math.round(p.cash + p.savings - p.loanBalance + p.investments * marketIndex)
}

export function foodOnHand(p: PlayerState): number {
  return p.fed + p.groceries
}

export function foodShortfall(p: PlayerState): number {
  return Math.max(0, FOOD_NEEDED - foodOnHand(p))
}
