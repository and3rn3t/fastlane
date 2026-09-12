import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Shared dialog a11y behavior for Help and WeekReportModal: moves focus into
 * the dialog on open, traps Tab/Shift+Tab inside it, closes on Escape, and
 * restores focus to whatever triggered it on unmount.
 */
export function useModalDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : []
    // Help/WeekReportModal have exactly one focusable element — a trailing
    // primary button below several screens of prose/log. Focusing it
    // directly triggers the browser's native scroll-into-view, which lands
    // a freshly-opened dialog scrolled straight to the bottom, skipping the
    // title and most of the content (caught live at 375×667: the first-run
    // auto-opened Help tour opened already scrolled past its own "Your
    // goals" intro). LocationSheet doesn't hit this — its close button is
    // always the first focusable element, so focus (and the resulting
    // scroll) lands at the top. Requires the dialog itself to carry
    // `tabIndex={-1}` (every consumer's root div does).
    if (focusables.length > 1) {
      focusables[0].focus()
    } else {
      dialog?.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialog) return
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      // The dialog container itself is a valid focus target too (see the
      // 0-1-focusables branch above) — without treating it as a boundary
      // here, Shift+Tab from it fell through to neither branch below and
      // the browser tabbed focus out of the dialog entirely, breaking the
      // trap (caught in review).
      const onContainer = document.activeElement === dialog
      if (e.shiftKey && (onContainer || document.activeElement === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (onContainer || document.activeElement === last)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
    // Runs once per mount by design, same as Help's body-scroll-lock effect —
    // onClose is captured fresh each time this component mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
