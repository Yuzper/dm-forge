// path: src/components/HintsWidget.tsx
import { useState, useRef } from 'react'
import { Lightbulb, X, Minus } from 'lucide-react'
import { useStore } from '../store/store'
import { HINTS } from '../constants/hints'

const WIDGET_W = 300

export default function HintsWidget() {
  const {
    showHints, dismissedHints, dismissHint,
    hintContext, hintMinimized, setHintMinimized,
  } = useStore()

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Respect the master on/off, the current context, and per-hint dismissal
  if (!showHints || !hintContext) return null
  const hint = HINTS[hintContext]
  if (!hint || dismissedHints.includes(hintContext)) return null

  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const rect = ref.current!.getBoundingClientRect()
    const ox = e.clientX - rect.left
    const oy = e.clientY - rect.top
    const onMove = (me: MouseEvent) => setPos({
      x: Math.max(0, Math.min(window.innerWidth  - WIDGET_W, me.clientX - ox)),
      y: Math.max(0, Math.min(window.innerHeight - 36,       me.clientY - oy)),
    })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const baseStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, zIndex: 950 }
    : { position: 'fixed', left: 24, bottom: 24, zIndex: 950 }

  // ── Minimised: a small lightbulb pill ──
  if (hintMinimized) {
    return (
      <button
        ref={ref as any}
        onMouseDown={onDragStart}
        onClick={() => setHintMinimized(false)}
        title="Show hint"
        style={{
          ...baseStyle,
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          padding: '6px 10px', cursor: 'grab', userSelect: 'none',
        }}
      >
        <Lightbulb size={13} color="var(--gold)" />
        <span style={{
          fontSize: 11, fontFamily: 'var(--font-display)', color: 'var(--gold)',
          letterSpacing: '0.04em', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hint.title}
        </span>
      </button>
    )
  }

  // ── Expanded ──
  return (
    <div
      ref={ref}
      style={{
        ...baseStyle, width: WIDGET_W,
        background: 'var(--bg-surface)', border: '1px solid var(--border-gold)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(200,168,75,0.06)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        userSelect: 'none', fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          padding: '8px 10px', background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-gold)',
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab', flexShrink: 0,
        }}
      >
        <Lightbulb size={13} color="var(--gold)" style={{ flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-display)', color: 'var(--gold)', letterSpacing: '0.04em',
        }}>
          {hint.title}
        </span>
        <button
          onClick={() => setHintMinimized(true)}
          title="Minimise"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0, transition: 'color var(--transition)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => dismissHint(hintContext)}
          title="Dismiss this hint"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0, transition: 'color var(--transition)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger-soft)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <ul style={{
        margin: 0, padding: '10px 12px', listStyle: 'none',
        display: 'flex', flexDirection: 'column', gap: 7,
      }}>
        {hint.items.map((item, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', gap: 7 }}>
            <span style={{ color: 'var(--gold)', opacity: 0.6, flexShrink: 0 }}>·</span>
            <span style={{ minWidth: 0 }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
