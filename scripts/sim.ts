// Baseline balance simulation harness — runs N headless AI-vs-AI games (both
// player and Riley driven by the same ai.ts policy, via runAIWeek) and
// reports win rate and weeks-to-win. Establishes today's baseline before
// Health, Loans, Promotions, etc. start changing the economy; rerun after
// each Wave 2 item lands to catch a balance regression here, not in a
// player's actual game.
//
// Usage: pnpm sim [gameCount] [rileyProfile]   (default 200, balanced)
//   rileyProfile: balanced | hustler | scholar | gambler — the player side
//   always runs Balanced, so this measures how each Riley profile fares
//   against a standard opponent ("AI-vs-AI sim test per profile").

import {
  AI_PROFILES,
  applyAction,
  newGame,
  runAIWeek,
  type AiProfileName,
  type GameState,
  type Goals,
} from '../src/engine/index.ts'

// The StartScreen "Standard" preset (level 4 of 10) — the default a new
// player would actually pick, so the baseline reflects real play.
const STANDARD_GOALS: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
const MAX_WEEKS = 60

interface SimResult {
  winner: 'player' | 'riley' | 'none'
  weeks: number
  // Phase 2 system usage, read off Riley's final state — a stable win rate
  // with these all at zero would mean the AI integration silently failed
  // even though the top-line numbers look fine. See main()'s report.
  rileyMaxSkill: number
  rileyTotalSkill: number
  rileyInvestmentValue: number
  rileyLayoffs: number
  rileyInheritances: number
}

function runOneGame(seed: number, rileyProfile: AiProfileName): SimResult {
  // Riley's profile lives on GameState itself — endWeek's 'endWeek' case
  // reads state.rileyProfile and looks up the matching AiProfile, so setting
  // it here is all runAIWeek('riley', ...) inside applyAction needs.
  let state: GameState = newGame({ playerName: 'Sim', goals: STANDARD_GOALS, seed, rileyProfile })

  for (let i = 0; i < MAX_WEEKS; i++) {
    // Player side always runs Balanced — a fixed opponent is what makes the
    // win rate a meaningful signal for whatever Riley profile is under test.
    runAIWeek(state, 'player', AI_PROFILES.balanced)
    state = applyAction(state, { type: 'endWeek' })
    if (state.phase === 'over') {
      return { winner: state.winner ?? 'none', weeks: state.week - 1, ...rileySystemUsage(state) }
    }
    state = applyAction(state, { type: 'dismissReport' })
  }
  return { winner: 'none', weeks: MAX_WEEKS, ...rileySystemUsage(state) }
}

function rileySystemUsage(
  state: GameState
): Pick<
  SimResult,
  | 'rileyMaxSkill'
  | 'rileyTotalSkill'
  | 'rileyInvestmentValue'
  | 'rileyLayoffs'
  | 'rileyInheritances'
> {
  const skills = Object.values(state.riley.skills)
  const rileyLog = state.log.filter((e) => e.actor === 'riley')
  return {
    rileyMaxSkill: Math.max(...skills),
    rileyTotalSkill: skills.reduce((a, b) => a + b, 0),
    rileyInvestmentValue: Math.round(state.riley.investments * state.economy.marketIndex),
    rileyLayoffs: rileyLog.filter((e) => e.text.includes('was laid off')).length,
    rileyInheritances: rileyLog.filter((e) => e.text.includes('inheritance came through')).length,
  }
}

function average(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

function main() {
  const gameCount = Number(process.argv[2]) || 200
  const profileArg = process.argv[3]
  const rileyProfile: AiProfileName =
    profileArg && profileArg in AI_PROFILES ? (profileArg as AiProfileName) : 'balanced'
  if (profileArg && !(profileArg in AI_PROFILES)) {
    console.warn(`⚠ Unknown profile "${profileArg}" — falling back to balanced.`)
  }

  const results: SimResult[] = []
  for (let seed = 0; seed < gameCount; seed++) {
    results.push(runOneGame(seed, rileyProfile))
  }

  const playerWins = results.filter((r) => r.winner === 'player')
  const rileyWins = results.filter((r) => r.winner === 'riley')
  const noWinner = results.filter((r) => r.winner === 'none')

  const pct = (n: number) => `${((n / gameCount) * 100).toFixed(1)}%`

  console.log(
    `\nFast Lane balance simulation — ${gameCount} games, Standard goals, AI vs AI ` +
      `(Riley: ${AI_PROFILES[rileyProfile].name})\n`
  )
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

  // Usage, not outcome: a stable win rate above with zero skill/investment/
  // chain activity would mean the AI integration silently regressed even
  // though the top-line numbers still look fine.
  const gamesWithSkillGain = results.filter((r) => r.rileyMaxSkill > 0).length
  const gamesWithInvestments = results.filter((r) => r.rileyInvestmentValue > 0).length
  console.log(`Riley system usage (this profile):`)
  console.log(
    `  Skills — any gain: ${pct(gamesWithSkillGain)}, avg max: ${average(results.map((r) => r.rileyMaxSkill)).toFixed(1)}, avg total: ${average(results.map((r) => r.rileyTotalSkill)).toFixed(1)}`
  )
  console.log(
    `  Investments — held at game end: ${pct(gamesWithInvestments)}, avg value: $${average(results.map((r) => r.rileyInvestmentValue)).toFixed(0)}`
  )
  console.log(
    `  Event chains — avg layoffs: ${average(results.map((r) => r.rileyLayoffs)).toFixed(2)}, avg inheritances: ${average(results.map((r) => r.rileyInheritances)).toFixed(2)}`
  )
}

main()
