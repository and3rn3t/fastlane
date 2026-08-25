import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import {
  EngineError,
  HEALTH_START,
  SAVE_VERSION,
  applyAction,
  newGame,
  type GameAction,
  type GameState,
  type NewGameOptions,
} from '@/engine'

// The "-v1" here is now just a name, not a version — frozen going forward.
// Schema versioning lives in the save's own `version` field (SAVE_VERSION)
// and the MIGRATIONS map below; never bump this key to invalidate old saves.
export const SAVE_KEY = 'fastlane-save-v1'

interface Store {
  game: GameState | null
  error: string | null
}

type StoreAction =
  | { type: 'game'; action: GameAction }
  | { type: 'newGame'; options: NewGameOptions }
  | { type: 'quitToMenu' }
  | { type: 'clearError' }
  | { type: 'importSave'; game: GameState }

function reducer(store: Store, action: StoreAction): Store {
  switch (action.type) {
    case 'newGame':
      return { game: newGame(action.options), error: null }
    case 'quitToMenu':
      return { game: null, error: null }
    case 'clearError':
      return { ...store, error: null }
    case 'importSave':
      return { game: action.game, error: null }
    case 'game': {
      if (!store.game) return store
      try {
        return { game: applyAction(store.game, action.action), error: null }
      } catch (e) {
        if (e instanceof EngineError) return { ...store, error: e.message }
        throw e
      }
    }
  }
}

/** Loose structural check — not a full schema, just enough to reject
 * garbage/unrelated JSON before it reaches the engine or a migration step. */
function isPlausibleSave(data: unknown): data is Record<string, unknown> {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.week === 'number' &&
    typeof d.phase === 'string' &&
    typeof d.player === 'object' &&
    d.player !== null &&
    typeof d.riley === 'object' &&
    d.riley !== null &&
    typeof d.goals === 'object' &&
    d.goals !== null
  )
}

/**
 * One entry per save version that ever shipped, keyed by the version a save
 * is coming FROM — the function returns a save conforming to version + 1.
 * migrateSave() below runs these in sequence up to SAVE_VERSION.
 *
 * 0 → 1: the first versioned save. Everything before this system existed is
 * "version 0" — unversioned, but a shape we know precisely (it's every save
 * this app has ever produced), so it's upgraded in place rather than
 * discarded. The only gap: `history` (added for the end-of-game recap chart)
 * is missing on saves from before that shipped.
 *
 * 1 → 2: Health & doctor added `health`/`hoursWorkedThisWeek` to each
 * player. A save from before that ships with a full tank of health and no
 * overwork on the books, same as a fresh player would start.
 *
 * 2 → 3: Job promotions & career ladder added `jobTenureWeeks`/
 * `promotionLevel`. A save from before that starts at 0 on both — no
 * retroactive credit for time already spent at a job, same as a fresh hire.
 */
function upgradePlayerToV2(player: unknown): unknown {
  if (typeof player !== 'object' || player === null) return player
  const p = player as Record<string, unknown>
  return {
    ...p,
    health: typeof p.health === 'number' ? p.health : HEALTH_START,
    hoursWorkedThisWeek: typeof p.hoursWorkedThisWeek === 'number' ? p.hoursWorkedThisWeek : 0,
  }
}

function upgradePlayerToV3(player: unknown): unknown {
  if (typeof player !== 'object' || player === null) return player
  const p = player as Record<string, unknown>
  return {
    ...p,
    jobTenureWeeks: typeof p.jobTenureWeeks === 'number' ? p.jobTenureWeeks : 0,
    promotionLevel: typeof p.promotionLevel === 'number' ? p.promotionLevel : 0,
  }
}

const MIGRATIONS: Record<number, (save: Record<string, unknown>) => Record<string, unknown>> = {
  0: (save) => ({
    ...save,
    history: Array.isArray(save.history) ? save.history : [],
  }),
  1: (save) => ({
    ...save,
    player: upgradePlayerToV2(save.player),
    riley: upgradePlayerToV2(save.riley),
  }),
  2: (save) => ({
    ...save,
    player: upgradePlayerToV3(save.player),
    riley: upgradePlayerToV3(save.riley),
  }),
}

/**
 * Runs a save through whatever migrations it needs to reach SAVE_VERSION.
 * Returns null (caller falls back to a fresh game) if the data doesn't look
 * like a save at all, its version is newer than this build understands, or a
 * migration step is missing — it never guesses at an unknown shape, since
 * that's exactly the silent-corruption failure mode this system replaces.
 */
function migrateSave(raw: unknown): GameState | null {
  if (!isPlausibleSave(raw)) return null
  let save = raw
  let version = typeof save.version === 'number' ? save.version : 0
  if (version > SAVE_VERSION) return null // from a newer, incompatible build
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version]
    if (!migrate) return null // no known path forward
    save = migrate(save)
    version += 1
  }
  return { ...save, version: SAVE_VERSION } as unknown as GameState
}

function loadSave(): Store {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const game = migrateSave(JSON.parse(raw))
      // A save existed but couldn't be used — distinct from "no save yet",
      // which is the normal case for a brand-new player and stays silent.
      if (!game) {
        return {
          game: null,
          error:
            "Couldn't load your save (it may be from an incompatible version) — starting fresh.",
        }
      }
      return { game, error: null }
    }
  } catch {
    return {
      game: null,
      error: 'Your save looked corrupted and could not be loaded — starting fresh.',
    }
  }
  return { game: null, error: null }
}

interface GameContextValue {
  game: GameState | null
  error: string | null
  dispatchGame: (action: GameAction) => void
  startGame: (options: NewGameOptions) => void
  quitToMenu: () => void
  clearError: () => void
  exportSave: () => void
  importSave: (raw: string) => { ok: boolean; error?: string }
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reducer, undefined, loadSave)

  useEffect(() => {
    try {
      if (store.game) localStorage.setItem(SAVE_KEY, JSON.stringify(store.game))
      else localStorage.removeItem(SAVE_KEY)
    } catch {
      // Storage full or blocked; the game still works without saves.
    }
  }, [store.game])

  const value: GameContextValue = {
    game: store.game,
    error: store.error,
    dispatchGame: (action) => dispatch({ type: 'game', action }),
    startGame: (options) => dispatch({ type: 'newGame', options }),
    quitToMenu: () => dispatch({ type: 'quitToMenu' }),
    clearError: () => dispatch({ type: 'clearError' }),
    exportSave: () => {
      if (!store.game) return
      const blob = new Blob([JSON.stringify(store.game, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fastlane-save-week${store.game.week}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    importSave: (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { ok: false, error: 'That file is not valid JSON.' }
      }
      const game = migrateSave(parsed)
      if (!game) {
        return { ok: false, error: "That doesn't look like a Fast Lane save file." }
      }
      dispatch({ type: 'importSave', game })
      return { ok: true }
    },
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}
