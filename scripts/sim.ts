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
//   pnpm sim [gameCount] origins
//     Runs one cell per origin (Balanced/Classic, Riley's origin forced to
//     each in turn) against the same balanced/classic baseline the profile
//     matrix above uses — Wave 14's acceptance test that no single origin
//     drifts the win rate past the guard.

import {
  AI_PROFILES,
  applyAction,
  goalProgress,
  jobRequirements,
  LOCATIONS,
  newGame,
  nextTargetJob,
  runAIWeek,
  RULE_PRESETS,
  ORIGINS,
  type AiProfileName,
  type GameState,
  type Goals,
  type LocationId,
  type OriginId,
  type PlayerKey,
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
export const ORIGIN_NAMES: OriginId[] = ORIGINS.map((o) => o.id)

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
  // Wave 24 — Friction Diagnostics: per-`JobRequirement.key` stall detail for
  // this one game, see updateStallTracker() below.
  playerStalls: Record<string, RequirementStallDetail>
  rileyStalls: Record<string, RequirementStallDetail>
  // Wave 24 — how many logged actions each side performed at each location
  // over the whole game — see tallyLocationActions() below. Not a "visit
  // count" in the click-through sense, but the closest thing this sim has to
  // one: every actions.ts function that changes state logs through the same
  // log() helper, which stamps the actor's *current* location on every
  // entry (including travel() itself, stamped with the destination) — so
  // this reflects real usage, not just passing through.
  playerLocationActions: Record<LocationId, number>
  rileyLocationActions: Record<LocationId, number>
}

// A requirement (e.g. 'dress', 'skill:sales') counts as "stalled" for a week
// when it's the *sole* remaining unmet JobRequirement on whichever job
// nextTargetJob() currently has the player/Riley aimed at — the exact
// "everything else is ready, only this is missing" state a player actually
// feels as being blocked. `maxStreak` (not just `totalWeeks`) is what the
// CI guardrail below cares about: a requirement stalled for 3 weeks twice is
// a different, less alarming shape than one 6-week stretch even though the
// total is the same.
export interface RequirementStallDetail {
  totalWeeks: number
  maxStreak: number
}

interface StallTracker {
  jobId: string | null
  key: string | null
  streak: number
  totals: Record<string, RequirementStallDetail>
}

function newStallTracker(): StallTracker {
  return { jobId: null, key: null, streak: 0, totals: {} }
}

function flushStreak(t: StallTracker): void {
  if (t.key && t.streak > 0) {
    const detail = t.totals[t.key] ?? { totalWeeks: 0, maxStreak: 0 }
    detail.totalWeeks += t.streak
    detail.maxStreak = Math.max(detail.maxStreak, t.streak)
    t.totals[t.key] = detail
  }
  t.jobId = null
  t.key = null
  t.streak = 0
}

// Called once per week, with the state as it stands *entering* that week —
// same "before this week's actions" timing previewNextAction()-style
// diagnostics use elsewhere, so a stall streak reads as "N weeks where nothing
// changed" rather than crediting a week where the requirement was actually
// cleared. A streak resets (and flushes into `totals`) whenever the target
// job changes, the sole blocker changes, or more/fewer than exactly one
// requirement is unmet — this only tracks the specific "one thing away"
// state, not general career-prep progress.
function updateStallTracker(t: StallTracker, state: GameState, key: PlayerKey): void {
  const target = nextTargetJob(state, key)
  if (!target) {
    flushStreak(t)
    return
  }
  const unmet = jobRequirements(state[key], target.id).filter((r) => !r.met)
  if (unmet.length === 1 && target.id === t.jobId && unmet[0].key === t.key) {
    t.streak++
    return
  }
  flushStreak(t)
  if (unmet.length === 1) {
    t.jobId = target.id
    t.key = unmet[0].key
    t.streak = 1
  }
}

function emptyLocationTally(): Record<LocationId, number> {
  const tally = {} as Record<LocationId, number>
  for (const id of Object.keys(LOCATIONS) as LocationId[]) tally[id] = 0
  return tally
}

