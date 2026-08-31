// Riley "remembers" past games against the player — a lightweight rivalry
// memory persisted in localStorage independently of any single save, same
// architectural pattern as src/stats.ts (own module, own key, dedupes on
// rngSeed). Feeds a small, bounded catch-up bias in the AI's decision
// weighting (engine/ai.ts's applyMomentum) and a flavor line shown on
// StartScreen/GameOver — never a difficulty cliff, and deliberately never
// wired into the Daily Challenge, which stays identical for every player.

import type { GameState, RileyMomentum } from '@/engine'

export interface RivalryMemory {
  gamesPlayed: number
  playerWins: number
  rileyWins: number
  /** Length of the current streak (>= 1 once any game has been recorded). */
  streak: number
  streakOwner: 'player' | 'riley' | null
  /** Dedupe key — the rngSeed of the last game recordRivalryResult() saw. */
  lastRecordedSeed: number | null
}

const RIVALRY_KEY = 'fastlane-rivalry-v1'

const DEFAULT_RIVALRY: RivalryMemory = {
  gamesPlayed: 0,
  playerWins: 0,
  rileyWins: 0,
  streak: 0,
  streakOwner: null,
  lastRecordedSeed: null,
}

export function loadRivalry(): RivalryMemory {
  try {
    const raw = localStorage.getItem(RIVALRY_KEY)
    if (!raw) return DEFAULT_RIVALRY
    return { ...DEFAULT_RIVALRY, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_RIVALRY
  }
}

function saveRivalry(memory: RivalryMemory) {
  try {
    localStorage.setItem(RIVALRY_KEY, JSON.stringify(memory))
  } catch {
    // Storage full or blocked — rivalry memory just won't persist this time.
  }
}

/**
 * Records a completed game's outcome into rivalry memory. Safe to call more
 * than once for the same game (mirrors stats.ts's recordGameResult) —
 * dedupes on the game's own rngSeed.
 */
export function recordRivalryResult(game: GameState): { memory: RivalryMemory } {
  const memory = loadRivalry()
  if (memory.lastRecordedSeed === game.rngSeed) {
    return { memory }
  }
  const playerWon = game.winner === 'player'
  const winner: 'player' | 'riley' = playerWon ? 'player' : 'riley'
  const next: RivalryMemory = {
    gamesPlayed: memory.gamesPlayed + 1,
    playerWins: memory.playerWins + (playerWon ? 1 : 0),
    rileyWins: memory.rileyWins + (playerWon ? 0 : 1),
    streak: memory.streakOwner === winner ? memory.streak + 1 : 1,
    streakOwner: winner,
    lastRecordedSeed: game.rngSeed,
  }
  saveRivalry(next)
  return { memory: next }
}

/** Derives Riley's momentum for the *next* game from rivalry history — a
 * small, bounded catch-up signal (see engine/ai.ts's applyMomentum), never a
 * scripted difficulty spike. 'cold' only once the player is genuinely ahead
 * on a real streak (2+ in a row), not after a single win. */
export function rivalryMomentum(memory: RivalryMemory): RileyMomentum {
  if (memory.streakOwner === 'player' && memory.streak >= 2) return 'cold'
  if (memory.streakOwner === 'riley' && memory.streak >= 2) return 'hot'
  return 'even'
}

// Keyed by who currently holds the streak — Riley's own reaction to it, not
// a description of it. Indexed by streak length (capped at the table size)
// so a longer streak escalates the flavor without needing unbounded content.
const STREAK_LINES: Record<'player' | 'riley', string[]> = {
  player: [
    "Riley's studying your last run a little closer than usual.",
    'Riley mutters, "Lucky streak. Won\'t last."',
    "Riley isn't saying much before this one.",
  ],
  riley: [
    'Riley tips their hat: "Same time next week?"',
    'Riley\'s feeling good about today.',
    'Riley: "You\'re not catching up like this."',
  ],
}

/** A single flavor line reacting to rivalry history — deterministic given
 * memory, no dice roll involved. Returns null when there's no history yet
 * worth commenting on. */
export function rivalryLine(memory: RivalryMemory): string | null {
  if (memory.gamesPlayed === 0) return null
  if (memory.streakOwner && memory.streak >= 2) {
    const lines = STREAK_LINES[memory.streakOwner]
    return lines[Math.min(memory.streak - 2, lines.length - 1)]
  }
  return `You and Riley are ${memory.playerWins}-${memory.rileyWins} lifetime.`
}
