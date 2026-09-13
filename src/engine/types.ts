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

export type ApartmentTier = 'none' | 'basic' | 'secure'

/** `none`/`basic`/`full` — a weekly premium (INSURANCE_PREMIUM in data.ts),
 * not a one-time item purchase (Wave 16's Insurance tiers row replaced the
 * old binary `insurance` ItemId with this). `basic` covers durable-goods
 * burglary only (week.ts's burglaryUpkeep); `full` adds a discount on
 * Clinic visits and the `personalEvent()` doctor's-bill outcome
 * (INSURANCE_MEDICAL_DISCOUNT). */
export type InsuranceTier = 'none' | 'basic' | 'full'

/** A small, closed set of specializations — not a generic skill tree. Each
 * rises passively from working a job that trains it (JobDef.trainsSkill) or
 * directly via the trainSkill action, and gates a handful of top-tier jobs
 * (JobDef.minSkills) so which employer you grind at actually matters beyond
 * just "more experience." */
export type SkillId = 'sales' | 'trades' | 'tech'

/** A small, closed set of starting backgrounds — not a generator, same
 * discipline as SkillId. Each sets a player's starting cash/education/
 * skills/items/apartment (see ORIGINS in data.ts) and carries one `traitId`
 * (see OriginDef.traitId / TraitId) whose passive effects TRAITS in data.ts
 * defines. */
export type OriginId =
  'first-gen-student' | 'trust-fund-kid' | 'career-changer' | 'veteran' | 'small-town-transplant'

/** A small, closed set of passive modifiers — not a scripting system, same
 * discipline as SkillId/OriginId. Each origin carries exactly one (see
 * OriginDef.traitId); TRAITS in data.ts maps each to at most a couple of the
 * named hooks TraitDef exposes. `adaptable` (Career Changer's trait) is the
 * neutral one — no modifiers — mirroring that origin's own no-op design. */
export type TraitId = 'adaptable' | 'scrappy' | 'connected' | 'disciplined' | 'resourceful'

/** A trait's passive effect, applied at exactly these named hook points —
 * never anywhere else, and a trait touches at most two of them:
 * `wagePerHour()` (work()'s pay rate), `seasonalPrice()` (grocery/rent
 * cost), and `upkeep()`'s weekly dress wear. All optional; absent means no
 * effect at that hook. */
export interface TraitDef {
  /** Multiplies wagePerHour()'s result. */
  wageMultiplier?: number
  /** Multiplies seasonalPrice()'s result. */
  priceMultiplier?: number
  /** Added to DRESS_WEAR_PER_WEEK in upkeep() — negative wears slower. */
  dressWearDelta?: number
}

export interface LocationDef {
  id: LocationId
  name: string
  blurb: string
  /** Position around the board loop; travel cost = steps between positions. */
  loopIndex: number
}

/** A catalog row in ORIGINS (data.ts) — the starting overrides `newPlayer()`
 * applies for a chosen origin. Absent fields keep the game's normal default
 * (see newPlayer() in engine.ts). */
