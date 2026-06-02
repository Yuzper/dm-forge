// path: src/components/HintBox.tsx
import { ReactNode } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { useStore } from '../store/store'

interface HintBoxProps {
  // Stable key used to remember per-hint dismissal.
  hintKey: string
  title: string
  // Each item renders as a bullet line; ReactNode allows inline <Kbd>/<code>.
  items: ReactNode[]
  style?: React.CSSProperties
}

// A small dismissible tip card for surfacing non-obvious features. Hidden
// entirely when the global "Show hints" preference is off, or once the user
// dismisses this specific hint (re-enabling hints in settings brings it back).
export default function HintBox({ hintKey, title, items, style }: HintBoxProps) {
  const { showHints, dismissedHints, dismissHint } = useStore()

  if (!showHints || dismissedHints.includes(hintKey)) return null

  return (
    <div
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        borderLeft: '2px solid var(--gold)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        fontFamily: 'var(--font-ui)',
        ...style,
      }}
    >
      <Lightbulb size={14} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: items.length ? 5 : 0 }}>
          {title}
        </div>
        {items.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {items.map((item, i) => (
              <li key={i} style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--gold)', opacity: 0.6, flexShrink: 0 }}>·</span>
                <span style={{ minWidth: 0 }}>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        onClick={() => dismissHint(hintKey)}
        title="Dismiss hint"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0, borderRadius: 4 }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
      >
        <X size={13} />
      </button>
    </div>
  )
}

// Small inline keycap for rendering link sigils / shortcuts inside hint items.
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd style={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 4, padding: '0 5px', color: 'var(--gold)', fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </kbd>
  )
}
