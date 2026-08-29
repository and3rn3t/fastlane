// Daily challenge: a same-for-everyone game derived from today's calendar
// date (local time) — same seed, same goals, same rules, same Riley
// profile, so the only variable left is player skill. The deterministic
// engine (all randomness flows through rng.ts's seeded PRNG) makes this
// nearly free — no server, no scheduling, just a date → seed function.

import {
  CAREER_TARGETS,
  EDUCATION_TARGETS,
  goalProgress,
  HAPPINESS_TARGETS,
  RULE_PRESETS,
  WEALTH_TARGETS,
  type Goals,
  type GameState,
  type NewGameOptions,
} from '@/engine'

// Day 1 is the day this feature shipped — everything before is day 0 or
// earlier and never actually offered a Daily Challenge button.
const EPOCH = new Date(2026, 7, 28) // months are 0-indexed: 7 = August

function daysSinceEpoch(date: Date): number {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((midnight.getTime() - EPOCH.getTime()) / 86_400_000)
}

/** The 1-indexed daily challenge number shown to players ("Daily #N"). */
export function dailyChallengeNumber(date: Date = new Date()): number {
  return daysSinceEpoch(date) + 1
}

/** Same calendar day (local time) → same seed, everywhere. */
export function dailyChallengeSeed(date: Date = new Date()): number {
  return daysSinceEpoch(date)
}

// The StartScreen "Standard" preset (level 4 of 10) — a fair, familiar
// difficulty so the challenge tests play skill, not goal-slider choices.
const DAILY_GOALS: Goals = {
  wealth: WEALTH_TARGETS[3],
  happiness: HAPPINESS_TARGETS[3],
  education: EDUCATION_TARGETS[3],
  career: CAREER_TARGETS[3],
}

export function dailyChallengeOptions(playerName: string, date: Date = new Date()): NewGameOptions {
  return {
    playerName,
    goals: DAILY_GOALS,
    seed: dailyChallengeSeed(date),
    rileyProfile: 'balanced',
    rileyDifficulty: 'normal',
    rules: RULE_PRESETS.classic,
    isDailyChallenge: true,
  }
}

const GOAL_ROWS: Array<{ key: keyof Goals; emoji: string }> = [
  { key: 'wealth', emoji: '💵' },
  { key: 'happiness', emoji: '😊' },
  { key: 'education', emoji: '🎓' },
  { key: 'career', emoji: '💼' },
]

/**
 * Renders a Wordle-style emoji grid summarizing a finished game — one row
 * per goal, filled squares for how far that goal got (capped at 5/5, since
 * goalProgress() itself caps at 1). Works on any completed GameState, not
 * only a real daily-challenge one.
 */
export function shareableResult(game: GameState, date: Date = new Date()): string {
  const progress = goalProgress(game.player, game.goals, game.economy.marketIndex)
  const rows = GOAL_ROWS.map((row) => {
    const filled = Math.round(progress[row.key] * 5)
    return `${row.emoji} ${'🟩'.repeat(filled)}${'⬛'.repeat(5 - filled)}`
  })
  // GameOver only ever renders on an actual win (by either side) — there's
  // no in-game "ran out of time" state, so the only other case is Riley won.
  const outcome =
    game.winner === 'player' ? `Won in ${game.week - 1} weeks 🏆` : 'Riley got there first 🎩'
  return [`Fast Lane Daily #${dailyChallengeNumber(date)} — ${outcome}`, ...rows].join('\n')
}
