// path: src/components/settings/settingsShared.tsx
// The small building blocks every Settings tab is made of: a titled group, a
// tile you pick from, a toggle row. Shared so the tabs look like one dialog.
import type React from 'react'

// ── Shared bits ───────────────────────────────────────────────────────────────

export function Group({ title, action, children }: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        <span style={{ flex: 1 }}>{title}</span>
        {action}
      </div>
      {children}
    </section>
  )
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="hover-gold"
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        color: 'var(--text-muted)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)',
        transition: 'color var(--transition)',
      }}
    >
      {children}
    </button>
  )
}

export function Tile({ active, onClick, title, children, width = 78 }: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
  width?: number
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width, padding: 5, cursor: 'pointer',
        background: active ? 'var(--gold-glow)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        fontFamily: 'var(--font-ui)', transition: 'all var(--transition)',
      }}
      className={active ? '' : 'hover-gold-border'}
    >
      {children}
    </button>
  )
}

export function TileLabel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, color: active ? 'var(--gold)' : 'var(--text-muted)', letterSpacing: '0.03em' }}>
      {children}
    </span>
  )
}

export const ROW: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 }

export function ToggleRow({ icon, label, value, on, off, onClick, hint }: {
  icon: React.ReactNode
  label: string
  value: boolean
  on: string
  off: string
  onClick: () => void
  hint?: string
}) {
  return (
    <div>
      <button
        onClick={onClick}
        className="menu-item menu-item-sm"
        style={{
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          color: value ? 'var(--gold)' : 'var(--text-secondary)',
        }}
      >
        {icon}
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <span style={{ fontSize: 11, opacity: 0.75 }}>{value ? on : off}</span>
      </button>
      {hint && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}
/**
 * A one-off action that sits beside toggle rows (Reset to defaults): the same
 * row shell as ToggleRow, so a pair of them reads as one kind of control. The
 * trailing slot shows what it leads to instead of an On / Off state.
 */
export function ActionRow({ icon, label, trailing, onClick, disabled, title, hint }: {
  icon: React.ReactNode
  label: string
  trailing?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  hint?: string
}) {
  return (
    <div>
      <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="menu-item menu-item-sm"
        style={{
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          ...(disabled ? { opacity: 0.5, cursor: 'default', pointerEvents: 'none' } : {}),
        }}
      >
        {icon}
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        {trailing}
      </button>
      {hint && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ── Controls added for consistency ────────────────────────────────────────────
// Every Settings tab builds from these rather than styling its own, so a button,
// a slider row or a set of choices looks and behaves the same wherever it is:
//
//   ToggleRow     an on/off setting (a row that names its state: On / Off)
//   Tile          one choice from a visual set (has a preview)
//   ChoiceTiles   one choice from a small text-only set
//   SliderRow     a number on a range, with its value shown at the end
//   SettingsButton an action (Reset, Save, Default keybinds)
//   LinkButton    a quiet text action in a group header (Reset all, Automatic)

/** A small caption above a control inside a group. */
export function SubLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
      color: 'var(--text-muted)', marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  )
}

/** A short explanation under a control. */
export function Hint({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.5, ...style }}>
      {children}
    </div>
  )
}

/**
 * The one button style in Settings: the app's own `.btn btn-sm`, so it matches
 * the rest of the app in both designs and greys out the same way when disabled.
 */
export function SettingsButton({ onClick, disabled, title, type = 'button', primary, children }: {
  onClick?: () => void
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      className={primary ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
      style={{ flexShrink: 0 }}
    >
      {children}
    </button>
  )
}

/** A labelled slider with its current value at the end, and room for a sample. */
export function SliderRow({ label, value, min, max, step, display, onChange, onCommit, title, extra }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** How the value reads, e.g. "100%" or "3 lines". */
  display: string
  onChange: (v: number) => void
  /** Called when the drag ends, for controls that throttle while dragging. */
  onCommit?: () => void
  title?: string
  /** Something to show beside it, such as a colour sample. */
  extra?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
      <span style={{ width: 96, flexShrink: 0, fontSize: 11.5, color: 'var(--text-secondary)' }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value} title={title}
        onChange={e => onChange(Number(e.target.value))} onPointerUp={onCommit}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span style={{ width: 52, flexShrink: 0, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {display}
      </span>
      {extra}
    </div>
  )
}

/** Pick one of a few text options. Same size tiles, so the set reads as one control. */
export function ChoiceTiles<T extends string>({ options, value, onChange, width = 112 }: {
  options: { key: T; label: string; hint?: string }[]
  value: T
  onChange: (v: T) => void
  width?: number
}) {
  return (
    <div style={ROW}>
      {options.map(o => {
        const active = value === o.key
        return (
          <Tile key={o.key} active={active} width={width} title={o.hint} onClick={() => onChange(o.key)}>
            <div style={{ height: 18, display: 'flex', alignItems: 'center' }}>
              <TileLabel active={active}>{o.label}</TileLabel>
            </div>
          </Tile>
        )
      })}
    </div>
  )
}
