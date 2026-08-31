import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { GameProvider } from '@/state/GameContext'
import { reportError } from '@/telemetry'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import '@/index.css'

// Catches errors ErrorBoundary can't — async code outside React's render
// path (a rejected promise, a setTimeout callback) never reaches componentDidCatch.
window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, 'window-error')
})
window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, 'unhandled-rejection')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <GameProvider>
        <App />
      </GameProvider>
    </ErrorBoundary>
  </StrictMode>
)
