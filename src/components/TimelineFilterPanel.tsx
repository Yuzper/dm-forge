// path: src/components/TimelineFilterPanel.tsx
// Shared show/hide filter dropdown used by the full Timeline page and the
// campaign-hub timeline embed.
import { X } from 'lucide-react'

export interface TimelineFilters {
  sessions: boolean; events: boolean; deaths: boolean
  quests: boolean; articles: boolean; eras: boolean
}

export const DEFAULT_TIMELINE_FILTERS: TimelineFilters = {
  sessions: true, events: true, deaths: true, quests: true, articles: true, eras: true,
}

const ROWS = [
  { key: 'sessions' as const, label: 'Sessions', color: 'var(--gold)', icon: '○' },
  { key: 'events'   as const, label: 'Events',   color: '#e05555',    icon: '◆' },
  { key: 'deaths'   as const, label: 'Deaths',   color: '#9b7de8',    icon: '☠' },
  { key: 'quests'   as const, label: 'Quests',   color: '#5b9fe8',    icon: '◆' },
  { key: 'articles' as const, label: 'Other articles', color: '#8a8a8a', icon: '◆' },
  { key: 'eras'     as const, label: 'Era bands', color: '#c8a84b',  icon: '▭' },
]

export function TimelineFilterPanel({ filters, onChange, onClose, title = 'Show on timeline' }: {
  filters: TimelineFilters
  onChange: (f: TimelineFilters) => void
  onClose: () => void
  title?: string
}) {
  return (
    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 200, zIndex: 100, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>
      {ROWS.map(row => (
        <button key={row.key} onClick={() => onChange({ ...filters, [row.key]: !filters[row.key] })}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left', transition: 'background 80ms' }}
          className="hover-bg">
          <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${filters[row.key] ? row.color : 'var(--border)'}`, background: filters[row.key] ? row.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 120ms' }}>
            {filters[row.key] && <span style={{ fontSize: 9, color: '#000', fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ color: row.color, fontSize: 13, marginRight: 2 }}>{row.icon}</span>
          {row.label}
        </button>
      ))}
    </div>
  )
}
