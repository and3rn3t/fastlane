// Pure career-ladder queries, hoisted out of ai.ts so the UI can reach them
// directly instead of reimplementing the same "what job should I take"
// heuristic a second time — same reuse principle as Wave 11's hint bar
// (previewNextAction), one source of truth Riley's AI and the player-facing
// nudge both read from, so the two can never disagree.

import { qualifiesFor } from './actions'
import { JOBS } from './data'
import { careerScore } from './week'
import type { GameState, JobDef, PlayerKey } from './types'

/** The highest-prestige job above the player's current career score that
 * they already qualify for right now — a "free" upgrade needing no further
 * prep (no purchase, no class, just applying). `null` if there isn't one. */
export function bestQualifiedJob(state: GameState, key: PlayerKey): JobDef | null {
  const p = state[key]
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current && qualifiesFor(p, j.id).ok).sort(
    (a, b) => b.prestige - a.prestige
  )
  return candidates[0] ?? null
}

/** The job to work toward next: lowest-prestige job above the player's
 * current career score, regardless of whether they currently qualify for
 * it — the next rung to prep for, not a free upgrade. */
export function nextTargetJob(state: GameState, key: PlayerKey): JobDef | null {
  const p = state[key]
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current).sort(
    (a, b) => a.prestige - b.prestige
  )
  return candidates[0] ?? null
}
