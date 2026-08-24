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
}

export type GamePhase = 'playing' | 'weekReport' | 'over'

export interface WeekReport {
  week: number
  headline: string
  entries: LogEntry[]
}

export interface GameState {
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
  | { type: 'endWeek' }
  | { type: 'dismissReport' }
