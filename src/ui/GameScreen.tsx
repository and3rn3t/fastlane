import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  jobById,
  netWorth,
  previewNextAction,
  type CandidateTag,
  type GameState,
  type LocationId,
  type LogEntry,
  type PlayerState,
} from '@/engine'
import { legacyPawnGlyph } from '@/legacy'
import { useGame } from '@/state/GameContext'
import { loadStats } from '@/stats'
import { Board, DeltaBadge, useDeltaFlash } from './Board'
import { Help } from './Help'
import {
  BackIcon,
  BoltIcon,
  ChevronDownIcon,
  CloseIcon,
  ExportIcon,
  HelpIcon,
  SpeakerIcon,
  SpeakerMuteIcon,
} from './Icon'
import { LocationSheet } from './LocationSheet'
import { isMuted, playDisaster, setMuted } from './sound'

// Lazy: keeps the report-modal code out of the initial bundle; cached after
// the first week transition fetches it, so later weeks show it instantly.
const WeekReportModal = lazy(() =>
  import('./WeekReportModal').then((m) => ({ default: m.WeekReportModal }))
)

const REPLAY_STEP_MS = 650
const HELP_SEEN_KEY = 'fastlane-help-seen'

/** Opens Help once per browser, the first time a player reaches the game
 * screen — a lightweight stand-in for a full coach-mark tour. Not tied to
 * save data on purpose: it's "has this browser seen the tour", not "has this
 * particular save" — so it won't re-nag a returning player on a new game. */
function useAutoHelp() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(HELP_SEEN_KEY) === '1') return
      localStorage.setItem(HELP_SEEN_KEY, '1')
      setOpen(true)
    } catch {
      // Storage blocked — just skip the auto-open, the "?" button still works.
    }
  }, [])
  return [open, setOpen] as const
}

const DISASTER_KEYWORDS = ['went hungry', 'evicted', 'robbed']

/** Plays a disaster blip once per new report if any of this week's player
 * entries mention a bad event — text-matched against the exact phrases
 * week.ts's upkeep() logs, not guessed. */
function useDisasterSound(game: GameState) {
  useEffect(() => {
    const report = game.lastReport
    if (!report) return
    const hadDisaster = report.entries.some(
      (e) => e.actor === 'player' && DISASTER_KEYWORDS.some((k) => e.text.includes(k))
    )
    if (hadDisaster) playDisaster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.lastReport?.week])
}

/**
 * Riley's week resolves instantly in the engine; this replays it as a
 * step-by-step sequence (token walking the board, a caption per action)
 * before the static week-report modal appears. Only entries with a
 * `location` (per-action player/riley log lines) are replayable — world/
 * upkeep entries have none and are skipped here, same as before.
 */
