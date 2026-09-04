import { ChevronDownIcon } from './Icon'

/** The one shape every location action row shares: a growing label/desc
 * column plus whatever controls/buttons that particular action needs.
 * Deliberately doesn't model the trailing content as data — no control, a
 * Stepper, a NumberField, one shared input feeding two buttons, or two
 * independent input+button pairs all pass straight through as children,
 * since the shell (not the button/control count) is the only real
 * invariant across the ~13 rows that use this. */
export function ActionRow({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="action-row">
      <span className="grow">{label}</span>
      {children}
    </div>
  )
}

/** A tap-friendly −/+ control replacing a raw range slider for small bounded
 * quantities (hours, units) — the underlying state/dispatch is untouched,
 * only the input control changes. */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  suffix,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
  label: string
  suffix?: string
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <span className="stepper-val">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  )
}

/** Shared implementation for every `<input type="number">` amount field
 * (bet/tickets/deposit/invest/loan amounts). `htmlMin`/`htmlMax` are just the
 * native attributes (cosmetic/mobile-keyboard hints — pass whatever value
 * that field's markup already used, even where it doesn't match `floor`).
 * `floor`/`ceil` drive the actual value clamp. Always guards against `NaN`
 * on a cleared/invalid field (falling back to `floor`) — several call sites
 * previously clamped with bare `Math.max`/`Math.min`, which pass `NaN`
 * through unchanged and could leave a "disabled forever" or, for Casino,
 * a genuinely broken enabled-with-NaN action button. */
export function NumberField({
  value,
  onChange,
  ariaLabel,
  htmlMin,
  htmlMax,
  floor = 0,
  ceil,
}: {
  value: number
  onChange: (next: number) => void
  ariaLabel: string
  htmlMin?: number
  htmlMax?: number
  floor?: number
  ceil?: number
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      enterKeyHint="done"
      min={htmlMin}
      max={htmlMax}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        const parsed = Math.floor(Number(e.target.value))
        const safe = Number.isFinite(parsed) ? parsed : floor
        const clamped =
          ceil !== undefined ? Math.min(ceil, Math.max(floor, safe)) : Math.max(floor, safe)
        onChange(clamped)
      }}
    />
  )
}

/** A titled, icon-headed card grouping related action rows — the
 * grouped-list pattern that replaces a flat stack of action rows at
 * locations with more than one kind of thing to do here. */
export function ActionGroup({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="action-group">
      <span className="section-label">
        {icon && <>{icon} </>}
        {label}
      </span>
      <div className="action-group-body">{children}</div>
    </div>
  )
}

/** Same card, but collapsed behind a <details> disclosure triangle — for the
 * location with the most stacked sub-panels (Bank), so the less-common
 * action isn't competing for space with the common one by default. Native
 * <details>/<summary> gets keyboard/AT support for free. Also used by
 * StartScreen's "Customize match" disclosure (no icon) — same DOM/CSS. */
export function CollapsibleActionGroup({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details className="action-group">
      <summary className="section-label">
        {icon && <>{icon} </>}
        {label}
        <ChevronDownIcon size={13} className="disclosure-chevron" />
      </summary>
      <div className="action-group-body">{children}</div>
    </details>
  )
}
