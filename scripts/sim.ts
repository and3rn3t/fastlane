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
  goalProgress,
  newGame,
  runAIWeek,
  RULE_PRESETS,
  type AiProfileName,
  type GameState,
  type Goals,
  type RulePresetName,
} from '../src/engine/index.ts'

export type GoalKey = keyof Goals
export const GOAL_KEYS: GoalKey[] = ['wealth', 'happiness', 'education', 'career']

// The StartScreen "Standard" preset (level 4 of 10) — the default a new
// player would actually pick, so the baseline reflects real play.
const STANDARD_GOALS: Goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
export const MAX_WEEKS = 60
export const RULE_PRESET_NAMES: RulePresetName[] = ['classic', 'brutal', 'zen']
export const PROFILE_NAMES: AiProfileName[] = ['balanced', 'hustler', 'scholar', 'gambler']

export interface SimResult {
  winner: 'player' | 'riley' | 'none'
  weeks: number
  // Of the goals that were still short of threshold entering the winning
  // week and crossed it *during* that week (meetsGoals requires all four
  // simultaneously, so every such goal necessarily crossed this exact week
  // — a goal already >=1 last week can't be "completed" again), the one
  // that had the least progress banked beforehand — the real bottleneck
  // rather than just "who won." null for a game with no winner, or in the
  // (should-be-impossible) case nothing actually crossed this week.
  winningGoal: GoalKey | null
  // Phase 2 system usage, read off Riley's final state — a stable win rate
  // with these all at zero would mean the AI integration silently failed
  // even though the top-line numbers look fine. See reportSingleCell().
  rileyMaxSkill: number
  rileyTotalSkill: number
  rileyInvestmentValue: number
  rileyLayoffs: number
  rileyInheritances: number
}

// Only a goal that was actually below threshold going into the winning week
// AND cleared it by the end of that same week counts as "completed this
// week" — picking the global lowest-progress goal instead (an earlier draft
// of this function did) can misidentify a goal that was merely lagging but
// had already crossed in some prior week, or that never needed to move this
// week at all. Among genuine crossers, the one with the least progress
// banked beforehand is the one that had the most catching up to do.
function crossedGoal(
  prior: Record<GoalKey, number>,
  post: Record<GoalKey, number>
): GoalKey | null {
  const crossers = GOAL_KEYS.filter((key) => prior[key] < 1 && post[key] >= 1)
  if (crossers.length === 0) return null
  return crossers.reduce((worst, key) => (prior[key] < prior[worst] ? key : worst), crossers[0])
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
    // Snapshot each side's goal progress *before* this week resolves, so if
    // this turns out to be the winning week we still have the "just before
    // winning" picture — reading it off `state` after applyAction would only
    // show the fully-met goals, hiding which one was still the laggard.
    const priorProgress = {
      player: goalProgress(state.player, state.goals, state.economy.marketIndex),
      riley: goalProgress(state.riley, state.goals, state.economy.marketIndex),
    }
    // Player side always runs Balanced — a fixed opponent is what makes the
    // win rate a meaningful signal for whatever Riley profile is under test.
    runAIWeek(state, 'player', AI_PROFILES.balanced)
    state = applyAction(state, { type: 'endWeek' })
    if (state.phase === 'over') {
      const winner = state.winner ?? 'none'
      const winningGoal =
        winner === 'none'
          ? null
          : crossedGoal(
              priorProgress[winner],
              goalProgress(state[winner], state.goals, state.economy.marketIndex)
            )
      return { winner, weeks: state.week - 1, winningGoal, ...rileySystemUsage(state) }
    }
    state = applyAction(state, { type: 'dismissReport' })
  }
  return { winner: 'none', weeks: MAX_WEEKS, winningGoal: null, ...rileySystemUsage(state) }
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

