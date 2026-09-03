import { describe, expect, it } from 'vitest'
import { AI_PROFILES, applyMomentum, previewNextAction } from '../ai'
import { newGame } from '../engine'
import type { Goals } from '../types'

const easyGoals: Goals = { wealth: 800, happiness: 55, education: 3, career: 10 }

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

describe('previewNextAction', () => {
  it('returns null once time is spent for the week', () => {
    const state = newGame({ playerName: 'T', goals: easyGoals, seed: 1 })
    state.player.timeLeft = 0
    expect(previewNextAction(state, 'player')).toBeNull()
  })

  it('flags food for a fresh player (hungry, cash to spare, nothing else blocking)', () => {
    const state = newGame({ playerName: 'T', goals: easyGoals, seed: 1 })
    expect(previewNextAction(state, 'player')).toBe('food')
  })

  it('never mutates the real state — only a throwaway clone is touched', () => {
    const state = newGame({ playerName: 'T', goals: easyGoals, seed: 1 })
    const before = JSON.parse(JSON.stringify(state))
    previewNextAction(state, 'player')
    expect(state).toEqual(before)
  })

  it('works for either player key', () => {
    const state = newGame({ playerName: 'T', goals: easyGoals, seed: 1 })
    expect(previewNextAction(state, 'riley')).toBe('food')
  })
})
