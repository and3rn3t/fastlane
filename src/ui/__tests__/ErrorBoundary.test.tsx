import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/ui/ErrorBoundary'

function Bomb(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('shows a reset fallback instead of crashing to a blank screen', () => {
    // React (and our own componentDidCatch) log the caught error to
    // console.error by default — silence it so the test output stays clean
    // without masking a real assertion failure.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Something broke/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reset and start over/i })).toBeTruthy()
    errorSpy.mockRestore()
  })

  it('clears the save and reloads on reset', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // jsdom's window.location.reload isn't configurable enough for
    // vi.spyOn directly — swap the whole object for a plain stand-in.
    const originalLocation = window.location
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    })
    localStorage.setItem('fastlane-save-v1', '{"week":1}')

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByRole('button', { name: /Reset and start over/i }))

    expect(localStorage.getItem('fastlane-save-v1')).toBeNull()
    expect(reloadMock).toHaveBeenCalled()

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    errorSpy.mockRestore()
  })
})