export interface OriginDef {
  id: OriginId
  name: string
  blurb: string
  cash?: number
  education?: number
  skills?: Partial<Record<SkillId, number>>
  items?: ItemId[]
  apartment?: ApartmentTier
  /** Looked up in TRAITS (data.ts) for this origin's passive modifiers. */
  traitId: TraitId
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

/** One per-criterion row of `qualifiesFor()`'s underlying detail — `current`/
 * `required` let a UI render real progress ("Dress 18/25") instead of flat
 * pass/fail text. Only emitted for criteria a job actually gates on (e.g. no
 * row for education when `minEducation` is 0) — see `jobRequirements()` in
 * actions.ts, the single source of truth `qualifiesFor()` itself derives
 * `ok`/`reasons` from. */
export interface JobRequirement {
  /** Stable identifier: 'education' | 'dress' | 'experience' | 'computer' |
   * `skill:${SkillId}` — lets a UI key/style rows without parsing `label`. */
  key: string
  /** Display label, e.g. "Classes", "Dress", "Computer", "Sales skill". */
  label: string
  current: number
  required: number
  /** True if this criterion is satisfied — accounts for the layoff
   * "sympathy hire" carve-out (dress/experience only), so this can be true
   * even when `current < required`; `waived` distinguishes that case. */
  met: boolean
  /** True only when `met` is true solely because of the sympathy-hire
   * carve-out, not because `current >= required` — lets a UI show *why*
   * a criterion reads as satisfied despite the raw numbers. */
  waived?: boolean
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
  /** Weekly premium auto-deducted (capped at cash) in upkeep() — see
   * InsuranceTier's own doc comment for what each tier covers. */
  insurance: InsuranceTier
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
  /** 0–100; drained by skipping hot meals for cheap groceries, restored at
   * the Clinic. Feeds happiness rather than being its own goal. Overwork
   * used to drain this too — split out into `burnout` below so the two
   * consequences of a heavy week read as genuinely different things. */
  health: number
  /** 0–100; built by the workOut action (Home), never decays on its own.
   * Slows — never reverses — health's own weekly decay in healthUpkeep()
   * (see FITNESS_DECAY_REDUCTION_MAX), a compounding return on hours spent
   * now paid out over every remaining week. */
  fitness: number
  /** 0–100; rises from overwork (burnoutUpkeep, driven by
   * hoursWorkedThisWeek over OVERWORK_THRESHOLD), never falls on its own —
   * only relax() relieves it, riding the same relaxedThisWeek cap rather
   * than a separate one. Distinct from health/happiness in what it actually
   * does: high burnout gates work()'s pay efficiency directly (see
   * burnoutEfficiency in data.ts), not just another number that drains
   * something else. Also drags happiness down past BURNOUT_HIGH_THRESHOLD,
   * same shape as health's own low-threshold happiness penalty. */
  burnout: number
  /** Time units of working out already used this week — capped at
   * FITNESS_WORKOUT_CAP_PER_WEEK, same shape as relaxedThisWeek, so building
   * fitness competes for hours across many weeks rather than being able to
   * consume an entire week's idle time in one binge. */
  workedOutThisWeek: number
  /** Consecutive weeks (not reset weekly like the fields above — this
   * persists across weeks on purpose) spent "neglecting" (see
   * isNeglecting() in week.ts: unwell — low health or high burnout — with
   * fitness still low, so there was no active self-care to offset it).
   * Reaching CHRONIC_ONSET_WEEKS starts a `'chronic'` activeEvents chain and
   * resets this to 0; any non-neglecting week also resets it, so recovery
   * has to be sustained, not banked. */
  neglectWeeks: number
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
  /** Starting background chosen (or, for Riley, seeded-randomly drawn) at
   * newGame() — see ORIGINS in data.ts. Applied once at construction; the
   * field itself is just a label, not re-applied on load. */
  originId: OriginId
}

/** One entry per event chain currently playing out for a player. `stage`
 * indexes which point in the chain's story it's at; `weeksInStage` drives
 * how long it's been there, so resolveActiveEvents knows when to advance or
 * resolve it. Kept intentionally small — 2-3 chains, 2-3 stages each — not a
 * general narrative-scripting system.
 *
 * `'chronic'` (Wave 16) repurposes `stage` as a *recovery* counter rather
 * than a story position — consecutive weeks NOT neglecting (see
 * isNeglecting() in week.ts) while the condition is active, reset to 0 on
 * any relapse week. Unlike `layoff`/`inheritance`, which resolve on a fixed
 * timer, `chronic` only resolves once `stage` reaches
 * CHRONIC_RECOVERY_WEEKS — sustained care, not a cooldown. */
export interface ActiveEvent {
  chainId: 'layoff' | 'inheritance' | 'chronic'
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
export const SAVE_VERSION = 16

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
  /** Per-game location → loopIndex assignment, shuffled at newGame() from the
   * seed (see data.ts's `shuffledLayout`) instead of using `LocationDef`'s own
   * fixed `loopIndex` directly, so the travel map differs every run while
   * still replaying identically from a given seed. Persisted so a loaded save
   * keeps its own city — see `DEFAULT_LAYOUT` and GameContext.tsx's migration
   * for saves from before this field existed. */
  layout: Record<LocationId, number>
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
  | { type: 'buyInsurance'; tier: InsuranceTier }
  | { type: 'sellItem'; itemId: ItemId }
  | { type: 'relax'; hours: number }
  | { type: 'workOut'; hours: number }
  | { type: 'seeDoctor' }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; amount: number }
  | { type: 'playCasino'; bet: number }
  | { type: 'endWeek' }
  | { type: 'dismissReport' }
