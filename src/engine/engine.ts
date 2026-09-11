// Reducer entry point: creates games and applies actions immutably.

import * as act from './actions'
import { AI_PROFILES, applyMomentum, DIFFICULTY_SKILL, runAIWeek } from './ai'
import {
  CREDIT_SCORE_START,
  HEALTH_START,
  itemById,
  originById,
  ORIGINS,
  RULE_PRESETS,
  WEEK_TIME,
} from './data'
import { rollInt } from './rng'
import { endWeek } from './week'
import {
  SAVE_VERSION,
  type AiProfileName,
  type GameAction,
  type GameState,
  type Goals,
  type ItemId,
  type OriginId,
  type PlayerState,
  type RileyDifficulty,
  type RileyMomentum,
  type RulesConfig,
} from './types'

/** Origin `career-changer` is every field a no-op delta, so this default
 * reproduces today's exact plain starting stats for any caller that doesn't
 * pass an origin explicitly. */
const DEFAULT_ORIGIN: OriginId = 'career-changer'

function newPlayer(
  name: string,
  isAI: boolean,
  startingCash: number,
  originId: OriginId
): PlayerState {
  const origin = originById(originId)
  const items: ItemId[] = origin.items ? [...origin.items] : []
  let dress = 20
  for (const itemId of items) {
    const item = itemById(itemId)
    if (item.dress !== undefined) dress = Math.max(dress, item.dress)
  }
  return {
    name,
    isAI,
    location: 'home',
    timeLeft: WEEK_TIME,
    cash: Math.max(0, startingCash + (origin.cash ?? 0)),
    savings: 0,
    happiness: 50,
    education: Math.max(0, origin.education ?? 0),
    jobId: null,
    experience: 0,
    dress,
    items,
    apartment: origin.apartment ?? 'none',
    rentDue: 0,
    weeksBehindOnRent: 0,
    fed: 0,
    groceries: 0,
    lotteryTickets: 0,
    relaxedThisWeek: 0,
    health: HEALTH_START,
    hoursWorkedThisWeek: 0,
    jobTenureWeeks: 0,
    promotionLevel: 0,
    loanBalance: 0,
    loanWeeksBehind: 0,
    creditScore: CREDIT_SCORE_START,
    garnished: false,
    loanPaidThisWeek: false,
    skills: {
      sales: origin.skills?.sales ?? 0,
      trades: origin.skills?.trades ?? 0,
      tech: origin.skills?.tech ?? 0,
    },
    investments: 0,
    activeEvents: [],
    originId,
  }
}

export interface NewGameOptions {
  playerName: string
  goals: Goals
  seed?: number
  rileyProfile?: AiProfileName
  rileyDifficulty?: RileyDifficulty
  /** Riley's catch-up signal for this game — see types.ts's RileyMomentum.
   * Omit (defaults to 'even') for anything that must stay identical for
   * every player, e.g. the Daily Challenge. */
  rileyMomentum?: RileyMomentum
  rules?: RulesConfig
  isDailyChallenge?: boolean
  /** Legacy-perk cash bonus (src/legacy.ts), added on top of the rules
   * preset's startingCash for the player only — Riley always starts at the
   * plain preset value, so this never changes Riley's own difficulty. */
  playerCashBonus?: number
  /** The human player's starting background — see OriginId/ORIGINS in
   * data.ts. Defaults to DEFAULT_ORIGIN (a no-op) when omitted, e.g. before
   * an origin picker UI exists. Riley always draws its own origin at random,
   * seeded off this game's own seed — see below. */
  playerOriginId?: OriginId
  /** Forces Riley's origin instead of letting it draw randomly — for sim/test
   * use only (see scripts/sim.ts's origin matrix); a real game never sets
   * this. The random draw still runs and still advances rngSeed even when
   * this is set, so a given seed's week-to-week RNG stream is identical
   * whether or not this override is used — isolating the origin's own effect
   * as the only difference between two runs of the same seed. */
  rileyOriginId?: OriginId
}

/** Draws Riley's origin against a mutable rng state (advancing its seed by
 * one step) — the one and only RNG draw newGame() makes at construction
 * time. Factored out so initialRngSeed() below can reproduce exactly this
 * transformation without duplicating it. */
function drawRileyOrigin(rngState: { rngSeed: number }): OriginId {
  return ORIGINS[rollInt(rngState, ORIGINS.length)].id
}

/** The `rngSeed` a freshly-constructed `newGame({ seed })` would have,
 * before any week is played — i.e. `seed` advanced by newGame()'s own
 * construction-time draws (currently just Riley's origin). Lets a caller
 * check "does this save's current rngSeed match having just been started
 * fresh from this exact seed" without replaying full game construction —
 * e.g. the Daily Challenge deep-link's "is this already today's challenge"
 * check in App.tsx. Update this alongside newGame() if it ever adds another
 * construction-time draw. */
export function initialRngSeed(seed: number): number {
  const rngState = { rngSeed: seed }
  drawRileyOrigin(rngState)
  return rngState.rngSeed
}

