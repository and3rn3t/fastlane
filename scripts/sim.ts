// Baseline balance simulation harness — runs N headless AI-vs-AI games (both
// player and Riley driven by the same ai.ts policy, via runAIWeek) and
// reports win rate and weeks-to-win. Establishes today's baseline before
// Health, Loans, Promotions, etc. start changing the economy; rerun after
// each balance-relevant item lands to catch a regression here, not in a
// player's actual game.
//
// Usage:
//   pnpm sim [gameCount] [rileyProfile] [rulesPreset]
//     rileyProfile: balanced | hustler | scholar | gambler (default balanced)
//       — the player side always runs Balanced, so this measures how each
//       Riley profile fares against a standard opponent.
//     rulesPreset:  classic | brutal | zen (default classic)
//   pnpm sim [gameCount] matrix
//     Runs every rileyProfile × rulesPreset combination (4×3 = 12 cells) and
//     reports a compact table instead of one detailed report — pass a
//     smaller gameCount than the single-cell default given how many cells
//     there are, e.g. `pnpm sim 50 matrix`.

import {
  AI_PROFILES,
  applyAction,
  newGame,
  runAIWeek,
  RULE_PRESETS,
  type AiProfileName,
  type GameState,
  type Goals,
  type RulePresetName,
} from '../src/engine/index.ts'

// The StartScreen "Standard" preset (level 4 of 10) — the default a new
// player would actually pick, so the baseline reflects real play.
const STANDARD_GOALS: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
const MAX_WEEKS = 60
const RULE_PRESET_NAMES: RulePresetName[] = ['classic', 'brutal', 'zen']
const PROFILE_NAMES: AiProfileName[] = ['balanced', 'hustler', 'scholar', 'gambler']

interface SimResult {
  winner: 'player' | 'riley' | 'none'
  weeks: number
  // Phase 2 system usage, read off Riley's final state — a stable win rate
  // with these all at zero would mean the AI integration silently failed
  // even though the top-line numbers look fine. See reportSingleCell().
  rileyMaxSkill: number
  rileyTotalSkill: number
  rileyInvestmentValue: number
  rileyLayoffs: number
  rileyInheritances: number
}

