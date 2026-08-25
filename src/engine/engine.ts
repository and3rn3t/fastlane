// Reducer entry point: creates games and applies actions immutably.

import * as act from './actions'
import { runAIWeek } from './ai'
import { HEALTH_START, WEEK_TIME } from './data'
import { endWeek } from './week'
import {
  SAVE_VERSION,
  type GameAction,
  type GameState,
  type Goals,
  type PlayerState,
} from './types'

function newPlayer(name: string, isAI: boolean): PlayerState {
  return {
    name,
    isAI,
    location: 'home',
    timeLeft: WEEK_TIME,
    cash: 200,
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
  }
}

export interface NewGameOptions {
  playerName: string
  goals: Goals
  seed?: number
}

export function newGame(opts: NewGameOptions): GameState {
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
    },
    player: newPlayer(opts.playerName || 'You', false),
    riley: newPlayer('Riley', true),
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
  const draft = structuredClone(state)
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
    case 'endWeek': {
      // Captured before Riley's turn runs so the report includes it — endWeek()
      // used to compute this internally, after runAIWeek had already logged
      // Riley's whole week, so lastReport.entries never actually contained it.
      const logStart = draft.log.length
      runAIWeek(draft, 'riley')
      endWeek(draft, logStart)
      break
    }
    case 'dismissReport':
      if (draft.phase === 'weekReport') draft.phase = 'playing'
      break
  }
  return draft
}
