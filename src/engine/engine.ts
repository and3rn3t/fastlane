// Reducer entry point: creates games and applies actions immutably.

import * as act from './actions'
import { AI_PROFILES, DIFFICULTY_SKILL, runAIWeek } from './ai'
import { CREDIT_SCORE_START, HEALTH_START, RULE_PRESETS, WEEK_TIME } from './data'
import { endWeek } from './week'
import {
  SAVE_VERSION,
  type AiProfileName,
  type GameAction,
  type GameState,
  type Goals,
  type PlayerState,
  type RileyDifficulty,
  type RulesConfig,
} from './types'

function newPlayer(name: string, isAI: boolean, startingCash: number): PlayerState {
  return {
    name,
    isAI,
    location: 'home',
    timeLeft: WEEK_TIME,
    cash: startingCash,
    savings: 0,
    happiness: 50,
    education: 0,
    jobId: null,
    experience: 0,
    dress: 20,
    items: [],
    apartment: 'none',
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
    skills: { sales: 0, trades: 0, tech: 0 },
    investments: 0,
    activeEvents: [],
  }
}

export interface NewGameOptions {
  playerName: string
  goals: Goals
  seed?: number
  rileyProfile?: AiProfileName
  rileyDifficulty?: RileyDifficulty
  rules?: RulesConfig
  isDailyChallenge?: boolean
}

export function newGame(opts: NewGameOptions): GameState {
  const rules = opts.rules ?? RULE_PRESETS.classic
  return {
    version: SAVE_VERSION,
    week: 1,
    rngSeed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
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
    player: newPlayer(opts.playerName || 'You', false, rules.startingCash),
    riley: newPlayer('Riley', true, rules.startingCash),
    rileyProfile: opts.rileyProfile ?? 'balanced',
    rileyDifficulty: opts.rileyDifficulty ?? 'normal',
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
      const profile = {
        ...AI_PROFILES[draft.rileyProfile],
        skillLevel: DIFFICULTY_SKILL[draft.rileyDifficulty],
      }
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
