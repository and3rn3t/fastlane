import { rollInt, type RngState } from './rng'
import type {
  InsuranceTier,
  ItemDef,
  JobDef,
  LocationDef,
  LocationId,
  OriginDef,
  PlayerState,
  RulesConfig,
  SkillId,
  TraitDef,
  TraitId,
} from './types'

export const WEEK_TIME = 60
export const FOOD_NEEDED = 6
export const MEAL_TIME = 2
export const CLASS_TIME = 8
export const RELAX_CAP = 10
export const EVICTION_WEEKS = 3
export const APPLY_JOB_TIME = 2

export const MEAL_PRICE = 9
export const GROCERY_PRICE_MEGAMART = 4
export const GROCERY_PRICE_MARKET = 5
export const TUITION = 75
export const LOTTERY_TICKET_PRICE = 5
export const LOTTERY_WIN_CHANCE = 0.02
export const PAWN_RATE = 0.5

export const GROCERY_CAP_BASE = 6
export const GROCERY_CAP_FRIDGE = 24

export const RENT: Record<'basic' | 'secure', number> = {
  basic: 110,
  secure: 220,
}

export const DRESS_WEAR_PER_WEEK = 3

export const HEALTH_START = 100
/** Hours worked in a week beyond this build burnout, at BURNOUT_GAIN_RATE
 * per excess hour (see burnoutUpkeep in week.ts) — health itself no longer
 * drains from overwork directly, only from a cheap-groceries diet. */
export const OVERWORK_THRESHOLD = 40
/** Health cost of a week fed mostly from cheap groceries instead of hot meals. */
export const HEALTH_CHEAP_FOOD_DRAIN = 2
/** Below this, low health starts dragging happiness down too. */
export const HEALTH_LOW_THRESHOLD = 40
export const HEALTH_LOW_HAPPINESS_PENALTY = 3
/** Below this, a sickness event (personalEvent) can actually cost time. */
export const HEALTH_SICK_THRESHOLD = 50
export const DOCTOR_PRICE = 45
export const DOCTOR_TIME = 3

/** Burnout gained per hour worked beyond OVERWORK_THRESHOLD in a week. */
export const BURNOUT_GAIN_RATE = 0.5
/** Burnout relieved per hour of relax() — rides the same relaxedThisWeek
 * cap as happiness rather than a separate one, so "how much rest fits in a
 * week" stays one budget, not two. */
export const BURNOUT_RELIEF_PER_HOUR = 3
/** Above this, burnout starts dragging happiness down too — same shape as
 * HEALTH_LOW_THRESHOLD/HEALTH_LOW_HAPPINESS_PENALTY. */
export const BURNOUT_HIGH_THRESHOLD = 70
export const BURNOUT_HIGH_HAPPINESS_PENALTY = 3
/** At burnout 100, work()'s pay is cut by this fraction — burnout's real
 * differentiator from health/happiness: it gates work's own output instead
 * of just being another number that drains something else.
 *
 * Tuned up from an initial 0.3 after `pnpm sim` found a real, if smaller,
 * side effect of this row (not a bug the way Fitness habit's uncapped sink
 * was): removing overwork's old health-driven Clinic-time-tax freed real
 * work capacity for both sides, which compounds with Riley's random,
 * usually non-neutral origin trait more than it does with the player's
 * fixed neutral one — a pay-efficiency cut doesn't claim hours back the way
 * the old time-cost did, so it takes a stronger cut to land a comparable
 * bite. 0.5 brought the 12-cell profile×rules matrix back clean; the
 * 5-origin matrix needed the same escalation to `pnpm sim 300 origins`
 * Wave 14's own rebalance used, settling to one cell (trust-fund-kid) right
 * at the guard — see the archive entry for the full numbers. */
export const BURNOUT_EFFICIENCY_PENALTY_MAX = 0.5

/** Fitness gained per hour spent on the workOut action (Home) — 100 hours
 * for a maxed-out stat, a genuinely multi-week commitment against the
 * 60h/week budget, same "real cost, real payoff" shape as skill training. */
export const FITNESS_GAIN_PER_HOUR = 1
/** Weekly cap on workOut hours, same shape as RELAX_CAP — without this, a
 * single idle week could dump dozens of spare hours into fitness at once
 * (confirmed via pnpm sim: a first pass with no cap let Riley's fallback
 * "last resort work" candidate get displaced by fitness for the rest of the
 * game once other goals were met, tanking her income and swinging win rate
 * ~20 points). Capping it forces the investment to actually spread across
 * many weeks, as intended. */
