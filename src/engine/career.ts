// Pure career-ladder queries, hoisted out of ai.ts so the UI can reach them
// directly instead of reimplementing the same "what job should I take"
// heuristic a second time — same reuse principle as Wave 11's hint bar
// (previewNextAction), one source of truth Riley's AI and the player-facing
// nudge both read from, so the two can never disagree.

import { qualifiesFor } from './actions'
import { JOBS } from './data'
import { careerScore } from './week'
import type { GameState, JobDef, PlayerKey, PlayerState, SkillId } from './types'

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

// A player's progress toward whichever of a job's minSkills they're
// furthest along on — 0 for a job with no skill gate at all. Used only to
// break ties between prestige-equal forked jobs below; picking the *best*
// matching skill (not e.g. the average) means a player who's invested in
// exactly one branch's skill reads as a clear signal toward that branch,
// not diluted by having done nothing on the other.
function bestMatchingSkillLevel(p: PlayerState, job: JobDef): number {
  if (!job.minSkills) return 0
  const skillIds = Object.keys(job.minSkills) as SkillId[]
  return Math.max(...skillIds.map((id) => p.skills[id]))
}

/** The job to work toward next: lowest-prestige job above the player's
 * current career score, regardless of whether they currently qualify for
 * it — the next rung to prep for, not a free upgrade.
 *
 * Some ladders fork (Wave 12's Branching specializations) into two-plus
 * jobs that deliberately share the same prestige — a genuine either/or
 * choice, not one "real" tier and a decoy. Plain lowest-prestige-first
 * sorting would pick whichever fork happens to sit first in `JOBS` every
 * time, silently locking Riley (and anyone reading this as "what should I
 * aim for") onto one branch regardless of their actual progress. Ties are
 * instead broken by whichever branch's skill requirement the player has
 * already invested most in — the AI shouldn't grind blindly toward an
 * arbitrary fork when their own skill history already points at one. */
export function nextTargetJob(state: GameState, key: PlayerKey): JobDef | null {
  const p = state[key]
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current)
  if (candidates.length === 0) return null
  const lowestPrestige = Math.min(...candidates.map((j) => j.prestige))
  const tied = candidates.filter((j) => j.prestige === lowestPrestige)
  if (tied.length === 1) return tied[0]
  return tied.reduce(
    (best, job) => (bestMatchingSkillLevel(p, job) > bestMatchingSkillLevel(p, best) ? job : best),
    tied[0]
  )
}