// Scans this one game's finished log for one actor's location on every
// entry that has one (every per-action player/riley entry does — see
// LogEntry's own doc comment in types.ts — world/upkeep entries don't).
// Run once at game end rather than incrementally per week, since the log
// already holds the complete, final record.
function tallyLocationActions(state: GameState, key: PlayerKey): Record<LocationId, number> {
  const tally = emptyLocationTally()
  for (const entry of state.log) {
    if (entry.actor === key && entry.location) tally[entry.location]++
  }
  return tally
}

// Only a goal that was actually below threshold going into the winning week
// AND cleared it by the end of that same week counts as "completed this
// week" — picking the global lowest-progress goal instead (an earlier draft
// of this function did) can misidentify a goal that was merely lagging but
// had already crossed in some prior week, or that never needed to move this
// week at all. Among genuine crossers, the one with the least progress
// banked beforehand is the one that had the most catching up to do.
export function crossedGoal(
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
  rulesPreset: RulePresetName,
  rileyOriginId?: OriginId
): SimResult {
  // Riley's profile lives on GameState itself — endWeek's 'endWeek' case
  // reads state.rileyProfile and looks up the matching AiProfile, so setting
  // it here is all runAIWeek('riley', ...) inside applyAction needs. Same
  // idea for rules: newGame() already accepts a RulesConfig (Wave 2's Rule
  // presets item) — this just finally threads a non-Classic choice through.
  // rileyOriginId is left undefined for every existing caller (profile/rules
  // matrix, single-cell mode) — Riley draws its origin at random exactly
  // like a real game, so those cells measure balance the way players
  // actually experience it. Only the origin matrix below forces it, to
  // isolate one origin's own effect from seed-to-seed draw noise.
  let state: GameState = newGame({
    playerName: 'Sim',
    goals: STANDARD_GOALS,
    seed,
    rileyProfile,
    rules: RULE_PRESETS[rulesPreset],
    rileyOriginId,
  })

  const playerStallTracker = newStallTracker()
  const rileyStallTracker = newStallTracker()

  const finish = (): Pick<
    SimResult,
    'playerStalls' | 'rileyStalls' | 'playerLocationActions' | 'rileyLocationActions'
  > => {
    flushStreak(playerStallTracker)
    flushStreak(rileyStallTracker)
    return {
      playerStalls: playerStallTracker.totals,
      rileyStalls: rileyStallTracker.totals,
      playerLocationActions: tallyLocationActions(state, 'player'),
      rileyLocationActions: tallyLocationActions(state, 'riley'),
    }
  }

  for (let i = 0; i < MAX_WEEKS; i++) {
    // Snapshot each side's goal progress *before* this week resolves, so if
    // this turns out to be the winning week we still have the "just before
    // winning" picture — reading it off `state` after applyAction would only
    // show the fully-met goals, hiding which one was still the laggard.
    const priorProgress = {
      player: goalProgress(state.player, state.goals, state.economy.marketIndex),
      riley: goalProgress(state.riley, state.goals, state.economy.marketIndex),
    }
    // Wave 24: read stall state as the week begins, before this week's
    // actions can change it — same "entering the week" timing as
    // priorProgress above.
    updateStallTracker(playerStallTracker, state, 'player')
    updateStallTracker(rileyStallTracker, state, 'riley')
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
      return {
        winner,
        weeks: state.week - 1,
        winningGoal,
        ...rileySystemUsage(state),
        ...finish(),
      }
    }
    state = applyAction(state, { type: 'dismissReport' })
  }
  return {
    winner: 'none',
    weeks: MAX_WEEKS,
    winningGoal: null,
    ...rileySystemUsage(state),
    ...finish(),
  }
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

// A stall streak reaching this many consecutive weeks is treated as a real
// structural wall rather than a self-correcting dip — same order of
// magnitude as DRIFT_THRESHOLD_POINTS below, chosen for the same reason:
// short of this, "the player was briefly a bit short on X" is normal play,
// not a diagnostic finding.
export const LONG_STALL_WEEKS = 10