// Nearest-rank percentile over a copy of `nums` (sorted ascending) — `null`
// input/empty array means "no decided games," same convention as
// avgWeeksOverall below, not a fabricated 0.
function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  // Standard nearest-rank: rank = ceil(p/100 * N), 1-indexed, clamped into
  // bounds. `Math.floor` here previously shifted every percentile up by one
  // slot at exact boundaries (e.g. p10 of 10 values picked the 2nd-smallest
  // instead of the smallest) — caught in PR review, not by a test.
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank]
}

// `null` specifically means "no game in this batch was decided" (every one
// hit the week cap) — average([]) silently returning 0 would otherwise print
// as "0.0 weeks to win," reading as instant games rather than the opposite
// (every game ran the full 60 weeks undecided). fmtWeeks() below is the one
// place that formats this for display.
export function fmtWeeks(weeks: number | null): string {
  return weeks === null ? 'n/a' : weeks.toFixed(1)
}

export type GoalTally = Record<GoalKey, number>

function tallyGoals(results: SimResult[], winner: 'player' | 'riley'): GoalTally {
  const tally: GoalTally = { wealth: 0, happiness: 0, education: 0, career: 0 }
  for (const r of results) {
    if (r.winner === winner && r.winningGoal) tally[r.winningGoal]++
  }
  return tally
}

export interface BatchSummary {
  gameCount: number
  results: SimResult[]
  playerWinPct: number
  rileyWinPct: number
  noWinnerPct: number
  avgWeeksOverall: number | null
  // Weeks-to-win distribution across every decided game (player + Riley wins
  // combined) — a flat average hides bimodal skew (e.g. one side habitually
  // rushing wealth while the other grinds career), percentiles surface it.
  weeksP10: number | null
  weeksP50: number | null
  weeksP90: number | null
  // Which goal was still short a week before each side actually won — the
  // real bottleneck, not just the win/loss tally. Counts, not percentages,
  // so callers can divide by whichever denominator (gameCount vs. that
  // side's own win count) makes sense for their report.
  goalBreakdown: { player: GoalTally; riley: GoalTally }
}

