import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import {
  EngineError,
  applyAction,
  newGame,
  type GameAction,
  type GameState,
  type NewGameOptions,
} from '@/engine'

const SAVE_KEY = 'fastlane-save-v1'

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

/** Loose structural check on an imported save — not a full schema, just enough
 * to reject garbage/unrelated JSON before it reaches the engine. */
function isPlausibleSave(data: unknown): data is GameState {
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

/** Defaults fields added after a save was written, so an older save doesn't
 * crash code that assumes they exist (e.g. `history`, added for the
 * end-of-game recap chart). Not a real migration system — just enough to
 * keep old saves loading until Wave 2 builds proper schema versioning. */
function normalizeSave(
  game: Omit<GameState, 'history'> & { history?: GameState['history'] }
): GameState {
  return { history: [], ...game }
}

function loadSave(): Store {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return { game: normalizeSave(JSON.parse(raw) as GameState), error: null }
  } catch {
    // Corrupt or inaccessible save — start fresh.
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
      if (!isPlausibleSave(parsed)) {
        return { ok: false, error: "That doesn't look like a Fast Lane save file." }
      }
      dispatch({ type: 'importSave', game: normalizeSave(parsed) })
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
