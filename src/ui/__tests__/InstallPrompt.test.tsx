import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newGame, type GameState } from '@/engine'
import { InstallPrompt, type BeforeInstallPromptEvent } from '@/ui/InstallPrompt'

function gameAtWeek(week: number): GameState {
  const goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
  return { ...newGame({ playerName: 'Tester', goals, seed: 1 }), week }
}

function mockInstallEvent(outcome: 'accepted' | 'dismissed'): BeforeInstallPromptEvent {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as BeforeInstallPromptEvent
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

describe('InstallPrompt', () => {
  const originalUA = window.navigator.userAgent

  beforeEach(() => {
    localStorage.clear()
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)') // neither iOS nor already-installed
  })
  afterEach(() => {
    cleanup()
    setUserAgent(originalUA)
  })

  it('shows nothing before the player has finished a first week', () => {
    render(
      <InstallPrompt game={gameAtWeek(1)} installEvent={null} onInstallEventConsumed={() => {}} />
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows iOS Share-sheet instructions on iOS with no captured install event', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    render(
      <InstallPrompt game={gameAtWeek(2)} installEvent={null} onInstallEventConsumed={() => {}} />
    )
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^install$/i })).toBeNull()
  })

  it('shows nothing on non-iOS with no captured install event (no native path available)', () => {
    render(
      <InstallPrompt game={gameAtWeek(2)} installEvent={null} onInstallEventConsumed={() => {}} />
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a branded Install button when an install event is captured, not the iOS text', () => {
    render(
      <InstallPrompt
        game={gameAtWeek(2)}
        installEvent={mockInstallEvent('accepted')}
        onInstallEventConsumed={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /^install$/i })).toBeTruthy()
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull()
  })

  it('accepting install calls prompt(), consumes the event, and dismisses for good', async () => {
    const event = mockInstallEvent('accepted')
    const onConsumed = vi.fn()
    render(
      <InstallPrompt
        game={gameAtWeek(2)}
        installEvent={event}
        onInstallEventConsumed={onConsumed}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }))
    await vi.waitFor(() => expect(onConsumed).toHaveBeenCalled())

    expect(event.prompt).toHaveBeenCalled()
    expect(localStorage.getItem('fastlane-install-dismissed')).toBe('1')
  })

  it('declining the native dialog consumes the (single-use) event but does not permanently dismiss', async () => {
    // Regression test for a real bug: a beforeinstallprompt event can only
    // be prompted once. Not clearing it after a "dismissed" outcome left a
    // dead button behind — visible, but reusing an already-consumed event
    // on a second click. onInstallEventConsumed must still fire even though
    // this isn't a permanent "never ask again."
    const event = mockInstallEvent('dismissed')
    const onConsumed = vi.fn()
    render(
      <InstallPrompt
        game={gameAtWeek(2)}
        installEvent={event}
        onInstallEventConsumed={onConsumed}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }))
    await vi.waitFor(() => expect(onConsumed).toHaveBeenCalled())

    expect(event.prompt).toHaveBeenCalled()
    expect(localStorage.getItem('fastlane-install-dismissed')).toBeNull()
  })

  it('the dismiss (✕) button suppresses the nudge for good, independent of any install event', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    const { rerender } = render(
      <InstallPrompt game={gameAtWeek(2)} installEvent={null} onInstallEventConsumed={() => {}} />
    )
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull()
    expect(localStorage.getItem('fastlane-install-dismissed')).toBe('1')

    // Stays dismissed even after a fresh mount (e.g. a page reload) — the
    // flag is read from localStorage on initial state, not just in-memory.
    rerender(
      <InstallPrompt game={gameAtWeek(3)} installEvent={null} onInstallEventConsumed={() => {}} />
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows nothing once already running standalone (installed)', () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    render(
      <InstallPrompt
        game={gameAtWeek(2)}
        installEvent={mockInstallEvent('accepted')}
        onInstallEventConsumed={() => {}}
      />
    )
    expect(screen.queryByRole('status')).toBeNull()
    // @ts-expect-error — test-only cleanup of a jsdom API this repo doesn't normally define
    delete window.matchMedia
  })
})
