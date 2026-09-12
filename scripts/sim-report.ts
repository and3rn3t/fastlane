// CI-native balance report: the full AI_PROFILES × RULE_PRESETS matrix, with
// the same percentiles + goal-breakdown detail `pnpm sim`'s single-cell mode
// prints, for every cell rather than just one — packaging the matrix, the
// percentiles, and the goal breakdown into one deterministic job, per Wave
// 13's "CI-wired balance report" item. Also runs Wave 14's origin matrix
// (one cell per origin, Riley's origin forced) against the same baseline,
// since that's this repo's actual acceptance test for shipping origins at
// all — see docs/ROADMAP.md's Wave 14 preamble. Exits non-zero on any
// flagged cell so a real regression fails the workflow instead of scrolling
// past in a log nobody reads.
//
// Usage: pnpm sim:report [gameCount]  (default 100/cell — 12 profile×rules
// cells + 5 origin cells, so this already runs 1,700 games; `pnpm sim`'s own
// default of 200 would mean 3,400)

import { AI_PROFILES } from '../src/engine/index.ts'
import {
  combineLocationActions,
  DRIFT_THRESHOLD_POINTS,
  flagOutlier,
  flagStallOutlier,
  fmtWeeks,
  GOAL_KEYS,
  LONG_STALL_WEEKS,
  MAX_WEEKS,
  NO_WINNER_GUARD_PCT,
  ORIGIN_NAMES,
  parseGameCount,
  PROFILE_NAMES,
  RULE_PRESET_NAMES,
  runBatch,
  STALL_RATE_ABSOLUTE_GUARD_PCT,
  STALL_RATE_DRIFT_THRESHOLD_PCT,
  type BatchSummary,
  type GoalTally,
  type StallBreakdown,
} from './sim.ts'

const REPORT_DEFAULT_GAME_COUNT = 100

function goalPctLine(tally: GoalTally, wins: number): string {
  if (wins === 0) return 'n/a (no wins)'
  return GOAL_KEYS.map((key) => `${key}: ${((tally[key] / wins) * 100).toFixed(0)}%`).join(', ')
}

// Sorted descending by longStallGamePct, same rationale as sim.ts's own
// printStallBreakdown — the requirement most often a real wall leads, not
// whichever has the most total weeks.
function stallPctLine(breakdown: StallBreakdown): string {
  const entries = Object.entries(breakdown).sort(
    ([, a], [, b]) => b.longStallGamePct - a.longStallGamePct
  )
  if (entries.length === 0) return 'none'
  return entries.map(([key, s]) => `${key}: ${s.longStallGamePct.toFixed(0)}%`).join(', ')
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
  console.log(
    `Requirement stalls (player, % of games with a ${LONG_STALL_WEEKS}+ week stall): ` +
      stallPctLine(batch.stallBreakdown.player)
  )
}

function addLocationActions(totals: Record<string, number>, batch: BatchSummary): void {
  for (const [id, n] of Object.entries(combineLocationActions(batch))) {
    totals[id] = (totals[id] ?? 0) + n
  }
}

function printLocationRanking(totals: Record<string, number>): void {
  const totalActions = Object.values(totals).reduce((a, b) => a + b, 0)
  console.log(
    `\nLocation engagement — player + riley, least-visited first (share of logged actions):`
  )
  const ranked = Object.entries(totals).sort(([, a], [, b]) => a - b)
  for (const [id, n] of ranked) {
    console.log(`  ${id.padEnd(12)} ${((n / totalActions) * 100).toFixed(1)}%`)
  }
}

function main() {
  const gameCount = parseGameCount(process.argv[2], REPORT_DEFAULT_GAME_COUNT)

  console.log(
    `Fast Lane CI balance report — ${gameCount} games/cell, Standard goals, AI vs AI, ` +
      `${PROFILE_NAMES.length}×${RULE_PRESET_NAMES.length} = ${PROFILE_NAMES.length * RULE_PRESET_NAMES.length} cells`
  )
  console.log(
    `Drift vs. the balanced/classic baseline: >${DRIFT_THRESHOLD_POINTS} points of player win-rate drift, ` +
      `or >${STALL_RATE_DRIFT_THRESHOLD_PCT} points of requirement long-stall-rate drift. ` +
      `Absolute caps regardless of baseline: >${NO_WINNER_GUARD_PCT}% no-winner rate, ` +
      `or >${STALL_RATE_ABSOLUTE_GUARD_PCT}% long-stall rate on any requirement.`
  )

  const baseline = runBatch(gameCount, 'balanced', 'classic')
  const flags: string[] = []
  // Wave 24's cold-path engagement report: summed across every cell below so
  // the final ranking reflects the whole matrix, not just one profile/rules
  // combination.
  const locationTotals: Record<string, number> = {}

  for (const rulesPreset of RULE_PRESET_NAMES) {
    for (const rileyProfile of PROFILE_NAMES) {
      const batch =
        rileyProfile === 'balanced' && rulesPreset === 'classic'
          ? baseline
          : runBatch(gameCount, rileyProfile, rulesPreset)
      reportCell(batch, rileyProfile, rulesPreset)
      const label = `${rileyProfile}/${rulesPreset}`
      flags.push(
        ...flagOutlier(batch, baseline, label),
        ...flagStallOutlier(batch, baseline, label)
      )
      addLocationActions(locationTotals, batch)
    }
  }

  printLocationRanking(locationTotals)

  console.log(`\n${ORIGIN_NAMES.length} origins (Balanced/Classic, Riley's origin forced):`)
  for (const originId of ORIGIN_NAMES) {
    const batch = runBatch(gameCount, 'balanced', 'classic', originId)
    console.log(
      `  ${originId.padEnd(23)} player: ${batch.playerWinPct.toFixed(1)}%  riley: ${batch.rileyWinPct.toFixed(1)}%`
    )
    flags.push(...flagOutlier(batch, baseline, originId))
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