export const FITNESS_WORKOUT_CAP_PER_WEEK = 8
/** At fitness 100, healthUpkeep()'s cheap-food decay is halved — never
 * reversed, never eliminated, so upkeep still matters at any fitness
 * level. */
export const FITNESS_DECAY_REDUCTION_MAX = 0.5
export const DOCTOR_HEAL = 35

/** Below this, fitness doesn't count as active self-care for the neglect
 * check (see isNeglecting() in week.ts) — low, deliberately: a couple of
 * workOut sessions is enough protection, this isn't asking for a maxed
 * stat, just *some* investment. */
export const CHRONIC_FITNESS_SAFE_THRESHOLD = 20
/** Consecutive weeks of neglect (unwell + no fitness safety net) before a
 * `'chronic'` activeEvents chain starts — "sustained," not a blip, same
 * order of magnitude as LONG_STALL_WEEKS in scripts/sim.ts. */
export const CHRONIC_ONSET_WEEKS = 8
/** Consecutive weeks NOT neglecting (a relapse week resets this to 0)
 * needed to clear an active chronic condition — sustained care to match
 * the sustained neglect that caused it, not a fixed cooldown timer the way
 * layoff/inheritance resolve. */
export const CHRONIC_RECOVERY_WEEKS = 8
/** Weekly cost while a chronic condition is active — capped at cash, same
 * pattern as every other recurring cost (insurance premiums, rent). Modest
 * on purpose: a real, ongoing burden, not a run-ending one — "consequence,
 * not punishment." */
export const CHRONIC_WEEKLY_COST = 20
export const CHRONIC_WEEKLY_TIME_COST = 4

/** Chance per week (no secure apartment, uninsured, owns something stealable). */
export const ITEM_THEFT_CHANCE = 0.08

export const CREDIT_SCORE_START = 50
export const CREDIT_GAIN_ON_PAYMENT = 3
export const CREDIT_LOSS_ON_MISS = 8
export const LOAN_INTEREST_RATE = 0.02
/** Consecutive unpaid weeks before wage garnishment kicks in. */
export const LOAN_MISSED_WEEKS_FOR_GARNISHMENT = 3
/** Fraction of each paycheck redirected to the loan while garnished. */
export const GARNISHMENT_RATE = 0.3

/** Credit score → max total loan balance (principal + accrued interest). */
export function maxLoan(creditScore: number): number {
  return 300 + creditScore * 20
}

/** Skill points gained per hour worked at a job with a `trainsSkill` — 40h/
 * week at the right job takes about 8-9 weeks to hit 50, roughly the same
 * pace as education/experience already progress at. */
export const SKILL_GAIN_PER_HOUR = 0.15
/** trainSkill action, at City University — a direct, cash-for-time way to
 * build a specific skill instead of grinding hours at the right job. */
export const SKILL_TRAIN_PRICE = 60
export const SKILL_TRAIN_TIME = 6
export const SKILL_TRAIN_GAIN = 8

/** Wider than priceIndex/wageIndex's 0.7–1.6 clamp — investing is meant to
 * carry real risk/reward, not just background economic noise. */
export const MARKET_INDEX_MIN = 0.5
export const MARKET_INDEX_MAX = 2

/** Event chain tuning (week.ts's personalEvent/resolveActiveEvents). */
export const LAYOFF_SYMPATHY_WEEKS = 3
export const INHERITANCE_DELAY_WEEKS = 2
export const INHERITANCE_MIN = 200
export const INHERITANCE_RANGE = 400

/** Total number of one-shot outcomes personalEvent() (week.ts) can roll —
 * kept as a named constant since resolveActiveEvents's chain triggers
 * (layoff, inheritance) live inside that same switch and must stay counted
 * too. Every roll range below follows the same MIN + rollInt(RANGE) shape
 * as INHERITANCE_MIN/INHERITANCE_RANGE above. */
export const PERSONAL_EVENT_OUTCOMES = 15

export const LOST_WALLET_MIN = 15
export const LOST_WALLET_RANGE = 45
export const LOST_WALLET_HAPPINESS_PENALTY = 2

export const VIRAL_WINDFALL_MIN = 30
export const VIRAL_WINDFALL_RANGE = 70
export const VIRAL_WINDFALL_HAPPINESS_BONUS = 2

export const JURY_DUTY_MIN_HOURS = 6
export const JURY_DUTY_HOURS_RANGE = 10

export const CAR_TROUBLE_MIN = 40
export const CAR_TROUBLE_RANGE = 80

