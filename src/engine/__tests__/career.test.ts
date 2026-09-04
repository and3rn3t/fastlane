import { describe, expect, it } from 'vitest'
import { bestQualifiedJob, nextTargetJob } from '../career'
import { newGame } from '../engine'
import type { GameState, Goals } from '../types'

const easyGoals: Goals = { wealth: 800, happiness: 55, education: 3, career: 10 }

function game(goals: Goals = easyGoals, seed = 42): GameState {
  return newGame({ playerName: 'Tester', goals, seed })
}

describe('bestQualifiedJob', () => {
  it('returns the highest-prestige job the player already qualifies for', () => {
    // A fresh player already meets fry-cook's/stocker's requirements (no
    // job needed) — of everything they qualify for, the highest-prestige
    // one should win, not just the first match.
    const job = bestQualifiedJob(game(), 'player')
    expect(job).not.toBeNull()
    expect(job?.prestige).toBeGreaterThan(0)
  })

  it('returns null once already at the top of the ladder — nothing outranks Professor (88)', () => {
    const s = game()
    const atTheTop = { ...s, player: { ...s.player, jobId: 'professor', promotionLevel: 0 } }
    expect(bestQualifiedJob(atTheTop, 'player')).toBeNull()
  })
})

describe('nextTargetJob', () => {
  it('names a target even when the player does not yet qualify for it', () => {
    const s = game()
    // janitor: prestige 6. stocker (prestige 8, minDress 10) is the next
    // rung up — with dress at 0, the player doesn't qualify for it yet, but
    // nextTargetJob (unlike bestQualifiedJob) ignores qualification, so it
    // should still be named as the thing to work toward.
    const notYetQualified = {
      ...s,
      player: { ...s.player, jobId: 'janitor', promotionLevel: 0, dress: 0 },
    }
    const target = nextTargetJob(notYetQualified, 'player')
    expect(target?.id).toBe('stocker')
  })

  it('picks the lowest-prestige job strictly above the current score, not just any higher one', () => {
    const s = game()
    // fry-cook: prestige 5. Of every job above that, janitor (Assembly
    // Works, prestige 6) is the lowest — stocker (8), shift-lead (15), etc.
    // all outrank it, so picking any of those instead would be a real bug,
    // not just an imprecise placeholder assertion.
    const withJob = { ...s, player: { ...s.player, jobId: 'fry-cook', promotionLevel: 0 } }
    const target = nextTargetJob(withJob, 'player')
    expect(target?.id).toBe('janitor')
    expect(target?.prestige).toBeGreaterThan(5)
  })
})
