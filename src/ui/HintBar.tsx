import { useMemo, useState } from 'react'
import {
  APPLY_JOB_TIME,
  bestQualifiedJob,
  hasItem,
  LOCATIONS,
  previewNextAction,
  travelCost,
  type CandidateTag,
  type GameState,
  type PlayerState,
} from '@/engine'
import { useGame } from '@/state/GameContext'
import { BoltIcon, BriefcaseIcon, CloseIcon } from './Icon'

/** Text-matched against the exact phrases week.ts's upkeep() logs — shared
 * with GameScreen.tsx's useDisasterSound, which plays a blip on the same
 * conditions this module reads for its reactive "recent trouble" hint. */
export const DISASTER_KEYWORDS = ['went hungry', 'evicted', 'robbed']

/** Copy for the hint bar's one-line suggestion. `previewNextAction()` only
 * reports a category (`CandidateTag`) — the exact wording lives here, in the
 * UI layer, since it's presentation text, not a game rule. `housing` is the
 * one tag with two real situations behind it (no apartment vs. rent due), so
 * it's the only case that reads `p` for specifics. */
// Priority order for RECENT_FAILURE_COPY below — eviction costs a place to
// live, robbery costs cash/valuables, hunger only costs happiness, so a
// week that somehow logs more than one gets the most consequential one.
const RECENT_FAILURE_PRIORITY = [
  'evicted',
  'robbed',
  'went hungry',
] as const satisfies readonly (typeof DISASTER_KEYWORDS)[number][]

const RECENT_FAILURE_COPY: Record<(typeof DISASTER_KEYWORDS)[number], string> = {
  evicted:
    'You were evicted last week — keep rent current at the Rent Office so it doesn’t happen again.',
  // Street robbery triggers on cash carried, not on owned items — Home
  // Insurance (which only covers durable-goods burglary, a separate roll)
  // doesn't prevent this at all. Bank the surplus or get a secure apartment,
  // the two things week.ts's actual robbery condition checks. Caught in PR
  // review: an earlier draft pointed here to insurance, which wouldn't have
  // helped.
  robbed:
    "You were robbed of cash last week — First Bank can hold what you don't carry, and a secure apartment stops it happening again.",
  'went hungry': 'You went hungry last week — keep food stocked at MegaMart or Burger Barn.',
}

/** Reactive counterpart to `hintCopy`'s forward-looking suggestion: surfaces
 * *recent* trouble instead of a current-turn precondition check, the same
 * text-matching pattern `useDisasterSound` already uses against `lastReport`
 * (itself set once per week and left in place through `dismissReport`, so it
 * naturally reads as "last week" for the whole following week, then clears
 * itself the moment a new week's report replaces it — no separate expiry
 * logic needed). Keyed with the report's week number so a recurring failure
 * in a *later* week isn't shadowed by an earlier dismissal of the same tag. */
function recentFailureHint(game: GameState): { key: string; text: string } | null {
  const report = game.lastReport
  if (!report) return null
  const playerTexts = report.entries.filter((e) => e.actor === 'player').map((e) => e.text)
  for (const keyword of RECENT_FAILURE_PRIORITY) {
    if (playerTexts.some((t) => t.includes(keyword))) {
      return { key: `recent:${report.week}:${keyword}`, text: RECENT_FAILURE_COPY[keyword] }
    }
  }
  return null
}

function hintCopy(tag: CandidateTag, p: PlayerState): string {
  switch (tag) {
    case 'food':
      return 'Running low on food — MegaMart has groceries, or grab a hot meal at Burger Barn.'
    case 'housing':
      return p.apartment === 'none'
        ? "You don't have a place to live yet — the Rent Office can set you up."
        : "Rent's due — settle up at the Rent Office before it piles up."
    case 'health':
      return 'Feeling run down — the Clinic can get you back on your feet.'
    case 'education':
      return 'A class at City University would move your Education goal forward.'
    case 'career':
      return "You're qualified for a better job — worth checking the Job Board."
    case 'career-prep':
      return "Building toward your next job — a better outfit, a computer, or a class could clear what's blocking it."
    case 'happiness':
      return 'Your happiness could use some attention — relax at home or treat yourself at Gadget City.'
    case 'wealth':
      return 'Put in a work shift to build toward your Wealth goal.'
    case 'valuables':
      return "You've got stuff worth protecting — Home Insurance at First Bank covers it."
    case 'invest':
      return "You've got surplus cash — First Bank can put it to work investing."
    case 'bank':
      return "You've got surplus cash sitting idle — bank it at First Bank."
    case 'gamble':
      return 'Feeling lucky? The Casino is open.'
  }
}