export const SURPRISE_REFUND_MIN = 25
export const SURPRISE_REFUND_RANGE = 55

export const HOME_REPAIR_MIN = 40
export const HOME_REPAIR_RANGE = 90

/** Genuinely wild swings, per the roadmap's own phrasing — well past the
 * ordinary found-cash/doctor-bill ranges above. */
export const LUCKY_FIND_MIN = 100
export const LUCKY_FIND_RANGE = 300
export const LUCKY_FIND_HAPPINESS_BONUS = 5

export const COSTLY_MISTAKE_MIN = 100
export const COSTLY_MISTAKE_RANGE = 250
export const COSTLY_MISTAKE_HAPPINESS_PENALTY = 6

export const CASINO_MIN_BET = 10
export const CASINO_MAX_BET = 500
export const CASINO_TIME = 1
/** Tuned for a ~10% house edge (winChance × payout < 1) — a trap, on purpose. */
export const CASINO_WIN_CHANCE = 0.45
export const CASINO_PAYOUT_MULTIPLIER = 2

/** Consecutive weeks of showing up (working ≥1h) at the same job before it
 * earns the next promotion level. */
export const PROMOTION_TENURE_WEEKS = 6
export const MAX_PROMOTIONS = 3
/** Wage multiplier and prestige points added per promotion level. */
export const PROMOTION_WAGE_BONUS = 0.15
export const PROMOTION_PRESTIGE_BONUS = 4

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

const SEASON_CYCLE: Season[] = ['spring', 'summer', 'fall', 'winter']
export const SEASON_LENGTH_WEEKS = 3

/** Derives a season from the week counter — a fixed 12-week cycle (4
 * seasons × 3 weeks), week 1 = the start of spring. Pure, no state read. */
export function seasonForWeek(week: number): Season {
  const index = Math.floor((week - 1) / SEASON_LENGTH_WEEKS) % SEASON_CYCLE.length
  return SEASON_CYCLE[index]
}

/** Grocery/rent cost swing per season, applied on top of (not folded into)
 * the global priceIndex — a HEADLINES price swing and a season stack
 * independently. Winter heating and summer cooling bite hardest. */
export const SEASON_MULTIPLIERS: Record<Season, { grocery: number; rent: number }> = {
  spring: { grocery: 0.97, rent: 1.0 },
  summer: { grocery: 1.02, rent: 1.03 },
  fall: { grocery: 1.0, rent: 1.0 },
  winter: { grocery: 1.06, rent: 1.1 },
}

/** Shown once, on the first week of each season, in place of that week's
 * usual random HEADLINES roll — see driftEconomy in week.ts. */
export const SEASON_HEADLINES: Record<Season, string> = {
  spring: '🌱 Spring arrives — grocery prices ease up.',
  summer: '☀️ Summer heat rolls in — cooling costs nudge rent and groceries up.',
  fall: '🍂 Fall settles in — prices level off.',
  winter: '❄️ Winter sets in — heating drives rent up, groceries cost more too.',
}

/** A week's position within its 12-week season cycle (1-12), recurring every
 * cycle for the rest of the game — same wraparound as seasonForWeek. */
export function weekInCycle(week: number): number {
  return ((week - 1) % (SEASON_LENGTH_WEEKS * SEASON_CYCLE.length)) + 1
}

export interface HolidayBeat {
  id: 'spring-cleaning' | 'tax-week' | 'holiday-bonus'
  text: string
  /** Applied to both players' cash symmetrically, capped so it can never
   * take a player negative — see driftEconomy in week.ts. */
  cashDelta: number
}

/** Fixed-week flavor beats layered onto the season cycle, keyed by
 * weekInCycle — positioned away from 1/4/7/10 (each season's first week,
 * where SEASON_HEADLINES already claims that week's single-line headline)
 * so the two systems never compete for the same week. */
export const HOLIDAY_BEATS: Record<number, HolidayBeat> = {
  2: {
    id: 'spring-cleaning',
    text: '🧹 Spring cleaning week — everyone declutters and pockets a little extra.',
    cashDelta: 15,
  },
  3: {
    id: 'tax-week',
    text: '🧾 Tax week — everyone owes the city a cut.',
    cashDelta: -60,
  },
  11: {
    id: 'holiday-bonus',
    text: '🎁 Holiday bonus season — a little extra shows up in every paycheck.',
    cashDelta: 80,
  },
}

