import { describe, expect, it } from 'vitest'
import type { LifetimeStats } from '../stats'
import { HEAD_START_BONUS, legacyCashBonus, legacyPawnGlyph } from '../legacy'

function stats(overrides: Partial<LifetimeStats> = {}): LifetimeStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    fastestWinWeeks: null,
    unlockedAchievements: [],
    lastRecordedSeed: null,
    incidents: { layoffs: 0, thefts: 0, evictions: 0, robberies: 0, garnishments: 0 },
    ...overrides,
  }
}

describe('legacy', () => {
  it('grants no bonus and the default pawn before any perk unlocks', () => {
    expect(legacyCashBonus(stats())).toBe(0)
    expect(legacyPawnGlyph(stats())).toBe('🙂')
  })

  it('Head Start unlocks at 3 games played, regardless of outcome', () => {
    expect(legacyCashBonus(stats({ gamesPlayed: 2 }))).toBe(0)
    expect(legacyCashBonus(stats({ gamesPlayed: 3 }))).toBe(HEAD_START_BONUS)
  })

  it('New Look unlocks on the first win', () => {
    expect(legacyPawnGlyph(stats({ gamesWon: 0 }))).toBe('🙂')
    expect(legacyPawnGlyph(stats({ gamesWon: 1 }))).toBe('😎')
  })
})
