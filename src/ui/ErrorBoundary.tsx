import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SAVE_KEY } from '@/state/GameContext'
import { reportError } from '@/telemetry'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Today an uncaught exception anywhere below this — a corrupted save that
 * slipped past migration, a bug in a new action — unmounts the whole tree to
 * a blank white screen with no way back. This catches it and offers a way
 * out instead. No telemetry hookup yet (that's a separate, later item); this
 * just makes a crash survivable, not observable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Fast Lane crashed:', error, info.componentStack)
    reportError(error, 'error-boundary')
  }

  handleDownload = () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return
      const blob = new Blob([raw], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fastlane-save-before-reset.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Best-effort — Reset below is still the escape hatch either way.
    }
  }

  handleReset = () => {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      // Storage blocked — reload anyway, there's nothing else to try.
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="app">
        <div className="start gameover">
          <h1>💥 Something broke</h1>
          <p className="tagline">
            Fast Lane hit an unexpected error and can't continue safely. Resetting clears your
            current save and starts fresh — sorry about that. Grab a backup first if you want a
            chance at recovering it later.
          </p>
          <div className="start-actions" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={this.handleDownload}>Download my save first</button>
            <button className="primary" onClick={this.handleReset}>
              Reset and start over
            </button>
          </div>
        </div>
      </div>
    )
  }
}
