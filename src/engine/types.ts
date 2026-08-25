export type LocationId =
  | 'home'
  | 'employment'
  | 'burgers'
  | 'megamart'
  | 'university'
  | 'factory'
  | 'bank'
  | 'clothing'
  | 'gadgets'
  | 'market'
  | 'pawn'
  | 'rentoffice'
  | 'clinic'

export type ItemId =
  | 'outfit-casual'
  | 'outfit-business'
  | 'outfit-pro'
  | 'fridge'
  | 'tv'
  | 'stereo'
  | 'console'
  | 'bike'
  | 'phone'
  | 'computer'
  | 'insurance'

export type ApartmentTier = 'none' | 'basic' | 'secure'

export interface LocationDef {
  id: LocationId
  name: string
  blurb: string
  /** Position around the board loop; travel cost = steps between positions. */
  loopIndex: number
}

export interface JobDef {
  id: string
  title: string
  workplace: LocationId
  /** Base pay per time unit, before the economy's wage index. */
  wage: number
  /** Career score conferred while employed here (0–100). */
  prestige: number
  minDress: number
  minEducation: number
  minExperience: number
  /** Senior white-collar roles need a computer at home, not just the right
   * dress/education/experience. */
  requiresComputer?: boolean
}

export interface ItemDef {
  id: ItemId
  name: string
  soldAt: LocationId
  /** Base price, before the economy's price index. */
  price: number
  /** For outfits: the dress score the outfit provides when new. */
  dress?: number
  /** Passive happiness granted at each week's end while owned. */
  weeklyHappiness?: number
  blurb: string
}

export interface Goals {
  /** Net worth in dollars. */
  wealth: number
  /** Happiness 0–100. */
  happiness: number
  /** Classes completed. */
  education: number
  /** Job prestige 0–100. */
  career: number
}

export interface PlayerState {
  name: string
  isAI: boolean
  location: LocationId
  timeLeft: number
  cash: number
  savings: number
  happiness: number
  education: number
  jobId: string | null
  /** Lifetime time units worked. */
  experience: number
  /** Current outfit quality 0–100; wears down weekly. */
  dress: number
  items: ItemId[]
  apartment: ApartmentTier
  /** Unpaid rent balance. */
  rentDue: number
  /** Consecutive weeks with unpaid rent (eviction at 3). */
  weeksBehindOnRent: number
  /** Food units eaten so far this week. */
  fed: number
  /** Food units stored at home. */
  groceries: number
  lotteryTickets: number
  /** Time units of relaxing already used this week (capped). */
  relaxedThisWeek: number
  /** 0–100; drained by overworking or skipping hot meals for cheap groceries,
   * restored at the Clinic. Feeds happiness rather than being its own goal. */
  health: number
  /** Time units worked this week — resets with the rest of the weekly state;
   * tracked separately from lifetime `experience` so upkeep can tell overwork
   * apart from a light week. */
  hoursWorkedThisWeek: number
  /** Weeks continuously employed at the current job with at least some hours
   * worked that week — a no-show week resets this to 0, same as quitting or
   * taking a new job. Drives in-job promotions. */
  jobTenureWeeks: number
  /** Promotions earned at the current job (0..MAX_PROMOTIONS) — boosts wage
   * and prestige without switching jobs. Resets on quit or a new hire. */
  promotionLevel: number
  /** Outstanding loan principal + accrued interest. */
  loanBalance: number
  /** Consecutive weeks with an unpaid loan balance — garnishment kicks in at
   * LOAN_MISSED_WEEKS_FOR_GARNISHMENT, same shape as weeksBehindOnRent. */
  loanWeeksBehind: number
  /** 0–100 — a payment this week raises it, a missed one lowers it, and it
   * sets the loan limit via `maxLoan()`. */
  creditScore: number
  /** True once garnishment has kicked in — work() auto-diverts a cut of each
   * paycheck to the loan until it's paid off, then clears automatically. */
  garnished: boolean
  /** Whether any loan payment (voluntary or garnished) landed this week —
   * read by upkeep, reset with the rest of the weekly state. */
  loanPaidThisWeek: boolean
}

export interface Economy {
  /** Multiplier on all prices. */
  priceIndex: number
  /** Multiplier on all wages. */
  wageIndex: number
  /** Weekly interest rate on savings, e.g. 0.005. */
  interestRate: number
  lotteryJackpot: number
}

export interface LogEntry {
  week: number
  actor: 'player' | 'riley' | 'world'
  text: string
  /** Actor's location when this happened — set for per-action player/riley
   * entries (via actions.ts's log()), absent on world/upkeep entries. Lets
   * the UI replay a turn's path without the engine tracking history itself. */
  location?: LocationId
}

export type GamePhase = 'playing' | 'weekReport' | 'over'

export interface WeekReport {
  week: number
  headline: string
  entries: LogEntry[]
}

/** One row per completed week — net worth/career for both players, recorded
 * in week.ts's endWeek() so the end-of-game recap can chart real progression
 * instead of only the final score. */
export interface WeekSnapshot {
  week: number
  playerNetWorth: number
  playerCareer: number
  rileyNetWorth: number
  rileyCareer: number
}

/** Bump on any GameState/PlayerState shape change and add a migration step in
 * state/GameContext.tsx's MIGRATIONS map — see that file for the full scheme.
 * The engine owns this number since it owns what the shape actually is. */
export const SAVE_VERSION = 4

export interface GameState {
  version: number
  week: number
  rngSeed: number
  phase: GamePhase
  winner: 'player' | 'riley' | null
  goals: Goals
  economy: Economy
  player: PlayerState
  riley: PlayerState
  headline: string
  log: LogEntry[]
  lastReport: WeekReport | null
  history: WeekSnapshot[]
}

export type PlayerKey = 'player' | 'riley'

export type GameAction =
  | { type: 'travel'; to: LocationId }
  | { type: 'work'; hours: number }
  | { type: 'applyJob'; jobId: string }
  | { type: 'quitJob' }
  | { type: 'takeClass' }
  | { type: 'buyItem'; itemId: ItemId }
  | { type: 'buyMeal' }
  | { type: 'buyGroceries'; units: number }
  | { type: 'buyLottery'; tickets: number }
  | { type: 'deposit'; amount: number }
  | { type: 'withdraw'; amount: number }
  | { type: 'payRent' }
  | { type: 'rentApartment'; tier: Exclude<ApartmentTier, 'none'> }
  | { type: 'sellItem'; itemId: ItemId }
  | { type: 'relax'; hours: number }
  | { type: 'seeDoctor' }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; amount: number }
  | { type: 'endWeek' }
  | { type: 'dismissReport' }
