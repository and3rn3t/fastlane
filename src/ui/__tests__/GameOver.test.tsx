import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newGame, type GameState } from '@/engine'
import { GameProvider } from '@/state/GameContext'
import { GameOver } from '@/ui/GameOver'
import { loadStats } from '@/stats'

function completedGame(overrides: Partial<GameState> = {}): GameState {
  const goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
  const g = newGame({ playerName: 'Tester', goals, seed: 99 })
  return { ...g, phase: 'over', winner: 'player', week: 10, ...overrides }
}

describe('GameOver achievements', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('shows newly unlocked achievements and records them to lifetime stats', () => {
    const g = completedGame({
      player: { ...completedGame().player, education: 25 },
    })
    render(
      <GameProvider>
        <GameOver game={g} />
      </GameProvider>
    )

    expect(screen.getAllByText(/Achievement unlocked/)).toHaveLength(3)
    expect(screen.getByText('First Win')).toBeTruthy()
    expect(screen.getByText('Debt-Free')).toBeTruthy()
    expect(screen.getByText('Ivy League')).toBeTruthy()

    const stats = loadStats()
    expect(stats.gamesPlayed).toBe(1)
    expect(stats.gamesWon).toBe(1)
    expect(stats.unlockedAchievements).toContain('first-win')
    expect(stats.unlockedAchievements).toContain('ivy-league')
  })

  it('shows no achievement banner on a loss, but still records the loss', () => {
    const g = completedGame({ winner: 'riley' })
    render(
      <GameProvider>
        <GameOver game={g} />
      </GameProvider>
    )

    expect(screen.queryByText(/Achievement unlocked/)).toBeNull()
    const stats = loadStats()
    expect(stats.gamesPlayed).toBe(1)
    expect(stats.gamesLost).toBe(1)
  })

  it('survives StrictMode double-invoking the recording effect', () => {
    // Regression test for a real bug: StrictMode (main.tsx wraps the whole
    // app in it) double-invokes effects in dev, so recordGameResult() —
    // which dedupes on rngSeed — was getting called twice per mount. The
    // second call correctly saw the seed already recorded and returned an
    // empty "newly unlocked" list, which then overwrote the first, correct
    // one in component state — the achievement banner never rendered.
    const g = completedGame({
      player: { ...completedGame().player, education: 25 },
    })
    render(
      <StrictMode>
        <GameProvider>
          <GameOver game={g} />
        </GameProvider>
      </StrictMode>
    )

    expect(screen.getByText('Ivy League')).toBeTruthy()
    const stats = loadStats()
    expect(stats.gamesPlayed).toBe(1) // not double-counted
    expect(stats.unlockedAchievements).toContain('ivy-league')
  })
})
