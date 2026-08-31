import { beforeEach, describe, expect, it } from 'vitest'
import { newGame, type GameState, type Goals } from '@/engine'
import { loadRivalry, recordRivalryResult, rivalryLine, rivalryMomentum } from '../rivalry'

const goals: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }

function game(seed: number, overrides: Partial<GameState> = {}): GameState {
  const g = newGame({ playerName: 'Tester', goals, seed })
  return { ...g, phase: 'over', week: 10, ...overrides }
}

describe('rivalry', () => {
  beforeEach(() => localStorage.clear())

  it('loadRivalry returns zeroed defaults when nothing has been recorded', () => {
    const memory = loadRivalry()
    expect(memory.gamesPlayed).toBe(0)
    expect(memory.streak).toBe(0)
    expect(memory.streakOwner).toBeNull()
  })

  it('starts a streak on the first recorded win and extends it on a repeat', () => {
    recordRivalryResult(game(1, { winner: 'player' }))
    const { memory } = recordRivalryResult(game(2, { winner: 'player' }))
    expect(memory.streakOwner).toBe('player')
    expect(memory.streak).toBe(2)
    expect(memory.playerWins).toBe(2)
    expect(memory.rileyWins).toBe(0)
  })

  it('resets the streak to 1 when the other side wins', () => {
    recordRivalryResult(game(1, { winner: 'player' }))
    recordRivalryResult(game(2, { winner: 'player' }))
    const { memory } = recordRivalryResult(game(3, { winner: 'riley' }))
    expect(memory.streakOwner).toBe('riley')
    expect(memory.streak).toBe(1)
  })

  it('dedupes on rngSeed — recording the same completed game twice only counts once', () => {
    const g = game(42, { winner: 'player' })
    recordRivalryResult(g)
    const { memory } = recordRivalryResult(g)
    expect(memory.gamesPlayed).toBe(1)
  })

  it('rivalryMomentum is cold only on a real 2+ player streak', () => {
    expect(rivalryMomentum({ ...loadRivalry(), streakOwner: 'player', streak: 1 })).toBe('even')
    expect(rivalryMomentum({ ...loadRivalry(), streakOwner: 'player', streak: 2 })).toBe('cold')
    expect(rivalryMomentum({ ...loadRivalry(), streakOwner: 'riley', streak: 3 })).toBe('hot')
  })

  it('rivalryLine returns null until a game has been recorded', () => {
    expect(rivalryLine(loadRivalry())).toBeNull()
  })

  it('rivalryLine reports the lifetime tally once history exists with no active streak', () => {
    recordRivalryResult(game(1, { winner: 'player' }))
    const { memory } = recordRivalryResult(game(2, { winner: 'riley' }))
    expect(rivalryLine(memory)).toBe('You and Riley are 1-1 lifetime.')
  })
})
