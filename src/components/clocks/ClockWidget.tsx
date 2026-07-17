// path: src/components/clocks/ClockWidget.tsx
// Progress clock UI (Blades in the Dark style): a segmented radial dial.
// ClockWidget draws the dial; ClockList renders rows of clocks with inline
// tick / rename / resize / delete, shared by the article editor sidebar and
// the campaign hub panel.

import { useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import type { Clock } from '../../types'

const TAU = Math.PI * 2

// One pie slice from angle a0 to a1 (radians, 12 o'clock = -π/2).
function slicePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
}

export function ClockWidget({ segments, filled, size = 36, color = 'var(--gold)', onChange }: {
  segments: number
  filled: number
  size?: number
  color?: string
  onChange?: (filled: number) => void   // omit for read-only
}) {
  const [hover, setHover] = useState<number | null>(null)
  const c = size / 2
  const r = c - 1.5
  const done = filled >= segments

  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      onMouseLeave={() => setHover(null)}
      style={{ flexShrink: 0, cursor: onChange ? 'pointer' : 'default', display: 'block' }}
    >
      {Array.from({ length: segments }, (_, i) => {
        const a0 = -Math.PI / 2 + (i / segments) * TAU
        const a1 = -Math.PI / 2 + ((i + 1) / segments) * TAU
        const isFilled = i < filled
        // Hovering previews the click result: fill up to here (or untick the last).
        const previewed = onChange && hover != null && (hover === filled - 1 ? i < filled - 1 : i <= hover)
        return (
          <path
            key={i}
            d={slicePath(c, c, r, a0, a1)}
            fill={isFilled ? color : 'transparent'}
            opacity={onChange && hover != null ? (previewed ? 1 : isFilled ? 0.45 : 1) : 1}
            stroke={done ? color : 'var(--border-light)'}
            strokeWidth={1}
            onMouseEnter={onChange ? () => setHover(i) : undefined}
            onClick={onChange ? () => onChange(i === filled - 1 ? i : i + 1) : undefined}
            style={{ transition: 'opacity 100ms ease' }}
          />
        )
      })}
    </svg>
  )
}

const SEGMENT_CHOICES = [4, 6, 8, 10, 12]

export function ClockList({ clocks, readOnly = false, renderMeta, onTick, onRename, onDelete, onCreate }: {
  clocks: Clock[]
  readOnly?: boolean
  renderMeta?: (clock: Clock) => React.ReactNode   // extra per-row context (hub: article chip)
  onTick: (clock: Clock, filled: number) => void
  onRename: (clock: Clock, name: string) => void
  onDelete: (clock: Clock) => void
  onCreate: (name: string, segments: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSegments, setNewSegments] = useState(6)

  const submit = () => {
    const name = newName.trim()
    if (!name) return
    onCreate(name, newSegments)
    setNewName('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {clocks.map(clock => {
        const done = clock.filled >= clock.segments
        return (
          <div key={clock.id} className="clock-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClockWidget
              segments={clock.segments}
              filled={clock.filled}
              onChange={readOnly ? undefined : f => onTick(clock, f)}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                key={`${clock.id}-${clock.name}`}   // re-sync if renamed elsewhere
                defaultValue={clock.name}
                readOnly={readOnly}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== clock.name) onRename(clock, v) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                style={{
                  width: '100%', background: 'none', border: 'none', outline: 'none', padding: 0,
                  fontSize: 12.5, color: done ? 'var(--gold)' : 'var(--text-primary)',
                  fontFamily: 'var(--font-ui)', textOverflow: 'ellipsis',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-muted)' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {done ? <span style={{ color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={10} /> complete</span> : `${clock.filled}/${clock.segments}`}
                </span>
                {renderMeta?.(clock)}
              </div>
            </div>
            {!readOnly && (
              <button
                onClick={() => onDelete(clock)}
                title="Delete clock"
                className="hover-text"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0 }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )
      })}

      {!readOnly && (adding ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="What's ticking?"
            className="input"
            style={{ flex: 1, height: 26, fontSize: 12, padding: '0 8px' }}
          />
          <select
            value={newSegments}
            onChange={e => setNewSegments(Number(e.target.value))}
            className="input"
            style={{ height: 26, fontSize: 12, padding: '0 4px', width: 52 }}
          >
            {SEGMENT_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={submit} className="btn btn-primary" style={{ height: 26, padding: '0 10px', fontSize: 12 }}>
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="hover-gold"
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11.5, padding: '2px 0' }}
        >
          <Plus size={12} /> Add clock
        </button>
      ))}
    </div>
  )
}
