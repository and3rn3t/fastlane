// Lifetime stats + achievements, persisted in localStorage independently of
// any single save — they survive "Play again" and starting a fresh game.
// Achievement conditions are computed from a completed game's own log/state
// rather than tracked as new PlayerState fields, since state.log already
// holds every action for the whole game and never gets trimmed — that keeps
// this feature entirely out of the save-schema migration chain.

import { WEALTH_TARGETS, type GameState } from '@/engine'

export interface Achievement {
  id: string
  name: string
  description: string
  check: (game: GameState) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-win',
    name: 'First Win',
    description: 'Beat Riley to all four goals.',
    check: (g) => g.winner === 'player',
  },
  {
    id: 'debt-free',
    name: 'Debt-Free',
    description: 'Win without ever taking out a loan.',
    check: (g) =>
      g.winner === 'player' &&
      !g.log.some((e) => e.actor === 'player' && e.text.startsWith('Took out a $')),
  },
  {
    id: 'down-but-not-out',
    name: 'Down But Not Out',
    description: 'Win after being evicted twice.',
    check: (g) =>
      g.winner === 'player' &&
      g.log.filter((e) => e.actor === 'player' && e.text.includes('was evicted for unpaid rent'))
        .length >= 2,
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    description: 'Win after playing the casino at least once.',
    check: (g) =>
      g.winner === 'player' && g.log.some((e) => e.actor === 'player' && e.text.includes('wheel')),
  },
  {
    id: 'ivy-league',
    name: 'Ivy League',
    description: 'Win with at least 20 classes completed.',
    check: (g) => g.winner === 'player' && g.player.education >= 20,
  },
  {
    id: 'marathon-winner',
    name: 'Marathon Winner',
    description: 'Win a Marathon-difficulty game.',
    check: (g) => g.winner === 'player' && g.goals.wealth >= WEALTH_TARGETS[6],
  },
]

export type IncidentKind = 'layoffs' | 'thefts' | 'evictions' | 'robberies' | 'garnishments'

// Same phrases WeekReportModal.tsx flags as "notable" — the random negative
// events players most want a running count of across games.
const INCIDENT_PATTERNS: Record<IncidentKind, string> = {
  layoffs: 'was laid off',
  thefts: 'was stolen',
  evictions: 'was evicted',
  robberies: 'was robbed of',
  garnishments: 'wages are being garnished',
}

export interface LifetimeStats {
  gamesPlayed: number
  gamesWon: number
  gamesLost: number
  /** Fewest weeks to a win, across every completed game. */
  fastestWinWeeks: number | null
  unlockedAchievements: string[]
  /** Dedupe key — the rngSeed of the last game recordGameResult() saw. */
  lastRecordedSeed: number | null
  /** Lifetime counts of random negative events, for spotting patterns across games. */
  incidents: Record<IncidentKind, number>
}

const STATS_KEY = 'fastlane-stats-v1'

const DEFAULT_STATS: LifetimeStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  fastestWinWeeks: null,
  unlockedAchievements: [],
  lastRecordedSeed: null,
  incidents: { layoffs: 0, thefts: 0, evictions: 0, robberies: 0, garnishments: 0 },
}

export function loadStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return DEFAULT_STATS
    return { ...DEFAULT_STATS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATS
  }
}

function saveStats(stats: LifetimeStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // Storage full or blocked — stats just won't persist this time.
  }
}

/**
 * Records a completed game's outcome into lifetime stats and unlocks any
 * newly-earned achievements. Safe to call more than once for the same game
 * (e.g. React StrictMode's double effect invocation in dev) — dedupes on
 * the game's own rngSeed, which is random per game.
 */
export function recordGameResult(game: GameState): {
  stats: LifetimeStats
  newlyUnlocked: Achievement[]
} {
  const stats = loadStats()
  if (stats.lastRecordedSeed === game.rngSeed) {
    return { stats, newlyUnlocked: [] }
  }

  const playerWon = game.winner === 'player'
  const weeksPlayed = game.week - 1
  const playerLog = game.log.filter((e) => e.actor === 'player')
  const incidents = { ...stats.incidents }
  for (const kind of Object.keys(INCIDENT_PATTERNS) as IncidentKind[]) {
    const pattern = INCIDENT_PATTERNS[kind]
    incidents[kind] += playerLog.filter((e) => e.text.includes(pattern)).length
  }
  const next: LifetimeStats = {
    ...stats,
    gamesPlayed: stats.gamesPlayed + 1,
    gamesWon: stats.gamesWon + (playerWon ? 1 : 0),
    gamesLost: stats.gamesLost + (playerWon ? 0 : 1),
    fastestWinWeeks: playerWon
      ? Math.min(stats.fastestWinWeeks ?? Infinity, weeksPlayed)
      : stats.fastestWinWeeks,
    lastRecordedSeed: game.rngSeed,
    unlockedAchievements: [...stats.unlockedAchievements],
    incidents,
  }

  const newlyUnlocked: Achievement[] = []
  for (const achievement of ACHIEVEMENTS) {
    if (!next.unlockedAchievements.includes(achievement.id) && achievement.check(game)) {
      next.unlockedAchievements.push(achievement.id)
      newlyUnlocked.push(achievement)
    }
  }

  saveStats(next)
  return { stats: next, newlyUnlocked }
}
