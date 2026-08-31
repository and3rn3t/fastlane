import { lazy, Suspense, useEffect, useState } from 'react'
import { jobById, netWorth, type GameState, type LocationId, type LogEntry } from '@/engine'
import { legacyPawnGlyph } from '@/legacy'
import { useGame } from '@/state/GameContext'
import { loadStats } from '@/stats'
import { Board, DeltaBadge, useDeltaFlash } from './Board'
import { Help } from './Help'
import {
  BackIcon,
  ChevronDownIcon,
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
      <div className="game-layout">
        <Board game={game} rileyLocation={replay.location} playerPawn={legacyPawnGlyph(stats)} />
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