function runOneGame(
  seed: number,
  rileyProfile: AiProfileName,
  rulesPreset: RulePresetName
): SimResult {
  // Riley's profile lives on GameState itself — endWeek's 'endWeek' case
  // reads state.rileyProfile and looks up the matching AiProfile, so setting
  // it here is all runAIWeek('riley', ...) inside applyAction needs. Same
  // idea for rules: newGame() already accepts a RulesConfig (Wave 2's Rule
  // presets item) — this just finally threads a non-Classic choice through.
  let state: GameState = newGame({
    playerName: 'Sim',
    goals: STANDARD_GOALS,
    seed,
    rileyProfile,
    rules: RULE_PRESETS[rulesPreset],
  })

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

interface BatchSummary {
  gameCount: number
  results: SimResult[]
  playerWinPct: number
  rileyWinPct: number
  noWinnerPct: number
  avgWeeksOverall: number
}

function runBatch(
  gameCount: number,
  rileyProfile: AiProfileName,
  rulesPreset: RulePresetName
): BatchSummary {
  const results: SimResult[] = []
  for (let seed = 0; seed < gameCount; seed++) {
    results.push(runOneGame(seed, rileyProfile, rulesPreset))
  }
  const playerWins = results.filter((r) => r.winner === 'player').length
  const rileyWins = results.filter((r) => r.winner === 'riley').length
  const noWinner = results.filter((r) => r.winner === 'none').length
  return {
    gameCount,
    results,
    playerWinPct: (playerWins / gameCount) * 100,
    rileyWinPct: (rileyWins / gameCount) * 100,
    noWinnerPct: (noWinner / gameCount) * 100,
    avgWeeksOverall: average(results.filter((r) => r.winner !== 'none').map((r) => r.weeks)),
  }
}

function reportSingleCell(
  batch: BatchSummary,
  rileyProfile: AiProfileName,
  rulesPreset: RulePresetName
) {
  const { gameCount, results } = batch
  const pct = (n: number) => `${((n / gameCount) * 100).toFixed(1)}%`
  const playerWins = results.filter((r) => r.winner === 'player')
  const rileyWins = results.filter((r) => r.winner === 'riley')
  const noWinner = results.filter((r) => r.winner === 'none')

  console.log(
    `\nFast Lane balance simulation — ${gameCount} games, Standard goals, AI vs AI ` +
      `(Riley: ${AI_PROFILES[rileyProfile].name}, Rules: ${rulesPreset})\n`
  )
  console.log(`Player win rate:  ${pct(playerWins.length)} (${playerWins.length}/${gameCount})`)
  console.log(`Riley win rate:   ${pct(rileyWins.length)} (${rileyWins.length}/${gameCount})`)
  console.log(
    `No winner by W${MAX_WEEKS}: ${pct(noWinner.length)} (${noWinner.length}/${gameCount})`
  )
  console.log(`\nAvg weeks to win — player: ${average(playerWins.map((r) => r.weeks)).toFixed(1)}`)
  console.log(`Avg weeks to win — riley:  ${average(rileyWins.map((r) => r.weeks)).toFixed(1)}`)
  console.log(`Avg weeks to win — overall: ${batch.avgWeeksOverall.toFixed(1)}\n`)

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

// Flags an outlier cell against the Balanced/Classic baseline the same way
// Wave 9's balance note does for a new mechanic: >10 points of win-rate
// drift, or a no-winner rate above 3%, is worth a second look rather than
// silently passing.
const DRIFT_THRESHOLD_POINTS = 10
const NO_WINNER_GUARD_PCT = 3

function flagOutlier(
  batch: BatchSummary,
  baseline: BatchSummary,
  rileyProfile: AiProfileName,
  rulesPreset: RulePresetName
): string[] {
  const flags: string[] = []
  const drift = Math.abs(batch.playerWinPct - baseline.playerWinPct)
  if (drift > DRIFT_THRESHOLD_POINTS) {
    flags.push(
      `⚠ ${rileyProfile}/${rulesPreset}: player win rate drifts ${drift.toFixed(1)} points from the balanced/classic baseline (${baseline.playerWinPct.toFixed(1)}%)`
    )
  }
  if (batch.noWinnerPct > NO_WINNER_GUARD_PCT) {
    flags.push(
      `⚠ ${rileyProfile}/${rulesPreset}: ${batch.noWinnerPct.toFixed(1)}% of games hit the ${MAX_WEEKS}-week cap with no winner`
    )
  }
  return flags
}

function reportMatrix(gameCount: number) {
  console.log(
    `\nFast Lane balance matrix — ${gameCount} games/cell, Standard goals, AI vs AI, ` +
      `${PROFILE_NAMES.length}×${RULE_PRESET_NAMES.length} = ${PROFILE_NAMES.length * RULE_PRESET_NAMES.length} cells\n`
  )
  const header = 'profile     rules     player%   riley%   no-winner%   avg wks'
  console.log(header)
  console.log('-'.repeat(header.length))

  const flags: string[] = []
  const baseline = runBatch(gameCount, 'balanced', 'classic')

  for (const rulesPreset of RULE_PRESET_NAMES) {
    for (const rileyProfile of PROFILE_NAMES) {
      const batch =
        rileyProfile === 'balanced' && rulesPreset === 'classic'
          ? baseline
          : runBatch(gameCount, rileyProfile, rulesPreset)
      console.log(
        `${rileyProfile.padEnd(11)} ${rulesPreset.padEnd(9)} ${batch.playerWinPct.toFixed(1).padStart(6)}%   ${batch.rileyWinPct.toFixed(1).padStart(5)}%   ${batch.noWinnerPct.toFixed(1).padStart(9)}%   ${batch.avgWeeksOverall.toFixed(1).padStart(6)}`
      )
      flags.push(...flagOutlier(batch, baseline, rileyProfile, rulesPreset))
    }
  }

  if (flags.length > 0) {
    console.log('\nFlagged:')
    for (const f of flags) console.log(`  ${f}`)
  } else {
    console.log('\nNo cell drifted more than the guard thresholds.')
  }
}

function main() {
  const gameCount = Number(process.argv[2]) || 200
  const profileArg = process.argv[3]

  if (profileArg === 'matrix') {
    reportMatrix(gameCount)
    return
  }

  const rileyProfile: AiProfileName =
    profileArg && profileArg in AI_PROFILES ? (profileArg as AiProfileName) : 'balanced'
  if (profileArg && !(profileArg in AI_PROFILES)) {
    console.warn(`⚠ Unknown profile "${profileArg}" — falling back to balanced.`)
  }

  const rulesArg = process.argv[4]
  const rulesPreset: RulePresetName =
    rulesArg && (RULE_PRESET_NAMES as string[]).includes(rulesArg)
      ? (rulesArg as RulePresetName)
      : 'classic'
  if (rulesArg && !(RULE_PRESET_NAMES as string[]).includes(rulesArg)) {
    console.warn(`⚠ Unknown rules preset "${rulesArg}" — falling back to classic.`)
  }

  const batch = runBatch(gameCount, rileyProfile, rulesPreset)
  reportSingleCell(batch, rileyProfile, rulesPreset)
}

main()
