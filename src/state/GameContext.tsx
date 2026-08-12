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

function reducer(store: Store, action: StoreAction): Store {
  switch (action.type) {
    case 'newGame':
      return { game: newGame(action.options), error: null }
    case 'quitToMenu':
      return { game: null, error: null }
    case 'clearError':
      return { ...store, error: null }
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

function loadSave(): Store {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return { game: JSON.parse(raw) as GameState, error: null }
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
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}
