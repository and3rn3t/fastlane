import { describe, expect, it } from 'vitest'
import { AI_PROFILES, applyMomentum } from '../ai'

describe('applyMomentum', () => {
  it('leaves the profile unchanged for hot and even momentum', () => {
    expect(applyMomentum(AI_PROFILES.balanced, 'hot')).toBe(AI_PROFILES.balanced)
    expect(applyMomentum(AI_PROFILES.balanced, 'even')).toBe(AI_PROFILES.balanced)
  })

  it('scales goalWeights and gambleFactor by a small, bounded amount when cold', () => {
    const base = AI_PROFILES.hustler
    const biased = applyMomentum(base, 'cold')
    for (const goal of Object.keys(base.goalWeights) as Array<keyof typeof base.goalWeights>) {
      expect(biased.goalWeights[goal]).toBeCloseTo(base.goalWeights[goal] * 1.15)
    }
    expect(biased.gambleFactor).toBeCloseTo(base.gambleFactor * 1.15)
    // Bounded — never more than a 20% swing, so it's a nudge, not a rewrite.
    for (const goal of Object.keys(base.goalWeights) as Array<keyof typeof base.goalWeights>) {
      expect(biased.goalWeights[goal] / base.goalWeights[goal]).toBeLessThan(1.2)
    }
  })

  it('does not mutate the source profile', () => {
    const base = { ...AI_PROFILES.balanced, goalWeights: { ...AI_PROFILES.balanced.goalWeights } }
    applyMomentum(base, 'cold')
    expect(base.goalWeights).toEqual(AI_PROFILES.balanced.goalWeights)
  })
})