export interface StallKeyStats {
  totalWeeks: number
  avgWeeksPerGame: number
  // % of games in the batch where this requirement's stall streak reached
  // LONG_STALL_WEEKS at least once — the rate the CI guardrail watches,
  // since one outlier game dominating totalWeeks shouldn't read the same as
  // a requirement that's *routinely* a wall.
  longStallGamePct: number
}
export type StallBreakdown = Record<string, StallKeyStats>

function tallyStalls(results: SimResult[], side: 'player' | 'riley'): StallBreakdown {
  const perGame = results.map((r) => (side === 'player' ? r.playerStalls : r.rileyStalls))
  const keys = new Set<string>()
  for (const g of perGame) for (const key of Object.keys(g)) keys.add(key)

  const out: StallBreakdown = {}
  for (const key of keys) {
    let totalWeeks = 0
    let longStallGames = 0
    for (const g of perGame) {
      const detail = g[key]
      if (!detail) continue
      totalWeeks += detail.totalWeeks
      if (detail.maxStreak >= LONG_STALL_WEEKS) longStallGames++
    }
    out[key] = {
      totalWeeks,
      avgWeeksPerGame: totalWeeks / results.length,
      longStallGamePct: (longStallGames / results.length) * 100,
    }
  }
  return out
}

function tallyLocationActionsAcrossBatch(
  results: SimResult[],
  side: 'player' | 'riley'
): Record<LocationId, number> {
  const tally = emptyLocationTally()
  for (const r of results) {
    const perGame = side === 'player' ? r.playerLocationActions : r.rileyLocationActions
    for (const id of Object.keys(tally) as LocationId[]) tally[id] += perGame[id]
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
  // Wave 24 — Friction Diagnostics: per-JobRequirement.key stall stats (see
  // updateStallTracker()) and per-location logged-action counts (see
  // tallyLocationActions()), aggregated across every game in the batch.
  stallBreakdown: { player: StallBreakdown; riley: StallBreakdown }
  locationActions: { player: Record<LocationId, number>; riley: Record<LocationId, number> }
}

export function runBatch(
  gameCount: number,
  rileyProfile: AiProfileName,
  rulesPreset: RulePresetName,
  rileyOriginId?: OriginId
): BatchSummary {
  const results: SimResult[] = []
  for (let seed = 0; seed < gameCount; seed++) {
    results.push(runOneGame(seed, rileyProfile, rulesPreset, rileyOriginId))
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
    stallBreakdown: {
      player: tallyStalls(results, 'player'),
      riley: tallyStalls(results, 'riley'),
    },
    locationActions: {
      player: tallyLocationActionsAcrossBatch(results, 'player'),
      riley: tallyLocationActionsAcrossBatch(results, 'riley'),
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

  printStallBreakdown(batch)
  printLocationBreakdown(batch)
}

// Sorted descending by longStallGamePct — the requirement most often a real
// wall (per LONG_STALL_WEEKS) leads, not just whichever has the most total
// weeks (a requirement gated on many low-tier jobs could rack up totalWeeks
// from lots of brief, unremarkable dips without ever being a genuine wall).
function printStallBreakdown(batch: BatchSummary) {
  const entries = Object.entries(batch.stallBreakdown.player).sort(
    ([, a], [, b]) => b.longStallGamePct - a.longStallGamePct
  )
  if (entries.length === 0) return
  console.log(
    `\nRequirement stalls — player (weeks as the *sole* unmet requirement on the next target job):`
  )
  for (const [key, stats] of entries) {
    console.log(
      `  ${key.padEnd(16)} avg ${stats.avgWeeksPerGame.toFixed(1)} wks/game, ` +
        `${stats.longStallGamePct.toFixed(1)}% of games hit a ${LONG_STALL_WEEKS}+ week stall`
    )
  }
}

// Player + Riley combined — a location only "cold" for the fixed-Balanced
// player (casino, since Balanced never gambles) can still be very much in
// use under a different Riley profile (Gambler). Combining sides is what
// tells "nobody plays this way" apart from "this AI profile doesn't."
export function combineLocationActions(
  batch: Pick<BatchSummary, 'locationActions'>
): Record<LocationId, number> {
  const combined = emptyLocationTally()
  for (const id of Object.keys(combined) as LocationId[]) {
    combined[id] = batch.locationActions.player[id] + batch.locationActions.riley[id]
  }
  return combined
}

// Least-visited locations first — a coarse discoverability/engagement
// signal, not a requirement-gating one (see the SimResult doc comment on
// playerLocationActions for what "logged action" means here).
function printLocationBreakdown(batch: BatchSummary) {
  const entries = Object.entries(combineLocationActions(batch)).sort(([, a], [, b]) => a - b)
  const totalActions = entries.reduce((sum, [, n]) => sum + n, 0)
  console.log(`\nLocation engagement — player + riley (share of logged actions at each location):`)
  for (const [id, n] of entries) {
    console.log(`  ${id.padEnd(12)} ${((n / totalActions) * 100).toFixed(1)}%`)
  }
}

// Flags an outlier cell against the Balanced/Classic baseline the same way
// Wave 9's balance note does for a new mechanic: >10 points of win-rate
// drift, or a no-winner rate above 3%, is worth a second look rather than
// silently passing. Exported so sim-report.ts's CI gate reuses these exact
// numbers rather than redefining its own — one set of thresholds, not two
// that can quietly drift apart.
export const DRIFT_THRESHOLD_POINTS = 10
export const NO_WINNER_GUARD_PCT = 3

// `label` identifies the cell in a flag message (e.g. "hustler/brutal" for
// the profile×rules matrix, an origin id for the origin matrix below) — the
// comparison itself is generic over what's actually varying.
export function flagOutlier(batch: BatchSummary, baseline: BatchSummary, label: string): string[] {
  const flags: string[] = []
  const drift = Math.abs(batch.playerWinPct - baseline.playerWinPct)
  if (drift > DRIFT_THRESHOLD_POINTS) {
    flags.push(
      `⚠ ${label}: player win rate drifts ${drift.toFixed(1)} points from the balanced/classic baseline (${baseline.playerWinPct.toFixed(1)}%)`
    )
  }
  if (batch.noWinnerPct > NO_WINNER_GUARD_PCT) {
    flags.push(
      `⚠ ${label}: ${batch.noWinnerPct.toFixed(1)}% of games hit the ${MAX_WEEKS}-week cap with no winner`
    )
  }
  return flags
}

// Wave 24's CI guardrail: a structural twin of flagOutlier() above, but for
// stall rate instead of win rate — a future data.ts tune that pushes any
// single requirement's long-stall rate too far from baseline fails
// pnpm sim:report the same way an unbalanced win rate does today, so this
// class of regression can't land silently. Player-side only: the dress
// question (and this class of issue generally) is about player experience,
// and Riley's AI actively works around stalls in ways a human doesn't
// necessarily discover — see pursueCareer()'s fixed clearing order.
export const STALL_RATE_DRIFT_THRESHOLD_PCT = 15

export function flagStallOutlier(
  batch: BatchSummary,
  baseline: BatchSummary,
  label: string
): string[] {
  const flags: string[] = []
  const keys = new Set([
    ...Object.keys(batch.stallBreakdown.player),
    ...Object.keys(baseline.stallBreakdown.player),
  ])
  for (const key of keys) {
    const batchPct = batch.stallBreakdown.player[key]?.longStallGamePct ?? 0
    const basePct = baseline.stallBreakdown.player[key]?.longStallGamePct ?? 0
    const drift = Math.abs(batchPct - basePct)
    if (drift > STALL_RATE_DRIFT_THRESHOLD_PCT) {
      flags.push(
        `⚠ ${label}: player "${key}" long-stall rate drifts ${drift.toFixed(1)} points from the balanced/classic baseline (${basePct.toFixed(1)}%)`
      )
    }
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
      const label = `${rileyProfile}/${rulesPreset}`
      flags.push(
        ...flagOutlier(batch, baseline, label),
        ...flagStallOutlier(batch, baseline, label)
      )
    }
  }

  if (flags.length > 0) {
    console.log('\nFlagged:')
    for (const f of flags) console.log(`  ${f}`)
  } else {
    console.log('\nNo cell drifted more than the guard thresholds.')
  }
}

// Wave 14's acceptance test: no single origin, forced onto Riley in an
// otherwise-plain Balanced/Classic game, may drift the win rate past the
// same guard the profile×rules matrix uses — against the same balanced/
// classic baseline (Riley drawing its origin at random, same as real play),
// not a separate no-origin baseline invented for this check.
function reportOriginMatrix(gameCount: number) {
  console.log(
    `\nFast Lane origin matrix — ${gameCount} games/origin, Balanced/Classic, Riley's origin forced, ` +
      `${ORIGIN_NAMES.length} origins\n`
  )
  const header = 'origin                  player%   riley%   no-winner%   avg wks  p50 wks'
  console.log(header)
  console.log('-'.repeat(header.length))

  const flags: string[] = []
  const baseline = runBatch(gameCount, 'balanced', 'classic')

  for (const originId of ORIGIN_NAMES) {
    const batch = runBatch(gameCount, 'balanced', 'classic', originId)
    console.log(
      `${originId.padEnd(23)} ${batch.playerWinPct.toFixed(1).padStart(6)}%   ${batch.rileyWinPct.toFixed(1).padStart(5)}%   ${batch.noWinnerPct.toFixed(1).padStart(9)}%   ${fmtWeeks(batch.avgWeeksOverall).padStart(6)}   ${fmtWeeks(batch.weeksP50).padStart(6)}`
    )
    flags.push(...flagOutlier(batch, baseline, originId))
  }

  if (flags.length > 0) {
    console.log('\nFlagged:')
    for (const f of flags) console.log(`  ${f}`)
  } else {
    console.log('\nNo origin drifted more than the guard thresholds.')
  }
}

// Positive-integer only: a fractional gameCount (e.g. "1.5") still runs
// ceil(gameCount) games via the seed loop's `<` condition, but every
// percentage in the report divides by the fractional value instead — one
// player win out of "1.5" games prints as 66.7%, two as 133.3%. Negative or
// zero input runs no games at all and divides by a non-positive number,
// producing NaN/negative percentages just as silently.
// `fallback` is a parameter, not a hardcoded 200, so a caller with its own
// default (sim-report.ts's 100/cell) falls back to *that* on invalid input
// instead of silently reverting to sim.ts's own default — otherwise
// `pnpm sim:report invalid` would run 200 games/cell (2,400 total) despite
// the report documenting a 100-game default everywhere else.
export function parseGameCount(arg: string | undefined, fallback = 200): number {
  if (arg === undefined) return fallback
  const n = Number(arg)
  if (Number.isInteger(n) && n > 0) return n
  console.warn(
    `⚠ Invalid game count "${arg}" — must be a positive integer. Falling back to ${fallback}.`
  )
  return fallback
}

function main() {
  const gameCount = parseGameCount(process.argv[2])
  const profileArg = process.argv[3]

  if (profileArg === 'matrix') {
    reportMatrix(gameCount)
    return
  }
  if (profileArg === 'origins') {
    reportOriginMatrix(gameCount)
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
// `import.meta.filename` (Node 24, per this repo's pinned engine) compares
// directly against process.argv[1] as plain filesystem paths — the earlier
// `file://${...}` string-building against `import.meta.url` broke on
// Windows paths and on any path containing characters that get percent-
// encoded in a file: URL (e.g. spaces), which would silently skip main().
if (import.meta.filename === process.argv[1]) {
  main()
}