// Percentage/point deltas, not multipliers directly — driftEconomy() (week.ts)
// scales each by rules.economyVolatility before applying it, so Brutal/Zen
// presets don't need their own copy of this table.
export interface Headline {
  text: string
  priceDelta?: number
  wageDelta?: number
  interestDelta?: number
  marketDelta?: number
  /** Relative pick weight — defaults to HEADLINE_DEFAULT_WEIGHT. The wilder
   * boom/bust entries below use a small fraction of that so they hit far
   * less often than an everyday swing, not equally often. */
  weight?: number
}

export const HEADLINE_DEFAULT_WEIGHT = 1

export const HEADLINES: Headline[] = [
  { text: 'Steady week in the city.' },
  { text: 'Inflation ticks up — prices rise.', priceDelta: 0.05 },
  { text: 'Retail price war! Prices dip.', priceDelta: -0.05 },
  { text: 'Labor shortage — wages climb.', wageDelta: 0.05 },
  { text: 'Layoffs downtown — wages soften.', wageDelta: -0.04 },
  { text: 'Fed hikes rates — savers rejoice.', interestDelta: 0.002 },
  { text: 'Rates cut — savings earn less.', interestDelta: -0.002 },
  { text: 'Stocks rally on strong earnings.', marketDelta: 0.06 },
  { text: 'Market selloff spooks investors.', marketDelta: -0.06 },
  // Rarer, bigger-swing "real boom/bust year" entries — same mechanism,
  // more variety at the tail, per Wave 7's "Wilder global headlines."
  {
    text: '💥 Boom year — wages surge and the market takes off.',
    wageDelta: 0.12,
    marketDelta: 0.15,
    weight: 0.15,
  },
  {
    text: '📉 Recession hits — wages stall and stocks slide.',
    wageDelta: -0.1,
    marketDelta: -0.18,
    weight: 0.15,
  },
  { text: '🔥 Inflation spike — prices jump hard.', priceDelta: 0.12, weight: 0.12 },
  { text: '🧊 Deflation scare — prices tumble.', priceDelta: -0.1, weight: 0.12 },
  { text: '💣 Market crash — investors flee stocks overnight.', marketDelta: -0.3, weight: 0.08 },
  { text: '🐂 Bull run — stocks go vertical.', marketDelta: 0.3, weight: 0.08 },
]

export const LOCATIONS: Record<LocationId, LocationDef> = {
  home: {
    id: 'home',
    name: 'Home',
    blurb: 'Your apartment — relax, and keep your fridge stocked.',
    loopIndex: 0,
  },
  employment: {
    id: 'employment',
    name: 'Job Center',
    blurb: 'Browse openings across town and apply.',
    loopIndex: 1,
  },
  burgers: {
    id: 'burgers',
    name: 'Burger Barn',
    blurb: 'Fast food — a quick meal, or a first job.',
    loopIndex: 2,
  },
  megamart: {
    id: 'megamart',
    name: 'MegaMart',
    blurb: 'Cheap groceries, lottery tickets, and retail work.',
    loopIndex: 3,
  },
  university: {
    id: 'university',
    name: 'City University',
    blurb: 'Take classes to unlock better careers.',
    loopIndex: 4,
  },
  factory: {
    id: 'factory',
    name: 'Assembly Works',
    blurb: 'The factory — honest pay, real ladders to climb.',
    loopIndex: 5,
  },
  bank: {
    id: 'bank',
    name: 'First Bank',
    blurb: 'Savings earn weekly interest. White-collar jobs too.',
    loopIndex: 6,
  },
  clothing: {
    id: 'clothing',
    name: 'Sharp Threads',
    blurb: 'Outfits for every rung of the ladder.',
    loopIndex: 7,
  },
  gadgets: {
    id: 'gadgets',
    name: 'Gadget City',
    blurb: 'Appliances and toys that make life better.',
    loopIndex: 8,
  },
  market: {
    id: 'market',
    name: 'Fresh Market',
    blurb: 'Better groceries, slightly higher prices.',
    loopIndex: 9,
  },
  pawn: {
    id: 'pawn',
    name: 'Pawn Shop',
    blurb: 'Quick cash for your stuff — at half price.',
    loopIndex: 10,
  },
  rentoffice: {
    id: 'rentoffice',
    name: 'Rent Office',
    blurb: 'Rent an apartment and settle what you owe.',
    loopIndex: 11,
  },
  clinic: {
    id: 'clinic',
    name: 'Clinic',
    blurb: 'See a doctor — overwork and cheap food catch up with everyone.',
    loopIndex: 12,
  },
  casino: {
    id: 'casino',
    name: 'Lucky Star Casino',
    blurb: 'The wheel always favors the house — you knew that going in.',
    loopIndex: 13,
  },
}