export function runBatch(
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
  const decidedWeeks = results.filter((r) => r.winner !== 'none').map((r) => r.weeks)
  return {
    gameCount,
    results,
    playerWinPct: (playerWins / gameCount) * 100,
    rileyWinPct: (rileyWins / gameCount) * 100,
    noWinnerPct: (noWinner / gameCount) * 100,
    avgWeeksOverall: decidedWeeks.length === 0 ? null : average(decidedWeeks),
    weeksP10: percentile(decidedWeeks, 10),
    weeksP50: percentile(decidedWeeks, 50),
    weeksP90: percentile(decidedWeeks, 90),
    goalBreakdown: {
      player: tallyGoals(results, 'player'),
      riley: tallyGoals(results, 'riley'),
    },
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
  console.log(`Avg weeks to win — overall: ${fmtWeeks(batch.avgWeeksOverall)}`)
  // Percentiles alongside the average above — a flat mean can't tell a
  // consistent ~25-week game apart from a 50/50 mix of 10-week blowouts and
  // 40-week grinds; p10/p50/p90 make that skew visible.
  console.log(
    `Weeks to win — p10: ${fmtWeeks(batch.weeksP10)}, p50: ${fmtWeeks(batch.weeksP50)}, p90: ${fmtWeeks(batch.weeksP90)}\n`
  )

  if (noWinner.length / gameCount > 0.1) {
    console.warn(
      `⚠ More than 10% of games hit the ${MAX_WEEKS}-week cap with no winner — that's worth a look.`
    )
  }

  // Which goal was the last one over the line for each side's wins — the
  // actual bottleneck, not just who won. Denominator is that side's own win
  // count (not gameCount) since the question is "of the games this side won,
  // what decided it," not "of all games."
  const goalPct = (tally: GoalTally, wins: number) => (n: number) =>
    wins === 0 ? 'n/a' : `${((n / wins) * 100).toFixed(0)}%`
  const playerGoalPct = goalPct(batch.goalBreakdown.player, playerWins.length)
  const rileyGoalPct = goalPct(batch.goalBreakdown.riley, rileyWins.length)
  console.log(`Winning goal breakdown (which goal was the bottleneck):`)
  console.log(
    `  Player wins — wealth: ${playerGoalPct(batch.goalBreakdown.player.wealth)}, happiness: ${playerGoalPct(batch.goalBreakdown.player.happiness)}, education: ${playerGoalPct(batch.goalBreakdown.player.education)}, career: ${playerGoalPct(batch.goalBreakdown.player.career)}`
  )
  console.log(
    `  Riley wins  — wealth: ${rileyGoalPct(batch.goalBreakdown.riley.wealth)}, happiness: ${rileyGoalPct(batch.goalBreakdown.riley.happiness)}, education: ${rileyGoalPct(batch.goalBreakdown.riley.education)}, career: ${rileyGoalPct(batch.goalBreakdown.riley.career)}\n`
  )

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
// silently passing. Exported so sim-report.ts's CI gate reuses these exact
// numbers rather than redefining its own — one set of thresholds, not two
// that can quietly drift apart.
export const DRIFT_THRESHOLD_POINTS = 10
export const NO_WINNER_GUARD_PCT = 3

export function flagOutlier(
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
  // p50 sits alongside the mean rather than replacing it: a matrix cell
  // where they diverge is itself a signal (skewed, not just noisy) that a
  // reader would otherwise only find by re-running that one cell solo.
  const header = 'profile     rules     player%   riley%   no-winner%   avg wks  p50 wks'
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
        `${rileyProfile.padEnd(11)} ${rulesPreset.padEnd(9)} ${batch.playerWinPct.toFixed(1).padStart(6)}%   ${batch.rileyWinPct.toFixed(1).padStart(5)}%   ${batch.noWinnerPct.toFixed(1).padStart(9)}%   ${fmtWeeks(batch.avgWeeksOverall).padStart(6)}   ${fmtWeeks(batch.weeksP50).padStart(6)}`
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

// Positive-integer only: a fractional gameCount (e.g. "1.5") still runs
// ceil(gameCount) games via the seed loop's `<` condition, but every
// percentage in the report divides by the fractional value instead — one
// player win out of "1.5" games prints as 66.7%, two as 133.3%. Negative or
// zero input runs no games at all and divides by a non-positive number,
// producing NaN/negative percentages just as silently.
export function parseGameCount(arg: string | undefined): number {
  if (arg === undefined) return 200
  const n = Number(arg)
  if (Number.isInteger(n) && n > 0) return n
  console.warn(`⚠ Invalid game count "${arg}" — must be a positive integer. Falling back to 200.`)
  return 200
}

function main() {
  const gameCount = parseGameCount(process.argv[2])
  const profileArg = process.argv[3]

  if (profileArg === 'matrix') {
    reportMatrix(gameCount)
    return
  }

  // Object.hasOwn, not `in`: AI_PROFILES is a plain object, so `in` also
  // matches inherited Object.prototype keys like 'toString'/'constructor' —
  // `pnpm sim 50 toString` would otherwise pass this check, get cast to
  // AiProfileName, and crash deep in ai.ts when the "profile" turns out to
  // be a function, not an AiProfile.
  const rileyProfile: AiProfileName =
    profileArg && Object.hasOwn(AI_PROFILES, profileArg)
      ? (profileArg as AiProfileName)
      : 'balanced'
  if (profileArg && !Object.hasOwn(AI_PROFILES, profileArg)) {
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

// Only run the CLI when this file is executed directly (`pnpm sim`/`tsx
// scripts/sim.ts`), not when sim-report.ts imports its exports — without
// this guard, that import would also kick off a full default-args sim run
// as an unwanted side effect, before sim-report.ts's own matrix even starts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