/** A subtle, dismissible one-line suggestion for what to do next. Two
 * sources, in priority order: recent trouble (`recentFailureHint`, reactive —
 * "this already went wrong") beats the forward-looking suggestion (reuses
 * Riley's own utility-scored decision logic via `previewNextAction` rather
 * than a second heuristic, so it can never disagree with what the AI itself
 * would consider best) — a player who was just evicted needs that surfaced
 * over a generic "next best move," not alongside it as a second bar. Both are
 * recomputed via `useMemo` keyed on `game` so they only re-run when the
 * actual game state changes, not on unrelated re-renders (muting sound,
 * opening Help). Dismissing hides the *current* suggestion only — once it
 * changes (the player acts, or a new week's report lands), a new hint can
 * appear. */
export function HintBar({ game }: { game: GameState }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const recentFailure = useMemo(() => recentFailureHint(game), [game])
  const tag = useMemo(() => previewNextAction(game, 'player'), [game])

  const hint =
    recentFailure ?? (tag ? { key: `next:${tag}`, text: hintCopy(tag, game.player) } : null)
  if (game.phase !== 'playing' || !hint || hint.key === dismissedKey) return null
  return (
    <div className="hint-bar">
      <BoltIcon size={15} className="icon" />
      <span className="text">{hint.text}</span>
      <button
        className="hint-dismiss"
        onClick={() => setDismissedKey(hint.key)}
        aria-label="Dismiss suggestion"
      >
        <CloseIcon size={13} />
      </button>
    </div>
  )
}

/** A dedicated "you now qualify for a better job" banner — reuses Wave 11's
 * hint-bar visual shell (`.hint-bar`/`.hint-dismiss`, plus the existing
 * `button.primary` style for the CTA — a different data source, not a new
 * visual pattern, per the roadmap). Reads `bestQualifiedJob()` from the new
 * `career.ts`, the same pure query Riley's AI uses via `pursueCareer`, so
 * this can never suggest a job the AI itself wouldn't consider a genuine
 * upgrade. Skipped when `HintBar`'s own utility-scored suggestion already
 * happens to be `'career'` this turn, so the two banners never say the same
 * thing twice — `previewNextAction` only surfaces `'career'` when applying
 * is the single highest-utility action available, which is exactly the
 * scenario this banner would otherwise duplicate. Dismissed per-session
 * (component state, like `HintBar`) rather than persisted, keyed by the
 * job's id so a *different*, even-better job surfaces as a new suggestion
 * rather than staying hidden behind an earlier dismissal. */
export function JobSwitchNudge({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  // A Set, not a single id: dismissing job A must not un-hide job B later
  // dismissed, and vice versa — each dismissal should stay effective for
  // the rest of the session independently of whatever else gets dismissed.
  const [dismissedJobIds, setDismissedJobIds] = useState<ReadonlySet<string>>(new Set())
  const primaryTag = useMemo(() => previewNextAction(game, 'player'), [game])
  const better = useMemo(() => bestQualifiedJob(game, 'player'), [game])

  if (game.phase !== 'playing' || primaryTag === 'career') return null
  if (!better || dismissedJobIds.has(better.id)) return null

  const canApplyNow = game.player.location === 'employment' || hasItem(game.player, 'phone')
  // Whichever action the button is actually about to take this click —
  // applying outright, or the first step of traveling there — must fit in
  // the time the player has left. Without this check, clicking with too
  // little time left throws an uncaught "Not enough time left this week"
  // (applyJob/travel both call the engine's spendTime, which asserts this).
  const timeNeeded = canApplyNow
    ? APPLY_JOB_TIME
    : travelCost(game.player.location, 'employment', hasItem(game.player, 'bike'))
  const canAffordSwitch = game.player.timeLeft >= timeNeeded

  return (
    <div className="hint-bar">
      <BriefcaseIcon size={15} className="icon" />
      <span className="text">
        You now qualify for {better.title} at {LOCATIONS[better.workplace].name}
        {game.player.jobId ? ' — a step up from your current job.' : '.'}
      </span>
      <button
        className="primary"
        disabled={!canAffordSwitch}
        onClick={() =>
          dispatchGame(
            canApplyNow
              ? { type: 'applyJob', jobId: better.id }
              : { type: 'travel', to: 'employment' }
          )
        }
      >
        Switch now
      </button>
      <button
        className="hint-dismiss"
        onClick={() => setDismissedJobIds((prev) => new Set(prev).add(better.id))}
        aria-label="Dismiss job suggestion"
      >
        <CloseIcon size={13} />
      </button>
    </div>
  )
}
