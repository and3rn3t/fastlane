// CI-native balance report: the full AI_PROFILES × RULE_PRESETS matrix, with
// the same percentiles + goal-breakdown detail `pnpm sim`'s single-cell mode
// prints, for every cell rather than just one — packaging the matrix, the
// percentiles, and the goal breakdown into one deterministic job, per Wave
// 13's "CI-wired balance report" item. Exits non-zero on any flagged cell so
// a real regression fails the workflow instead of scrolling past in a log
// nobody reads.
//
// Usage: pnpm sim:report [gameCount]  (default 100/cell — 12 cells, so this
// already runs 1,200 games; `pnpm sim`'s own default of 200 would mean 2,400)

import { AI_PROFILES } from '../src/engine/index.ts'
import {
  DRIFT_THRESHOLD_POINTS,
  flagOutlier,
  fmtWeeks,
  GOAL_KEYS,
  MAX_WEEKS,
  NO_WINNER_GUARD_PCT,
  parseGameCount,
  PROFILE_NAMES,
  RULE_PRESET_NAMES,
  runBatch,
  type BatchSummary,
  type GoalTally,
} from './sim.ts'

const REPORT_DEFAULT_GAME_COUNT = 100

function goalPctLine(tally: GoalTally, wins: number): string {
  if (wins === 0) return 'n/a (no wins)'
  return GOAL_KEYS.map((key) => `${key}: ${((tally[key] / wins) * 100).toFixed(0)}%`).join(', ')
}

function reportCell(
  batch: BatchSummary,
  rileyProfile: (typeof PROFILE_NAMES)[number],
  rulesPreset: (typeof RULE_PRESET_NAMES)[number]
) {
  const playerWins = batch.results.filter((r) => r.winner === 'player').length
  const rileyWins = batch.results.filter((r) => r.winner === 'riley').length

  console.log(
    `\n=== ${AI_PROFILES[rileyProfile].name} / ${rulesPreset} (${batch.gameCount} games) ===`
  )
  console.log(
    `Player: ${batch.playerWinPct.toFixed(1)}%  Riley: ${batch.rileyWinPct.toFixed(1)}%  ` +
      `No winner by W${MAX_WEEKS}: ${batch.noWinnerPct.toFixed(1)}%`
  )
  console.log(
    `Weeks to win — avg: ${fmtWeeks(batch.avgWeeksOverall)}, p10: ${fmtWeeks(batch.weeksP10)}, ` +
      `p50: ${fmtWeeks(batch.weeksP50)}, p90: ${fmtWeeks(batch.weeksP90)}`
  )
  console.log(
    `Goal breakdown — player wins: ${goalPctLine(batch.goalBreakdown.player, playerWins)}`
  )
  console.log(`                 riley wins:  ${goalPctLine(batch.goalBreakdown.riley, rileyWins)}`)
}

function main() {
  const gameCount = parseGameCount(process.argv[2], REPORT_DEFAULT_GAME_COUNT)

  console.log(
    `Fast Lane CI balance report — ${gameCount} games/cell, Standard goals, AI vs AI, ` +
      `${PROFILE_NAMES.length}×${RULE_PRESET_NAMES.length} = ${PROFILE_NAMES.length * RULE_PRESET_NAMES.length} cells`
  )
  console.log(
    `Drift thresholds: >${DRIFT_THRESHOLD_POINTS} points of player win-rate drift from the ` +
      `balanced/classic baseline, or >${NO_WINNER_GUARD_PCT}% no-winner rate.`
  )

  const baseline = runBatch(gameCount, 'balanced', 'classic')
  const flags: string[] = []

  for (const rulesPreset of RULE_PRESET_NAMES) {
    for (const rileyProfile of PROFILE_NAMES) {
      const batch =
        rileyProfile === 'balanced' && rulesPreset === 'classic'
          ? baseline
          : runBatch(gameCount, rileyProfile, rulesPreset)
      reportCell(batch, rileyProfile, rulesPreset)
      flags.push(...flagOutlier(batch, baseline, rileyProfile, rulesPreset))
    }
  }

  console.log('')
  if (flags.length > 0) {
    console.error(`Flagged ${flags.length} outlier cell(s):`)
    for (const f of flags) console.error(`  ${f}`)
    // Non-zero exit is the whole point of "CI-wired" — a flagged cell must
    // fail the workflow, not just print a warning into a log nobody reads.
    process.exitCode = 1
  } else {
    console.log('No cell drifted more than the guard thresholds.')
  }
}

main()
