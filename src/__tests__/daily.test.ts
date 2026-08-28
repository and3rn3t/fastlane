import { describe, expect, it } from 'vitest'
import { newGame, type GameState } from '@/engine'
import {
  dailyChallengeNumber,
  dailyChallengeOptions,
  dailyChallengeSeed,
  shareableResult,
} from '../daily'

describe('daily challenge', () => {
  it('gives the same seed and number for two moments on the same local day', () => {
    const morning = new Date(2026, 8, 1, 6, 0, 0)
    const night = new Date(2026, 8, 1, 23, 59, 0)
    expect(dailyChallengeSeed(morning)).toBe(dailyChallengeSeed(night))
    expect(dailyChallengeNumber(morning)).toBe(dailyChallengeNumber(night))
  })

  it('gives a different seed and an incrementing number on consecutive days', () => {
    const day1 = new Date(2026, 8, 1, 12, 0, 0)
    const day2 = new Date(2026, 8, 2, 12, 0, 0)
    expect(dailyChallengeSeed(day1)).not.toBe(dailyChallengeSeed(day2))
    expect(dailyChallengeNumber(day2)).toBe(dailyChallengeNumber(day1) + 1)
  })

  it('always builds fixed, comparable game options regardless of player name', () => {
    const date = new Date(2026, 8, 5)
    const a = dailyChallengeOptions('Alice', date)
    const b = dailyChallengeOptions('Bob', date)
    expect(a.seed).toBe(b.seed)
    expect(a.goals).toEqual(b.goals)
    expect(a.rileyProfile).toBe('balanced')
    expect(a.rules).toEqual(b.rules)
    expect(a.isDailyChallenge).toBe(true)
  })

  it('renders a 5-wide emoji grid per goal, filled to final progress', () => {
    const date = new Date(2026, 8, 5)
    const g = newGame(dailyChallengeOptions('Tester', date))
    const finished: GameState = {
      ...g,
      phase: 'over',
      winner: 'player',
      week: 6,
      player: { ...g.player, cash: g.goals.wealth, happiness: 0, education: 0, jobId: null },
    }
    const text = shareableResult(finished, date)
    expect(text).toContain(`Fast Lane Daily #${dailyChallengeNumber(date)}`)
    expect(text).toContain('Won in 5 weeks 🏆')
    // Wealth goal fully met → 5 filled squares; happiness at 0 → 0 filled.
    expect(text).toContain('💵 🟩🟩🟩🟩🟩')
    expect(text).toContain('😊 ⬛⬛⬛⬛⬛')
  })

  it("labels a Riley win correctly, since GameOver only shows on someone's win", () => {
    const date = new Date(2026, 8, 5)
    const g = newGame(dailyChallengeOptions('Tester', date))
    const finished: GameState = { ...g, phase: 'over', winner: 'riley', week: 20 }
    expect(shareableResult(finished, date)).toContain('Riley got there first 🎩')
  })
})
