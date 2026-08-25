import type { ItemDef, JobDef, LocationDef, LocationId } from './types'

export const WEEK_TIME = 60
export const FOOD_NEEDED = 6
export const MEAL_TIME = 2
export const CLASS_TIME = 8
export const RELAX_CAP = 10
export const EVICTION_WEEKS = 3

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
}

export const LOOP_SIZE = 13

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
  },
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
