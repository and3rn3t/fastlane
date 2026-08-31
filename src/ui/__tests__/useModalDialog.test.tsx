import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useModalDialog } from '../useModalDialog'

// A minimal test component that mounts the hook and renders two focusable elements.
function TestDialog({ onClose }: { onClose: () => void }) {
  const ref = useModalDialog(onClose)
  return (
    <div ref={ref} role="dialog" aria-label="test dialog">
      <button data-testid="first">First</button>
      <button data-testid="second">Second</button>
    </div>
  )
}

describe('useModalDialog', () => {
  afterEach(cleanup)

  it('moves focus to the first focusable element on mount', () => {
    render(<TestDialog onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByTestId('first'))
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<TestDialog onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps focus from last to first on Tab', () => {
    render(<TestDialog onClose={() => {}} />)
    const second = screen.getByTestId('second')
    second.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(screen.getByTestId('first'))
  })

  it('wraps focus from first to last on Shift+Tab', () => {
    render(<TestDialog onClose={() => {}} />)
    screen.getByTestId('first').focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByTestId('second'))
  })

  it('restores focus to the previously focused element on unmount', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = render(<TestDialog onClose={() => {}} />)
    unmount()

    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })

  it('removes the keydown listener on unmount so no events fire after cleanup', () => {
    const onClose = vi.fn()
    const { unmount } = render(<TestDialog onClose={onClose} />)
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