export function newGame(opts: NewGameOptions): GameState {
  const rules = opts.rules ?? RULE_PRESETS.classic
  // Riley's origin is the game's very first RNG draw, ahead of anything
  // week.ts does — deliberately, so it stays reproducible from the seed like
  // everything else in a replay. It also means every seed-dependent test in
  // this repo shifts by one draw from here on; see Standing Constraints in
  // docs/ROADMAP.md for why that's expected, not a bug.
  const rngState = { rngSeed: opts.seed ?? Math.floor(Math.random() * 2 ** 31) }
  const drawnRileyOriginId = drawRileyOrigin(rngState)
  const rileyOriginId = opts.rileyOriginId ?? drawnRileyOriginId
  return {
    version: SAVE_VERSION,
    week: 1,
    rngSeed: rngState.rngSeed,
    phase: 'playing',
    winner: null,
    goals: opts.goals,
    economy: {
      priceIndex: 1,
      wageIndex: 1,
      interestRate: 0.005,
      lotteryJackpot: 500,
      marketIndex: 1,
    },
    player: newPlayer(
      opts.playerName || 'You',
      false,
      rules.startingCash + (opts.playerCashBonus ?? 0),
      opts.playerOriginId ?? DEFAULT_ORIGIN
    ),
    riley: newPlayer('Riley', true, rules.startingCash, rileyOriginId),
    rileyProfile: opts.rileyProfile ?? 'balanced',
    rileyDifficulty: opts.rileyDifficulty ?? 'normal',
    rileyMomentum: opts.rileyMomentum ?? 'even',
    rules,
    isDailyChallenge: opts.isDailyChallenge ?? false,
    headline: 'A new life in the fast lane begins.',
    log: [],
    lastReport: null,
    history: [],
  }
}

/**
 * Apply a player action, returning a new state. Throws EngineError (with a
 * user-readable message) if the move is invalid; the input state is untouched.
 */
export function applyAction(state: GameState, action: GameAction): GameState {
  // `log`/`history` are append-only (only ever `.push()`ed, never mutated
  // after) and unbounded over a save's lifetime, so a full deep clone of them
  // dominates the clone cost for a long game — a shallow array copy is
  // exactly as safe and far cheaper. The rest of GameState is small and
  // flat enough (see clonePlayer's comment) that structuredClone's generic
  // recursive walk buys nothing over explicit shallow copies per field,
  // and costs real time since this runs on every single dispatched action,
  // not once per week.
  // Every action type below mutates only `state.player` — 'endWeek' is the
  // sole exception, since it's the only case that touches 'riley' (via
  // runAIWeek + endWeek's own upkeep for both sides). So riley only needs a
  // real copy on that one action type; everything else can keep sharing the
  // old riley object outright. If a future action type ever needs to touch
  // riley directly, it must clone it here too, or this silently shares
  // mutable state.
  const draft: GameState = {
    ...state,
    goals: { ...state.goals },
    economy: { ...state.economy },
    rules: { ...state.rules },
    player: act.clonePlayer(state.player),
    riley: action.type === 'endWeek' ? act.clonePlayer(state.riley) : state.riley,
    log: state.log.slice(),
    history: state.history.slice(),
  }
  switch (action.type) {
    case 'travel':
      act.travel(draft, 'player', action.to)
      break
    case 'work':
      act.work(draft, 'player', action.hours)
      break
    case 'applyJob':
      act.applyJob(draft, 'player', action.jobId)
      break
    case 'quitJob':
      act.quitJob(draft, 'player')
      break
    case 'takeClass':
      act.takeClass(draft, 'player')
      break
    case 'trainSkill':
      act.trainSkill(draft, 'player', action.skillId)
      break
    case 'buyItem':
      act.buyItem(draft, 'player', action.itemId)
      break
    case 'buyMeal':
      act.buyMeal(draft, 'player')
      break
    case 'buyGroceries':
      act.buyGroceries(draft, 'player', action.units)
      break
    case 'buyLottery':
      act.buyLottery(draft, 'player', action.tickets)
      break
    case 'deposit':
      act.deposit(draft, 'player', action.amount)
      break
    case 'withdraw':
      act.withdraw(draft, 'player', action.amount)
      break
    case 'invest':
      act.invest(draft, 'player', action.amount)
      break
    case 'divest':
      act.divest(draft, 'player', action.units)
      break
    case 'payRent':
      act.payRent(draft, 'player')
      break
    case 'rentApartment':
      act.rentApartment(draft, 'player', action.tier)
      break
    case 'sellItem':
      act.sellItem(draft, 'player', action.itemId)
      break
    case 'relax':
      act.relax(draft, 'player', action.hours)
      break
    case 'seeDoctor':
      act.seeDoctor(draft, 'player')
      break
    case 'takeLoan':
      act.takeLoan(draft, 'player', action.amount)
      break
    case 'repayLoan':
      act.repayLoan(draft, 'player', action.amount)
      break
    case 'playCasino':
      act.playCasino(draft, 'player', action.bet)
      break
    case 'endWeek': {
      // Captured before Riley's turn runs so the report includes it — endWeek()
      // used to compute this internally, after runAIWeek had already logged
      // Riley's whole week, so lastReport.entries never actually contained it.
      const logStart = draft.log.length
      const profile = applyMomentum(
        {
          ...AI_PROFILES[draft.rileyProfile],
          skillLevel: DIFFICULTY_SKILL[draft.rileyDifficulty],
        },
        draft.rileyMomentum
      )
      runAIWeek(draft, 'riley', profile)
      endWeek(draft, logStart)
      break
    }
    case 'dismissReport':
      if (draft.phase === 'weekReport') draft.phase = 'playing'
      break
  }
  return draft
}
