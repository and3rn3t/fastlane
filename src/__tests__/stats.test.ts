import { beforeEach, describe, expect, it } from 'vitest'
import { newGame, type GameState, type Goals } from '@/engine'
import { ACHIEVEMENTS, loadStats, recordGameResult } from '../stats'

const goals: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }

function findAchievement(id: string) {
  const a = ACHIEVEMENTS.find((x) => x.id === id)
  if (!a) throw new Error(`Unknown achievement: ${id}`)
  return a
}

function game(seed: number, overrides: Partial<GameState> = {}): GameState {
  const g = newGame({ playerName: 'Tester', goals, seed })
  return { ...g, phase: 'over', week: 10, ...overrides }
}

describe('stats', () => {
  beforeEach(() => localStorage.clear())

  it('loadStats returns zeroed defaults when nothing has been recorded', () => {
    const stats = loadStats()
    expect(stats.gamesPlayed).toBe(0)
    expect(stats.gamesWon).toBe(0)
    expect(stats.fastestWinWeeks).toBeNull()
    expect(stats.unlockedAchievements).toEqual([])
    expect(stats.incidents).toEqual({
      layoffs: 0,
      thefts: 0,
      evictions: 0,
      robberies: 0,
      garnishments: 0,
    })
  })

  it("accumulates incident counts across games, from the player's own log entries only", () => {
    recordGameResult(
      game(1, {
        winner: 'riley',
        log: [
          { week: 2, actor: 'player', text: 'You was laid off from Barista!' },
          { week: 3, actor: 'player', text: "You's Refrigerator was stolen!" },
          { week: 4, actor: 'riley', text: 'Riley was laid off from Clerk!' },
        ],
      })
    )
    const { stats } = recordGameResult(
      game(2, {
        winner: 'riley',
        log: [{ week: 5, actor: 'player', text: 'You was laid off from Barista!' }],
      })
    )
    expect(stats.incidents.layoffs).toBe(2)
    expect(stats.incidents.thefts).toBe(1)
    expect(stats.incidents.evictions).toBe(0)
  })

  it('records a win, a loss, and the fastest win across games', () => {
    recordGameResult(game(1, { winner: 'player', week: 15 }))
    recordGameResult(game(2, { winner: 'riley', week: 20 }))
    const { stats } = recordGameResult(game(3, { winner: 'player', week: 8 }))
    expect(stats.gamesPlayed).toBe(3)
    expect(stats.gamesWon).toBe(2)
    expect(stats.gamesLost).toBe(1)
    expect(stats.fastestWinWeeks).toBe(7) // week 8 → 7 weeks played
  })

  it('dedupes on rngSeed — recording the same completed game twice only counts once', () => {
    const g = game(42, { winner: 'player' })
    recordGameResult(g)
    const { stats } = recordGameResult(g)
    expect(stats.gamesPlayed).toBe(1)
  })

  it('unlocks First Win only on a player win', () => {
    const a = findAchievement('first-win')
    expect(a.check(game(1, { winner: 'player' }))).toBe(true)
    expect(a.check(game(1, { winner: 'riley' }))).toBe(false)
  })

  it('unlocks Debt-Free only when the player never took a loan', () => {
    const a = findAchievement('debt-free')
    const clean = game(1, { winner: 'player' })
    expect(a.check(clean)).toBe(true)

    const withLoan = game(1, {
      winner: 'player',
      log: [{ week: 1, actor: 'player', text: 'Took out a $300 loan' }],
    })
    expect(a.check(withLoan)).toBe(false)
  })

  it('unlocks Down But Not Out only after two player evictions in a win', () => {
    const a = findAchievement('down-but-not-out')
    const onceEvicted = game(1, {
      winner: 'player',
      log: [{ week: 1, actor: 'player', text: 'You was evicted for unpaid rent!' }],
    })
    expect(a.check(onceEvicted)).toBe(false)

    const twiceEvicted = game(1, {
      winner: 'player',
      log: [
        { week: 1, actor: 'player', text: 'You was evicted for unpaid rent!' },
        { week: 5, actor: 'player', text: 'You was evicted for unpaid rent!' },
      ],
    })
    expect(a.check(twiceEvicted)).toBe(true)

    // Riley getting evicted twice shouldn't count toward the player's achievement.
    const rileyEvicted = game(1, {
      winner: 'player',
      log: [
        { week: 1, actor: 'riley', text: 'Riley was evicted for unpaid rent!' },
        { week: 5, actor: 'riley', text: 'Riley was evicted for unpaid rent!' },
      ],
    })
    expect(a.check(rileyEvicted)).toBe(false)
  })

  it('unlocks High Roller only after a player casino play in a win', () => {
    const a = findAchievement('high-roller')
    expect(a.check(game(1, { winner: 'player' }))).toBe(false)
    const gambled = game(1, {
      winner: 'player',
      log: [{ week: 1, actor: 'player', text: 'You lost $50 at the wheel' }],
    })
    expect(a.check(gambled)).toBe(true)
  })

  it('unlocks Ivy League at 20+ education in a win', () => {
    const a = findAchievement('ivy-league')
    const base = game(1, { winner: 'player' })
    expect(a.check({ ...base, player: { ...base.player, education: 19 } })).toBe(false)
    expect(a.check({ ...base, player: { ...base.player, education: 20 } })).toBe(true)
  })

  it('unlocks Marathon Winner only for a high enough wealth goal in a win', () => {
    const a = findAchievement('marathon-winner')
    expect(a.check(game(1, { winner: 'player', goals: { ...goals, wealth: 4000 } }))).toBe(false)
    expect(a.check(game(1, { winner: 'player', goals: { ...goals, wealth: 11500 } }))).toBe(true)
  })
})
