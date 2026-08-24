import { useEffect, useState } from 'react'
import { jobById, netWorth, type GameState, type LocationId, type LogEntry } from '@/engine'
import { useGame } from '@/state/GameContext'
import { Board } from './Board'
import { Help } from './Help'
import { LocationPanel } from './LocationPanel'
import { WeekReportModal } from './WeekReportModal'

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
  return (
    <header className="topbar">
      <div className="topbar-row">
        <span className="brand">
          Fast <span>Lane</span>
        </span>
        <div className="topbar-actions">
          <button onClick={onHelp} title="How to play" aria-label="Help">
            ❓
          </button>
          <button
            onClick={exportSave}
            title="Download a backup of your save"
            aria-label="Export save"
          >
            💾
          </button>
          <button
            onClick={() => {
              if (window.confirm('Abandon this game and return to the menu?')) quitToMenu()
            }}
          >
            Menu
          </button>
        </div>
      </div>
      <div className="topbar-stats">
        <div className="stat">
          <span className="label">Cash</span>
          <span className="value">${p.cash.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="label">Net worth</span>
          <span className="value">${netWorth(p).toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="label">Job</span>
          <span className="value">{job ? job.title : '—'}</span>
        </div>
        <div className="stat">
          <span className="label">Dress</span>
          <span className={`value${p.dress < 10 ? ' low' : ''}`}>{p.dress}</span>
        </div>
        <div className="stat">
          <span className="label">Food</span>
          <span className={`value${p.fed + p.groceries < 6 ? ' low' : ''}`}>
            {Math.min(6, p.fed + p.groceries)}/6
          </span>
        </div>
        <div className="stat">
          <span className="label">Rent due</span>
          <span className={`value${p.rentDue > 0 ? ' low' : ''}`}>${p.rentDue}</span>
        </div>
        <span className="headline" title="This week's news">
          📰 {game.headline}
        </span>
      </div>
    </header>
  )
}

function EventLog({ game }: { game: GameState }) {
  const recent = game.log.slice(-30).reverse()
  return (
    <div className="panel">
      <h2>📋 This life so far</h2>
      <div className="log">
        {recent.length === 0 && <span className="desc">Nothing yet — get out there.</span>}
        {recent.map((e, i) => (
          <div className="entry" key={`${game.log.length - i}`}>
            <span className="who">W{e.week}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GameScreen({ game }: { game: GameState }) {
  const replay = useTurnReplay(game)
  const [helpOpen, setHelpOpen] = useAutoHelp()
  return (
    <div className="app">
      <TopBar game={game} onHelp={() => setHelpOpen(true)} />
      <div className="game-layout">
        <Board game={game} rileyLocation={replay.location} />
        <div className="side">
          <LocationPanel game={game} />
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
      {game.phase === 'weekReport' && replay.done && <WeekReportModal game={game} />}
      {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
