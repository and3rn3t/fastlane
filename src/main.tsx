import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { GameProvider } from '@/state/GameContext'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <GameProvider>
        <App />
      </GameProvider>
    </ErrorBoundary>
  </StrictMode>
)
