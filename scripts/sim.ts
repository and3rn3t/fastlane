// Baseline balance simulation harness — runs N headless AI-vs-AI games (both
// player and Riley driven by the same ai.ts policy, via runAIWeek) and
// reports win rate and weeks-to-win. Establishes today's baseline before
// Health, Loans, Promotions, etc. start changing the economy; rerun after
// each Wave 2 item lands to catch a balance regression here, not in a
// player's actual game.
//
// Usage: pnpm sim [gameCount]   (default 200)

import { applyAction, newGame, runAIWeek, type GameState, type Goals } from '../src/engine/index.ts'

// The StartScreen "Standard" preset (level 4 of 10) — the default a new
// player would actually pick, so the baseline reflects real play.
const STANDARD_GOALS: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
const MAX_WEEKS = 60

interface SimResult {
  winner: 'player' | 'riley' | 'none'
  weeks: number
}

function runOneGame(seed: number): SimResult {
  let state: GameState = newGame({ playerName: 'Sim', goals: STANDARD_GOALS, seed })

  for (let i = 0; i < MAX_WEEKS; i++) {
    // Player side runs the same AI policy Riley uses — an even AI-vs-AI
    // matchup is what makes the win rate a meaningful balance signal.
    runAIWeek(state, 'player')
    state = applyAction(state, { type: 'endWeek' })
    if (state.phase === 'over') {
      return { winner: state.winner ?? 'none', weeks: state.week - 1 }
    }
    state = applyAction(state, { type: 'dismissReport' })
  }
  return { winner: 'none', weeks: MAX_WEEKS }
}

function average(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

function main() {
  const gameCount = Number(process.argv[2]) || 200
  const results: SimResult[] = []
  for (let seed = 0; seed < gameCount; seed++) {
    results.push(runOneGame(seed))
  }

  const playerWins = results.filter((r) => r.winner === 'player')
  const rileyWins = results.filter((r) => r.winner === 'riley')
  const noWinner = results.filter((r) => r.winner === 'none')

  const pct = (n: number) => `${((n / gameCount) * 100).toFixed(1)}%`

  console.log(`\nFast Lane balance simulation — ${gameCount} games, Standard goals, AI vs AI\n`)
  console.log(`Player win rate:  ${pct(playerWins.length)} (${playerWins.length}/${gameCount})`)
  console.log(`Riley win rate:   ${pct(rileyWins.length)} (${rileyWins.length}/${gameCount})`)
  console.log(
    `No winner by W${MAX_WEEKS}: ${pct(noWinner.length)} (${noWinner.length}/${gameCount})`
  )
  console.log(`\nAvg weeks to win — player: ${average(playerWins.map((r) => r.weeks)).toFixed(1)}`)
  console.log(`Avg weeks to win — riley:  ${average(rileyWins.map((r) => r.weeks)).toFixed(1)}`)
  console.log(
    `Avg weeks to win — overall: ${average(
      results.filter((r) => r.winner !== 'none').map((r) => r.weeks)
    ).toFixed(1)}\n`
  )

  if (noWinner.length / gameCount > 0.1) {
    console.warn(
      `⚠ More than 10% of games hit the ${MAX_WEEKS}-week cap with no winner — that's worth a look.`
    )
  }
}

main()
