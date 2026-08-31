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
  | 'casino'

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

/** A small, closed set of specializations — not a generic skill tree. Each
 * rises passively from working a job that trains it (JobDef.trainsSkill) or
 * directly via the trainSkill action, and gates a handful of top-tier jobs
 * (JobDef.minSkills) so which employer you grind at actually matters beyond
 * just "more experience." */
export type SkillId = 'sales' | 'trades' | 'tech'

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
  /** The skill this job builds while working it (see work() in actions.ts). */
  trainsSkill?: SkillId
  /** Skill floors this job additionally requires, on top of dress/education/
   * experience — makes the ladder branch by specialization, not just grind. */
  minSkills?: Partial<Record<SkillId, number>>
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
  /** 0–100 per skill — see SkillId. Always all three keys present (unlike
   * JobDef.minSkills' Partial), so callers never need an existence check. */
  skills: Record<SkillId, number>
  /** Units held, not dollars — mark-to-market via Economy.marketIndex, so
   * netWorth() reflects the current value without an explicit divest. */
  investments: number
  /** In-progress event chains (see week.ts's personalEvent/resolveActiveEvents) —
   * a laid-off player or one expecting an inheritance carries this forward
   * week to week instead of the effect resolving in a single one-shot roll. */
  activeEvents: ActiveEvent[]
}

/** One entry per event chain currently playing out for a player. `stage`
 * indexes which point in the chain's story it's at; `weeksInStage` drives
 * how long it's been there, so resolveActiveEvents knows when to advance or
 * resolve it. Kept intentionally small — 2-3 chains, 2-3 stages each — not a
 * general narrative-scripting system. */
export interface ActiveEvent {
  chainId: 'layoff' | 'inheritance'
  stage: number
  weeksInStage: number
}

export interface Economy {
  /** Multiplier on all prices. */
  priceIndex: number
  /** Multiplier on all wages. */
  wageIndex: number
  /** Weekly interest rate on savings, e.g. 0.005. */
  interestRate: number
  lotteryJackpot: number
  /** Mark-to-market value of one investment unit — drifts in driftEconomy()
   * same as priceIndex/wageIndex, clamped wider (MARKET_INDEX_MIN/MAX in
   * data.ts) since investing is meant to carry more real risk/reward than
   * the price/wage indices' background noise. */
  marketIndex: number
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
export const SAVE_VERSION = 10

/** Riley's catch-up signal for the *current* game, derived once at game
 * start from the player's rivalry history (src/rivalry.ts) and stored on
 * GameState so it stays available to every week's 'endWeek' action, not just
 * the UI layer that computed it. 'cold' nudges Riley's decision weighting
 * (see ai.ts's applyMomentum); 'hot'/'even' apply no bias — winning against
 * Riley is never punished, only a real losing streak gets a bounded assist. */
export type RileyMomentum = 'hot' | 'cold' | 'even'

/** Named weight presets for Riley's AI policy (ai.ts's AI_PROFILES) — a
 * game-level setting, not per-player state, since it configures how Riley's
 * turn is decided rather than anything about a player's progress. */
export type AiProfileName = 'balanced' | 'hustler' | 'scholar' | 'gambler'

/** StartScreen difficulty control, orthogonal to `AiProfileName` — profile
 * is Riley's style, difficulty is how well Riley plays regardless of style
 * (see ai.ts's AiProfile.skillLevel and DIFFICULTY_SKILL). A game-level
 * setting for the same reason AiProfileName is. */
export type RileyDifficulty = 'easy' | 'normal' | 'hard'

/** Tunable knobs behind the StartScreen's Classic/Brutal/Zen presets
 * (data.ts's RULE_PRESETS) — the resolved values live on GameState, not a
 * preset name, so a save is self-contained even if the preset list changes
 * later. */
export interface RulesConfig {
  /** Multiplies personalEvent()'s per-week trigger chance. */
  eventFrequency: number
  /** Multiplies the magnitude of each weekly economic headline's effect. */
  economyVolatility: number
  /** Cash both players start the game with. */
  startingCash: number
}

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
  rileyProfile: AiProfileName
  rileyDifficulty: RileyDifficulty
  rileyMomentum: RileyMomentum
  rules: RulesConfig
  /** True for a game started from the Daily Challenge button — a fixed,
   * date-derived seed/goals/rules/profile so every player's run that day is
   * directly comparable. Drives GameOver's shareable emoji result grid. */
  isDailyChallenge: boolean
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
  | { type: 'trainSkill'; skillId: SkillId }
  | { type: 'invest'; amount: number }
  | { type: 'divest'; units: number }
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
  | { type: 'playCasino'; bet: number }
  | { type: 'endWeek' }
  | { type: 'dismissReport' }
