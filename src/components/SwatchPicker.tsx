// path: src/components/SwatchPicker.tsx
// The app's standard colour picker: 8 standard swatches, a colour-wheel
// swatch for custom colours (native picker), and a hex field whose code can
// be copied or pasted. Used everywhere the user picks a colour (story arcs,
// map pins, note groups, relation ranks, era bands, text colour…).
//
// Dragging in the native picker fires a change on every pixel. The picker
// follows the pointer through local state and only hands a value to `onChange`
// about every 90 ms (and once more at the end), so a caller that writes to the
// store, the database or the table window never has to throttle it themselves.
import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useMenuClose } from '../hooks/useMenuClose'
import { useThrottledCommit } from '../hooks/useThrottledCommit'
import { STANDARD_PALETTE } from '../constants/palettes'

// '#abc' / 'abc123' / '#AABBCC' → '#aabbcc'; null when not a valid hex colour.
function normalizeHex(raw: string): string | null {
  let v = raw.trim().toLowerCase()
  if (!v) return null
  if (!v.startsWith('#')) v = '#' + v
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return null
  if (v.length === 4) v = '#' + [...v.slice(1)].map(c => c + c).join('')
  return v
}

export interface Swatch {
  color: string
  /** Tooltip; defaults to the hex code. */
  title?: string
}

const STANDARD_SWATCHES: Swatch[] = STANDARD_PALETTE.map(color => ({ color }))

export default function SwatchPicker({ value, onChange, size = 22, gap = 6, keepFocus = false, swatches = STANDARD_SWATCHES }: {
  value: string | null | undefined
  onChange: (color: string) => void
  size?: number
  gap?: number
  // Prevent swatch clicks from stealing focus (keeps a text selection alive
  // in the rich editor). The hex field is exempt — it needs focus to type.
  keepFocus?: boolean
  /** The ready-made circles before the colour wheel. Defaults to the standard eight. */
  swatches?: Swatch[]
}) {
  const committed = normalizeHex(value ?? '')
  const [draft, update, flush] = useThrottledCommit<string | null>(committed, v => { if (v) onChange(v) })
  // What the picker shows: the colour under the pointer, not the last one committed.
  const current = draft
  const isStandard = current !== null && swatches.some(s => s.color === current)
  const wheelRef = useRef<HTMLInputElement>(null)
  const [hexDraft, setHexDraft] = useState(current ?? '')
  const [copied, setCopied] = useState(false)

  useEffect(() => { setHexDraft(current ?? '') }, [current])

  /** A deliberate pick (swatch, typed code): applied at once. */
  const pick = (c: string) => { update(c); flush() }

  const commitHex = () => {
    const v = normalizeHex(hexDraft)
    if (v) pick(v)
    else setHexDraft(current ?? '')
  }

  const copy = async () => {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch { /* clipboard unavailable — the hex field is still selectable */ }
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      onMouseDown={keepFocus ? e => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() } : undefined}
    >
      <div style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center' }}>
        {swatches.map(({ color: c, title }) => (
          <button
            key={c}
            type="button"
            title={title ?? c}
            onClick={() => pick(c)}
            style={{
              width: size, height: size, borderRadius: '50%', background: c, padding: 0,
              // A ring just outside the circle marks the choice, so it shows on any
              // colour, including near-white text colours on a dark ground.
              border: '1px solid rgba(0,0,0,0.25)',
              outline: current === c ? '2px solid var(--text-primary)' : '2px solid transparent', outlineOffset: 2,
              cursor: 'pointer', flexShrink: 0, transition: 'outline-color 120ms ease',
            }}
          />
        ))}

        {/* Colour wheel — opens the native picker; shows the custom colour once one is chosen */}
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <button
            type="button"
            title="Custom colour…"
            onClick={() => wheelRef.current?.click()}
            style={{
              width: size, height: size, borderRadius: '50%', padding: 0,
              background: current && !isStandard
                ? current
                : 'conic-gradient(#e05555, #e8d44d, #49c185, #4da6ff, #b04dff, #e05555)',
              border: '1px solid rgba(0,0,0,0.25)',
              outline: current && !isStandard ? '2px solid var(--text-primary)' : '2px solid transparent', outlineOffset: 2,
              cursor: 'pointer', flexShrink: 0, transition: 'outline-color 120ms ease',
            }}
          />
          <input
            ref={wheelRef}
            type="color"
            value={current ?? '#c8a84b'}
            onChange={e => update(e.target.value)}
            onBlur={flush}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1}
            aria-hidden
          />
        </span>
      </div>

      {/* Hex code — copyable, and paste any code (with or without #) to apply it */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          className="input"
          value={hexDraft}
          spellCheck={false}
          placeholder="#rrggbb"
          onChange={e => setHexDraft(e.target.value)}
          onBlur={commitHex}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitHex() }
          }}
          style={{ width: 92, fontSize: 12, fontFamily: 'var(--font-mono, monospace)', padding: '4px 8px' }}
        />
        <button
          type="button"
          onClick={copy}
          title="Copy colour code"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, background: 'none',
            border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
            padding: '4px 8px', fontSize: 11, cursor: 'pointer',
            color: copied ? 'var(--success)' : 'var(--text-muted)',
            transition: 'color var(--transition)',
          }}
          className={copied ? '' : 'hover-text'}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

// Compact variant for tight rows (rank lists, era bands, small menus): a
// colour dot that opens the full picker in a popover.
export function ColorDotPicker({ value, onChange, size = 20, title = 'Change colour' }: {
  value: string | null | undefined
  onChange: (color: string) => void
  size?: number
  title?: string
}) {
  const [open, setOpen] = useState(false)
  // Fixed positioning so the popover escapes scrollable/clipping containers
  // (rank lists, era rows inside modals).
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)
  useMenuClose(open, ref, setOpen)

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect()
      setPos({
        top: Math.min(r.bottom + 6, window.innerHeight - 140),
        left: Math.min(r.left, window.innerWidth - 240),
      })
    }
    setOpen(v => !v)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        title={title}
        onClick={toggle}
        style={{
          width: size, height: size, borderRadius: '50%', padding: 0,
          background: normalizeHex(value ?? '') ?? 'var(--bg-elevated)',
          border: '1px solid rgba(0,0,0,0.35)', cursor: 'pointer',
        }}
      />
      {open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 400,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          padding: 10, width: 224,
        }}>
          <SwatchPicker value={value} onChange={onChange} size={20} />
        </div>
      )}
    </div>
  )
}