function useTurnReplay(game: GameState) {
  const report = game.phase === 'weekReport' ? game.lastReport : null

  const [trackedWeek, setTrackedWeek] = useState<number | undefined>(undefined)
  const [progress, setProgress] = useState({ index: 0, skipped: false })

  // Reset progress the moment a new report appears — done during render
  // (React's blessed pattern for this) so there's no flicker frame where
  // the old "done" state briefly shows the modal before an effect resets it.
  if (report?.week !== trackedWeek) {
    setTrackedWeek(report?.week)
    setProgress({ index: 0, skipped: false })
  }

  const entries = (report?.entries ?? []).filter(
    (e): e is LogEntry & { location: LocationId } => e.actor === 'riley' && e.location !== undefined
  )
  const entryCount = entries.length

  useEffect(() => {
    if (!report || progress.skipped || progress.index >= entryCount) return
    const t = setTimeout(() => {
      setProgress((s) => ({ ...s, index: s.index + 1 }))
    }, REPLAY_STEP_MS)
    return () => clearTimeout(t)
  }, [report, progress, entryCount])

  if (!report) {
    return {
      location: undefined as LocationId | undefined,
      text: null as string | null,
      done: true,
      skip: () => {},
    }
  }

  const done = progress.skipped || progress.index >= entryCount
  const current = done ? null : entries[progress.index]

  return {
    location: current?.location,
    text: current?.text ?? null,
    done,
    skip: () => setProgress((s) => ({ ...s, skipped: true })),
  }
}

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
  robbed:
    'You were robbed last week — Home Insurance at First Bank covers your valuables against it.',
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
function HintBar({ game }: { game: GameState }) {
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

function TopBar({ game, onHelp }: { game: GameState; onHelp: () => void }) {
  const { quitToMenu, exportSave } = useGame()
  const p = game.player
  const job = p.jobId ? jobById(p.jobId) : null
  const cashDelta = useDeltaFlash(p.cash)
  const [muted, setMutedState] = useState(() => isMuted())
  return (
    <header className="topbar">
      <div className="topbar-row">
        <span className="brand">
          Fast <span>Lane</span>
        </span>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={onHelp} title="How to play" aria-label="Help">
            <HelpIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              const next = !muted
              setMuted(next)
              setMutedState(next)
            }}
            title={muted ? 'Unmute sound' : 'Mute sound'}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? <SpeakerMuteIcon /> : <SpeakerIcon />}
          </button>
          <button
            className="icon-btn"
            onClick={exportSave}
            title="Download a backup of your save"
            aria-label="Export save"
          >
            <ExportIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              if (window.confirm('Abandon this game and return to the menu?')) quitToMenu()
            }}
            title="Quit to menu"
            aria-label="Menu"
          >
            <BackIcon size={16} />
          </button>
        </div>
      </div>
      <div className="topbar-stats">
        <div className="stat cash">
          <span className="label">Cash</span>
          <span className="value">
            ${p.cash.toLocaleString()}
            {cashDelta !== null && cashDelta > 0 && (
              <svg className="sparkle" width="9" height="9" viewBox="0 0 8 8" aria-hidden>
                <path d="M4 0 5 3 8 4 5 5 4 8 3 5 0 4 3 3Z" fill="var(--good)" />
              </svg>
            )}
          </span>
          <DeltaBadge delta={cashDelta} format={(n) => `${n > 0 ? '+' : '-'}$${Math.abs(n)}`} />
        </div>
        <div className="stat chip">
          <span className="label">Net worth</span>
          <span className="value">${netWorth(p, game.economy.marketIndex).toLocaleString()}</span>
        </div>
        <div className="stat chip">
          <span className="label">Job</span>
          <span className="value">{job ? job.title : '—'}</span>
        </div>
        <div className="stat chip">
          <span className="label">Dress</span>
          <span className={`value${p.dress < 10 ? ' low' : ''}`}>{p.dress}</span>
        </div>
        <div className="stat chip">
          <span className="label">Health</span>
          <span className={`value${p.health < 40 ? ' low' : ''}`}>{p.health}</span>
        </div>
        <div className="stat chip">
          <span className="label">Food</span>
          <span className={`value${p.fed + p.groceries < 6 ? ' low' : ''}`}>
            {Math.min(6, p.fed + p.groceries)}/6
          </span>
        </div>
        <div className="stat chip">
          <span className="label">Rent due</span>
          <span className={`value${p.rentDue > 0 ? ' low' : ''}`}>${p.rentDue}</span>
        </div>
        {p.loanBalance > 0 && (
          <div className="stat chip">
            <span className="label">Loan</span>
            <span className={`value${p.garnished ? ' low' : ''}`}>
              ${p.loanBalance.toLocaleString()}
            </span>
          </div>
        )}
        <span className="headline" title="This week's news">
          📰 {game.headline}
        </span>
      </div>
    </header>
  )
}

function EventLog({ game }: { game: GameState }) {
  const recent = game.log.slice(-30).reverse()
  const latest = recent[0]
  return (
    <>
      {/* Announces just the newest line, not the whole (re-ordering) list below —
          re-reading up to 30 entries on every single action would be unusable. */}
      <div aria-live="polite" className="sr-only">
        {latest?.text}
      </div>
      <details className="panel">
        <summary>
          📋 This life so far
          <ChevronDownIcon size={13} className="disclosure-chevron" />
        </summary>
        <div className="log">
          {recent.length === 0 && <span className="desc">Nothing yet — get out there.</span>}
          {recent.map((e, i) => (
            <div className="entry" key={`${game.log.length - i}`}>
              <span className="who">W{e.week}</span>
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      </details>
    </>
  )
}

export function GameScreen({ game }: { game: GameState }) {
  const replay = useTurnReplay(game)
  const [helpOpen, setHelpOpen] = useAutoHelp()
  const [stats] = useState(loadStats)
  useDisasterSound(game)
  return (
    <main className="app">
      <TopBar game={game} onHelp={() => setHelpOpen(true)} />
      <HintBar game={game} />
      <div className="game-layout">
        <Board
          game={game}
          rileyLocation={replay.location}
          // Daily Challenge stays identical for every player — same rule
          // already applied to the cash bonus and rivalry momentum, extended
          // here to the cosmetic pawn too, so no perk touches that mode.
          playerPawn={game.isDailyChallenge ? undefined : legacyPawnGlyph(stats)}
        />
        <div className="side">
          <LocationSheet game={game} />
          <EventLog game={game} />
        </div>
      </div>
      {!replay.done && (
        <div className="replay-overlay">
          <div className="replay-bar">
            <span>🎩 {replay.text}</span>
            <button onClick={replay.skip}>Skip ▶▶</button>
          </div>
        </div>
      )}
      {game.phase === 'weekReport' && replay.done && (
        <Suspense fallback={null}>
          <WeekReportModal game={game} />
        </Suspense>
      )}
      {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
    </main>
  )
}
