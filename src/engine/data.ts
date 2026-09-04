import type { ItemDef, JobDef, LocationDef, LocationId, RulesConfig, SkillId } from './types'

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
/** Hours worked in a week beyond this drain health, at HEALTH_OVERWORK_RATE per excess hour. */
export const OVERWORK_THRESHOLD = 40
export const HEALTH_OVERWORK_RATE = 0.5
/** Health cost of a week fed mostly from cheap groceries instead of hot meals. */
export const HEALTH_CHEAP_FOOD_DRAIN = 2
/** Below this, low health starts dragging happiness down too. */
export const HEALTH_LOW_THRESHOLD = 40
export const HEALTH_LOW_HAPPINESS_PENALTY = 3
/** Below this, a sickness event (personalEvent) can actually cost time. */
export const HEALTH_SICK_THRESHOLD = 50
export const DOCTOR_PRICE = 45
export const DOCTOR_TIME = 3
export const DOCTOR_HEAL = 35

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
  {
    id: 'insurance',
    name: 'Home Insurance',
    soldAt: 'bank',
    price: 150,
    blurb: "Covers your belongings — a burglar can't take what's insured.",
  },
]

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

/** Travel cost in time units between two locations (steps around the loop). */
export function travelCost(from: LocationId, to: LocationId, hasBike: boolean): number {
  const a = LOCATIONS[from].loopIndex
  const b = LOCATIONS[to].loopIndex
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
