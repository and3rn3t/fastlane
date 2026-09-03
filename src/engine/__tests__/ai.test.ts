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

  // Regression for a real Copilot review finding: pursueCareer() has 5
  // different success paths (apply for a job, buy an outfit, buy a
  // computer, take a class, train a skill) — reporting the generic
  // 'career' tag for all of them would tell the hint bar to say "check the
  // Job Board" even when the actual action was clearing a blocker
  // elsewhere. These two prove the tags actually differ by which branch fires.
  function survivalSatisfied(state: ReturnType<typeof newGame>) {
    state.player.apartment = 'basic'
    state.player.fed = 6
    state.player.groceries = 10
    state.player.health = 100
    state.player.cash = 500
  }

  it('reports "career" when actually applying for an already-qualified job', () => {
    const state = newGame({ playerName: 'T', goals: easyGoals, seed: 1 })
    survivalSatisfied(state)
    // Default dress (20) already clears Fry Cook's minDress (10) — Riley
    // qualifies immediately, so pursueCareer takes the "apply" branch.
    expect(previewNextAction(state, 'player')).toBe('career')
  })

  it('reports "career-prep" (not "career") when clearing a job-qualification blocker instead', () => {
    const state = newGame({ playerName: 'T', goals: easyGoals, seed: 1 })
    survivalSatisfied(state)
    // Janitor (prestige 6, minDress 0) is the only job with no dress floor —
    // a dress-0 fresh player always instantly qualifies for it, which would
    // make bestQualifiedJob find it and take the "apply" branch instead of
    // the one this test wants to exercise. Already holding it (careerScore
    // 6) excludes it from bestQualifiedJob's "prestige > current" filter, so
    // the next real target (Stocker, prestige 8, minDress 10) is genuinely
    // blocked by dress 0 — forcing the blocker-clearing branch.
    state.player.jobId = 'janitor'
    state.player.dress = 0
    expect(previewNextAction(state, 'player')).toBe('career-prep')
  })
})