export const LOOP_SIZE = 14

/** The original, unshuffled layout — every `LocationDef`'s own `loopIndex`,
 * copied into the `GameState.layout` shape. Used as `travelCost()`'s default
 * (so direct-call tests keep working unchanged) and as the layout any save
 * from before Wave 15's shuffled city ships with, via GameContext.tsx's
 * migration — an existing save's travel map must not change under it. */
export const DEFAULT_LAYOUT: Record<LocationId, number> = Object.fromEntries(
  Object.values(LOCATIONS).map((l) => [l.id, l.loopIndex])
) as Record<LocationId, number>

/** Fisher-Yates shuffle of the location→loopIndex assignment, consuming
 * `LOOP_SIZE - 1` RNG draws. Called once at `newGame()` construction time,
 * same shape as `newGame()`'s Riley-origin draw — see `initialRngSeed()` in
 * engine.ts, which must replay this exact draw to stay in sync. */
export function shuffledLayout(rngState: RngState): Record<LocationId, number> {
  const order = (Object.keys(LOCATIONS) as LocationId[]).slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = rollInt(rngState, i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return Object.fromEntries(order.map((id, index) => [id, index])) as Record<LocationId, number>
}

// Which skill each employer trains (JobDef.trainsSkill), and the skill floor
// its top rung additionally demands (JobDef.minSkills) — retail/food service
// builds sales, the factory builds trades, bank/university build tech. This
// is what makes the ladder branch by specialization: grinding at MegaMart
// for a year doesn't help you clear Assembly Works' engineer role. The one
// deliberate exception: MegaMart's Ops Director (Wave 12's Branching
// specializations fork off Department Manager) trains tech, not sales —
// the whole point of a fork is a real cross-skill choice, not two flavors
// of the same path.
export const JOBS: JobDef[] = [
  // Burger Barn
  {
    id: 'fry-cook',
    title: 'Fry Cook',
    workplace: 'burgers',
    wage: 6,
    prestige: 5,
    minDress: 10,
    minEducation: 0,
    minExperience: 0,
    trainsSkill: 'sales',
  },
  {
    id: 'shift-lead',
    title: 'Shift Lead',
    workplace: 'burgers',
    wage: 9,
    prestige: 15,
    minDress: 25,
    minEducation: 3,
    minExperience: 40,
    trainsSkill: 'sales',
  },
  {
    id: 'store-manager',
    title: 'Store Manager',
    workplace: 'burgers',
    wage: 14,
    prestige: 30,
    minDress: 50,
    minEducation: 9,
    minExperience: 120,
    trainsSkill: 'sales',
    minSkills: { sales: 40 },
  },
  {
    id: 'regional-manager',
    title: 'Regional Manager',
    workplace: 'burgers',
    wage: 21,
    prestige: 50,
    minDress: 85,
    minEducation: 18,
    minExperience: 240,
    requiresComputer: true,
    trainsSkill: 'sales',
    minSkills: { sales: 60 },
  },
  // MegaMart
  {
    id: 'stocker',
    title: 'Stocker',
    workplace: 'megamart',
    wage: 6.5,
    prestige: 8,
    minDress: 10,
    minEducation: 0,
    minExperience: 0,
    trainsSkill: 'sales',
  },
  {
    id: 'cashier',
    title: 'Cashier',
    workplace: 'megamart',
    wage: 8,
    prestige: 12,
    minDress: 25,
    minEducation: 2,
    minExperience: 20,
    trainsSkill: 'sales',
  },
  {
    id: 'dept-manager',
    title: 'Department Manager',
    workplace: 'megamart',
    wage: 13,
    prestige: 28,
    minDress: 50,
    minEducation: 8,
    minExperience: 100,
    trainsSkill: 'sales',
    minSkills: { sales: 40 },
  },
  {
    // Department Manager forks here into two divergent next-tier roles
    // (Wave 12's Branching specializations) instead of one linear rung —
    // Regional Buyer stays on the sales track this ladder already trains;
    // Ops Director pivots to tech, the one skill dimension MegaMart alone
    // never otherwise touches. Same prestige on purpose: a genuine fork,
    // not a "real" and a "consolation" tier — see career.ts's
    // nextTargetJob() for how Riley picks between prestige-tied branches.
    // `id` intentionally kept as 'regional-director' (the prior session's
    // pre-fork name) even though the title changed — this job already
    // shipped in production; renaming the id would 404 any live save where
    // a player or Riley already holds it (jobById() throws on an unknown
    // id, and current-version saves skip migration entirely). Caught in
    // PR review, not before merge.
    id: 'regional-director',
    title: 'Regional Buyer',
    workplace: 'megamart',
    wage: 20,
    prestige: 48,
    minDress: 80,
    minEducation: 18,
    minExperience: 200,
    trainsSkill: 'sales',
    minSkills: { sales: 60 },
  },
  {
    // minEducation deliberately below Lecturer's (18) — the real gate here
    // is proven tech skill, not classroom hours, and an ops role earning
    // its keep through hands-on systems work over formal study is the
    // point of the branch, not an incidental data quirk.
    id: 'ops-director',
    title: 'Ops Director',
    workplace: 'megamart',
    wage: 20,
    prestige: 48,
    minDress: 60,
    minEducation: 15,
    minExperience: 150,
    requiresComputer: true,
    trainsSkill: 'tech',
    minSkills: { tech: 60 },
  },
  // Assembly Works
  {
    id: 'janitor',
    title: 'Janitor',
    workplace: 'factory',
    wage: 7,
    prestige: 6,
    minDress: 0,
    minEducation: 0,
    minExperience: 0,
    trainsSkill: 'trades',
  },
  {
    id: 'assembler',
    title: 'Assembler',
    workplace: 'factory',
    wage: 10,
    prestige: 18,
    minDress: 10,
    minEducation: 4,
    minExperience: 40,
    trainsSkill: 'trades',
  },
  {
    id: 'technician',
    title: 'Technician',
    workplace: 'factory',
    wage: 15,
    prestige: 35,
    minDress: 25,
    minEducation: 12,
    minExperience: 120,
    trainsSkill: 'trades',
  },
  {
    id: 'engineer',
    title: 'Engineer',
    workplace: 'factory',
    wage: 22,
    prestige: 55,
    minDress: 50,
    minEducation: 18,
    minExperience: 200,
    trainsSkill: 'trades',
    minSkills: { trades: 50 },
  },
  // First Bank
  {
    id: 'teller',
    title: 'Bank Teller',
    workplace: 'bank',
    wage: 11,
    prestige: 25,
    minDress: 60,
    minEducation: 6,
    minExperience: 40,
    trainsSkill: 'tech',
  },
  {
    id: 'analyst',
    title: 'Financial Analyst',
    workplace: 'bank',
    wage: 18,
    prestige: 45,
    minDress: 75,
    minEducation: 14,
    minExperience: 120,
    requiresComputer: true,
    trainsSkill: 'tech',
  },
  {
    id: 'branch-manager',
    title: 'Branch Manager',
    workplace: 'bank',
    wage: 28,
    prestige: 70,
    minDress: 85,
    minEducation: 22,
    minExperience: 280,
    requiresComputer: true,
    trainsSkill: 'tech',
    minSkills: { tech: 50 },
  },
  {
    // Deliberately kept below Professor's 88 (the game's highest-prestige
    // job) — a banking role outranking the University's own terminal tier
    // would read oddly, and nothing in the roadmap asked for a new overall
    // ceiling, just a fourth rung matching Assembly Works' tier count.
    id: 'regional-vp',
    title: 'Regional VP',
    workplace: 'bank',
    wage: 36,
    prestige: 82,
    minDress: 90,
    minEducation: 26,
    minExperience: 360,
    requiresComputer: true,
    trainsSkill: 'tech',
    minSkills: { tech: 65 },
  },
  // City University
  {
    id: 'ta',
    title: 'Teaching Assistant',
    workplace: 'university',
    wage: 12,
    prestige: 30,
    minDress: 25,
    minEducation: 10,
    minExperience: 0,
    trainsSkill: 'tech',
  },
  {
    // Fills what was previously a stark 30->88 prestige gap with nothing in
    // between — the shallowest, most lopsided ladder in the game before
    // this. requiresComputer (not gated at 'ta') mirrors First Bank's own
    // pattern of the office track needing one starting at the *second*
    // tier, not just the terminal one.
    id: 'lecturer',
    title: 'Lecturer',
    workplace: 'university',
    wage: 20,
    prestige: 55,
    minDress: 40,
    minEducation: 18,
    minExperience: 80,
    requiresComputer: true,
    trainsSkill: 'tech',
  },
  {
    id: 'professor',
    title: 'Professor',
    workplace: 'university',
    wage: 30,
    prestige: 88,
    minDress: 60,
    minEducation: 30,
    minExperience: 200,
    requiresComputer: true,
    trainsSkill: 'tech',
    minSkills: { tech: 60 },
  },
]

export const SKILLS: Array<{ id: SkillId; name: string; blurb: string }> = [
  { id: 'sales', name: 'Sales', blurb: 'Built by working Burger Barn or MegaMart.' },
  { id: 'trades', name: 'Trades', blurb: 'Built by working Assembly Works.' },
  { id: 'tech', name: 'Tech', blurb: 'Built by working First Bank or City University.' },
]

/** Starting backgrounds — see OriginId/OriginDef in types.ts. `cash`/
 * `education`/`skills` are deltas applied on top of newPlayer()'s normal
 * baseline (so an origin composes with the chosen RulesConfig preset and,
 * for the human player, any Legacy perk cash bonus, rather than overriding
 * them); `items`/`apartment` are absolute. 'career-changer' is the neutral
 * baseline — every field a no-op delta — so newGame() can default to it
 * without changing today's starting stats for any caller that doesn't pass
 * an origin explicitly. */
export const ORIGINS: OriginDef[] = [
  {
    id: 'career-changer',
    name: 'Career Changer',
    blurb: 'Starting fresh with a clean slate — no head start, no handicap.',
    traitId: 'adaptable',
  },
  {
    id: 'first-gen-student',
    name: 'First-Gen Student',
    blurb: 'Worked through school with no family safety net.',
    cash: -20,
    education: 1,
    skills: { trades: 4 },
    traitId: 'scrappy',
  },
  {
    id: 'trust-fund-kid',
    name: 'Trust Fund Kid',
    blurb: 'Family money smoothed the way — a bit of extra cash to start.',
    cash: 120,
    traitId: 'connected',
  },
  {
    id: 'veteran',
    name: 'Veteran',
    blurb: 'A modest service stipend and some hands-on trades training.',
    cash: 40,
    skills: { trades: 6 },
    traitId: 'disciplined',
  },
  {
    id: 'small-town-transplant',
    name: 'Small-Town Transplant',
    blurb: 'New to the city, but not new to working a counter.',
    cash: -10,
    skills: { sales: 4 },
    traitId: 'resourceful',
  },
]

/** Each origin's one passive trait — see TraitId/TraitDef in types.ts for
 * the closed hook set and why `adaptable` (Career Changer's) is empty.
 * Deliberately small numbers: these are flavor on top of an origin's own
 * starting-stat deltas, not a second layer of the same size. */
export const TRAITS: Record<TraitId, TraitDef> = {
  adaptable: {},
  scrappy: { priceMultiplier: 0.95 },
  connected: { wageMultiplier: 1.04 },
  disciplined: { dressWearDelta: -1 },
  resourceful: { priceMultiplier: 0.97 },
}

export function traitFor(p: PlayerState): TraitDef {
  return TRAITS[originById(p.originId).traitId]
}

/** wagePerHour()'s trait input — defaults to 1 (no effect) so every call
 * site can pass it unconditionally. */
export function traitWageMultiplier(p: PlayerState): number {
  return traitFor(p).wageMultiplier ?? 1
}

/** seasonalPrice()'s trait input — see traitWageMultiplier. */
export function traitPriceMultiplier(p: PlayerState): number {
  return traitFor(p).priceMultiplier ?? 1
}

/** upkeep()'s dress-wear trait input — see traitWageMultiplier. */
export function traitDressWearDelta(p: PlayerState): number {
  return traitFor(p).dressWearDelta ?? 0
}

/** work()'s burnout-gated pay multiplier — 1 at burnout 0, down to
 * 1 - BURNOUT_EFFICIENCY_PENALTY_MAX at burnout 100. Composes with (not a
 * substitute for) traitWageMultiplier: a trait changes the nominal rate, this
 * reflects how much of it you're actually delivering right now. */
export function burnoutEfficiency(p: PlayerState): number {
  return 1 - (p.burnout / 100) * BURNOUT_EFFICIENCY_PENALTY_MAX
}

export const ITEMS: ItemDef[] = [
  {
    id: 'outfit-casual',
    name: 'Casual Outfit',
    soldAt: 'clothing',
    price: 45,
    dress: 30,
    blurb: 'Clean and presentable.',
  },
  {
    id: 'outfit-business',
    name: 'Business Outfit',
    soldAt: 'clothing',
    price: 140,
    dress: 60,
    blurb: 'Office-ready.',
  },
  {
    id: 'outfit-pro',
    name: 'Professional Suit',
    soldAt: 'clothing',
    price: 320,
    dress: 90,
    blurb: 'Corner-office material.',
  },
  {
    id: 'fridge',
    name: 'Refrigerator',
    soldAt: 'gadgets',
    price: 260,
    blurb: 'Stock up on groceries in bulk (stores 24 units).',
  },
  {
    id: 'tv',
    name: 'Television',
    soldAt: 'gadgets',
    price: 340,
    weeklyHappiness: 2,
    blurb: 'Something to come home to. +2 happiness/week.',
  },
  {
    id: 'stereo',
    name: 'Stereo System',
    soldAt: 'gadgets',
    price: 280,
    weeklyHappiness: 2,
    blurb: 'Music helps. +2 happiness/week.',
  },
  {
    id: 'console',
    name: 'Game Console',
    soldAt: 'gadgets',
    price: 420,
    weeklyHappiness: 3,
    blurb: 'The good stuff. +3 happiness/week.',
  },
  {
    id: 'bike',
    name: 'Bicycle',
    soldAt: 'gadgets',
    price: 180,
    blurb: 'Halves travel time around town.',
  },
  {
    id: 'phone',
    name: 'Smartphone',
    soldAt: 'gadgets',
    price: 190,
    blurb: 'Apply for jobs and pay rent from anywhere.',
  },
  {
    id: 'computer',
    name: 'Computer',
    soldAt: 'gadgets',
    price: 380,
    blurb: 'Required for senior office roles: Financial Analyst, Branch Manager, Professor.',
  },
]

/** Weekly premium for each paid insurance tier (see InsuranceTier in
 * types.ts) — auto-deducted in upkeep(), capped at available cash like
 * every other weekly cost. Replaces the old one-time $150 `insurance`
 * item's price at roughly the same per-week rate over an average game. */
export const INSURANCE_PREMIUM: Record<Exclude<InsuranceTier, 'none'>, number> = {
  basic: 6,
  full: 14,
}

/** `full` insurance multiplies both the Clinic's `seeDoctor()` price and the
 * `personalEvent()` doctor's-bill outcome by this — a co-pay, not a full
 * waiver, so seeing a doctor still costs something even with coverage. */
export const INSURANCE_MEDICAL_DISCOUNT = 0.5

export function jobById(id: string): JobDef {
  const job = JOBS.find((j) => j.id === id)
  if (!job) throw new Error(`Unknown job: ${id}`)
  return job
}

export function itemById(id: string): ItemDef {
  const item = ITEMS.find((i) => i.id === id)
  if (!item) throw new Error(`Unknown item: ${id}`)
  return item
}

export function originById(id: string): OriginDef {
  const origin = ORIGINS.find((o) => o.id === id)
  if (!origin) throw new Error(`Unknown origin: ${id}`)
  return origin
}

/** Travel cost in time units between two locations (steps around the loop).
 * `layout` defaults to the original unshuffled ordering so direct callers
 * (unit tests) keep working unchanged; real gameplay always passes the
 * game's own `GameState.layout` (see Wave 15's shuffled city). */
export function travelCost(
  from: LocationId,
  to: LocationId,
  hasBike: boolean,
  layout: Record<LocationId, number> = DEFAULT_LAYOUT
): number {
  const a = layout[from]
  const b = layout[to]
  const diff = Math.abs(a - b)
  const steps = Math.min(diff, LOOP_SIZE - diff)
  return hasBike ? Math.ceil(steps / 2) : steps
}

/** Goal slider (1–10) to concrete targets. */
export const WEALTH_TARGETS = [800, 1500, 2500, 4000, 6000, 8500, 11500, 15000, 20000, 25000]
export const HAPPINESS_TARGETS = [55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
export const EDUCATION_TARGETS = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30]
export const CAREER_TARGETS = [10, 18, 25, 30, 35, 45, 55, 70, 80, 88]

export type RulePresetName = 'classic' | 'brutal' | 'zen'

/** StartScreen rule presets. Classic is today's exact defaults, so a save
 * created before Rule presets existed and one that explicitly picks Classic
 * are indistinguishable in play. */
export const RULE_PRESETS: Record<RulePresetName, RulesConfig> = {
  classic: { eventFrequency: 1, economyVolatility: 1, startingCash: 200 },
  brutal: { eventFrequency: 1.5, economyVolatility: 1.5, startingCash: 100 },
  zen: { eventFrequency: 0.5, economyVolatility: 0.5, startingCash: 350 },
}
