import { describe, expect, it } from 'vitest'
import {
  combineLocationActions,
  crossedGoal,
  flagStallOutlier,
  parseGameCount,
  type BatchSummary,
  type GoalKey,
  type StallKeyStats,
} from '../sim.ts'
import { LOCATIONS, type LocationId } from '../../src/engine/index.ts'

function emptyLocationRecord(): Record<LocationId, number> {
  const record = {} as Record<LocationId, number>
  for (const id of Object.keys(LOCATIONS) as LocationId[]) record[id] = 0
  return record
}

function stall(longStallGamePct: number): StallKeyStats {
  return { totalWeeks: 0, avgWeeksPerGame: 0, longStallGamePct }
}

// Only stallBreakdown/locationActions vary across the tests below — every
// other field is dead weight flagStallOutlier/combineLocationActions never
// read, filled with inert defaults so the fixture still type-checks as a
// real BatchSummary.
function emptyBatch(
  overrides: Partial<Pick<BatchSummary, 'stallBreakdown' | 'locationActions'>> = {}
): BatchSummary {
  return {
    gameCount: 100,
    results: [],
    playerWinPct: 50,
    rileyWinPct: 50,
    noWinnerPct: 0,
    avgWeeksOverall: null,
    weeksP10: null,
    weeksP50: null,
    weeksP90: null,
    goalBreakdown: {
      player: { wealth: 0, happiness: 0, education: 0, career: 0 },
      riley: { wealth: 0, happiness: 0, education: 0, career: 0 },
    },
    stallBreakdown: { player: {}, riley: {} },
    locationActions: { player: emptyLocationRecord(), riley: emptyLocationRecord() },
    ...overrides,
  }
}

function progress(overrides: Partial<Record<GoalKey, number>>): Record<GoalKey, number> {
  return {
    wealth: 1,
    happiness: 1,
    education: 1,
    career: 1,
    ...overrides,
  }
}

describe('crossedGoal', () => {
  it('returns null when no goal crosses (already-met goals stay excluded)', () => {
    // wealth was already below 1 both before and after — never crosses, so
    // it must not be picked even though it's the lowest-progress goal.
    expect(crossedGoal(progress({ wealth: 0.5 }), progress({ wealth: 0.5 }))).toBeNull()
  })

  it('ignores a goal that had already crossed in an earlier week', () => {
    // education is fully met in both snapshots (crossed before this week) —
    // an implementation that just picks the global lowest-progress goal
    // would wrongly pick wealth here even if wealth never actually crossed
    // this week; this case has wealth genuinely crossing, so the two
    // implementations agree, but exercises that an already-met goal (career
    // held steady at 1 throughout) is correctly excluded from consideration.
    const prior = progress({ wealth: 0.8, career: 1 })
    const post = progress({ wealth: 1, career: 1 })
    expect(crossedGoal(prior, post)).toBe('wealth')
  })

  it('picks the crosser with the least prior progress when several cross the same week', () => {
    // Both happiness (0.9 -> 1) and wealth (0.4 -> 1) cross this exact week —
    // wealth had the most catching up to do, so it's the reported bottleneck
    // even though happiness is alphabetically/positionally earlier in
    // GOAL_KEYS (wealth, happiness, education, career).
    const prior = progress({ wealth: 0.4, happiness: 0.9 })
    const post = progress({ wealth: 1, happiness: 1 })
    expect(crossedGoal(prior, post)).toBe('wealth')
  })

  it('is not fooled by a goal merely lagging without crossing', () => {
    // career sits at 0.2 in both snapshots (never crosses) while education
    // is the one that actually crosses (0.9 -> 1) — the lowest-progress
    // heuristic alone would wrongly pick career.
    const prior = progress({ career: 0.2, education: 0.9 })
    const post = progress({ career: 0.2, education: 1 })
    expect(crossedGoal(prior, post)).toBe('education')
  })
})

describe('parseGameCount', () => {
  it('falls back to the caller-supplied default on undefined input', () => {
    expect(parseGameCount(undefined, 100)).toBe(100)
  })

  it('falls back to the caller-supplied default on invalid input, not a hardcoded 200', () => {
    expect(parseGameCount('not-a-number', 100)).toBe(100)
    expect(parseGameCount('1.5', 100)).toBe(100)
    expect(parseGameCount('0', 100)).toBe(100)
  })

  it("defaults to 200 when no fallback is supplied, preserving pnpm sim's own default", () => {
    expect(parseGameCount(undefined)).toBe(200)
    expect(parseGameCount('bogus')).toBe(200)
  })

  it('parses a valid positive integer regardless of fallback', () => {
    expect(parseGameCount('50', 100)).toBe(50)
  })
})

describe('flagStallOutlier', () => {
  it('does not flag a requirement whose long-stall rate stays within the threshold of baseline', () => {
    const baseline = emptyBatch({ stallBreakdown: { player: { dress: stall(2) }, riley: {} } })
    const batch = emptyBatch({ stallBreakdown: { player: { dress: stall(10) }, riley: {} } })
    expect(flagStallOutlier(batch, baseline, 'test')).toEqual([])
  })

  it('flags a requirement whose long-stall rate drifts past the threshold, naming the key and label', () => {
    const baseline = emptyBatch({ stallBreakdown: { player: { dress: stall(0) }, riley: {} } })
    const batch = emptyBatch({ stallBreakdown: { player: { dress: stall(20) }, riley: {} } })
    const flags = flagStallOutlier(batch, baseline, 'hustler/brutal')
    expect(flags).toHaveLength(1)
    expect(flags[0]).toContain('dress')
    expect(flags[0]).toContain('hustler/brutal')
  })

  it('treats a key entirely absent from baseline as a 0% prior rate rather than skipping it', () => {
    // No cell has ever seen a 'skill:sales' stall before — the union of keys
    // must still include it, or a brand-new stall showing up for the first
    // time in `batch` would silently pass the guardrail.
    const baseline = emptyBatch()
    const batch = emptyBatch({
      stallBreakdown: { player: { 'skill:sales': stall(25) }, riley: {} },
    })
    expect(flagStallOutlier(batch, baseline, 'test')).toHaveLength(1)
  })
})

describe('combineLocationActions', () => {
  it('sums player and riley counts per location independently', () => {
    const player = emptyLocationRecord()
    const riley = emptyLocationRecord()
    player.casino = 3
    riley.casino = 7
    player.market = 1
    const combined = combineLocationActions({ locationActions: { player, riley } })
    expect(combined.casino).toBe(10)
    expect(combined.market).toBe(1)
    expect(combined.home).toBe(0)
  })
})
