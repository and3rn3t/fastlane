import { describe, expect, it } from 'vitest'
import { crossedGoal, parseGameCount, type GoalKey } from '../sim.ts'

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
