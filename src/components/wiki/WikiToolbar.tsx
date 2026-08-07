// path: src/components/wiki/WikiToolbar.tsx
// Shared chrome for the two wiki views (list + graph). Both headers are built
// from these pieces so the title bar, search box, field checkboxes and type
// filters stay pixel-identical — previously each view had its own copy and they
// drifted (different pill sizes, search widths and row spacing).
//
// House scale for toolbar pills is the one TypeVisibilityMenu already used:
// 11px text, 3px/10px padding, 11px icon, fully rounded.

import type { CSSProperties, ReactNode } from 'react'
import { Search, X, ArrowLeft } from 'lucide-react'
import { ALL_FILTERS } from './wikiConstants'
import type { ArticleType } from '../../types'

export type WikiSearchFields = { title: boolean; tags: boolean }
export type WikiTypeFilter = 'all' | ArticleType

// Width of the search column. Both views reserve the same block so the pills
// that follow start at the same x.
export const SEARCH_COL_WIDTH = 260

// ── Pills ──────────────────────────────────────────────────────────────────────

export function toolbarPillStyle(active: boolean, color = 'var(--gold)'): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
    border: `1px solid ${active ? color : 'var(--border-light)'}`,
    background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
    color: active ? color : 'var(--text-muted)',
    fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease', whiteSpace: 'nowrap',
  }
}

// The count bubble carried by pills that report a number (Broken links, Hide types…).
export function pillCountStyle(color = 'var(--gold)'): CSSProperties {
  return {
    fontSize: 10, borderRadius: 99, padding: '0 6px',
    background: `color-mix(in srgb, ${color} 22%, transparent)`, color,
  }
}

export function ToolbarDivider() {
  return <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)', flexShrink: 0 }} />
}

// ── Header bar ─────────────────────────────────────────────────────────────────

export function WikiHeaderBar({ icon: Icon, title, meta, actions, onBack }: {
  icon: any
  title: string
  meta?: ReactNode
  actions?: ReactNode
  onBack: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', transition: 'color var(--transition)' }}
          className="hover-text">
          <ArrowLeft size={14} /> Back
        </button>
        <Icon size={22} color="var(--gold)" />
        <h1 style={{ fontSize: 22, letterSpacing: '0.05em' }}>{title}</h1>
        {meta && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {meta}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>
    </div>
  )
}

// The button that swaps between list and graph — same shape in both directions.
export function ViewSwitchButton({ icon: Icon, label, title, onClick }: {
  icon: any; label: string; title?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', transition: 'all 120ms' }}
      className="hover-gold-border">
      <Icon size={13} /> {label}
    </button>
  )
}

// ── Search box + field checkboxes ──────────────────────────────────────────────

// `verb` is the only intentional difference between the views: the list filters
// ("Search by…"), the graph highlights in place ("Highlight by…").
// `extras` renders on the checkbox line, before the match count.
export function WikiSearchBox({ value, onChange, fields, onFieldsChange, matchCount, verb, extras }: {
  value: string
  onChange: (v: string) => void
  fields: WikiSearchFields
  onFieldsChange: (f: WikiSearchFields) => void
  matchCount: number
  verb: 'Search' | 'Highlight'
  extras?: ReactNode
}) {
  const placeholder = fields.title && fields.tags ? `${verb} by title or tag…`
    : fields.tags ? `${verb} by tag…` : `${verb} by title…`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: SEARCH_COL_WIDTH, flexShrink: 0 }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input className="input" style={{ paddingLeft: 30, paddingRight: value ? 28 : 10, fontSize: 13, height: 32 }}
          placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
        {value && (
          <button onClick={() => onChange('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
            <X size={12} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 2 }}>
        {(['title', 'tags'] as const).map(field => {
          const active = fields[field]
          // Never let both fields go off — the last one checked is locked on.
          const isLast = active && !fields[field === 'title' ? 'tags' : 'title']
          return (
            <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', userSelect: 'none' }}>
              <input type="checkbox" checked={active} disabled={isLast}
                onChange={() => onFieldsChange({ ...fields, [field]: !active })}
                style={{ accentColor: 'var(--gold)', cursor: isLast ? 'default' : 'pointer', width: 11, height: 11 }} />
              {field}
            </label>
          )
        })}
        {extras}
        {/* The same query reports the same number in both views. */}
        {value.trim() && (
          <span style={{ fontSize: 11, color: matchCount > 0 ? 'var(--gold)' : 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Type filter pills ──────────────────────────────────────────────────────────

// Clicking the active type clears back to 'all'. Excluded types drop out of the
// row entirely (they're off in this view).
export function WikiTypeFilters({ excluded, value, onChange }: {
  excluded: Set<string>
  value: WikiTypeFilter
  onChange: (v: WikiTypeFilter) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {ALL_FILTERS.filter(f => !excluded.has(f.value)).map(f => {
        const Icon = f.icon
        const active = value === f.value
        const color = f.value === 'all' ? 'var(--gold)' : f.color
        return (
          <button key={f.value} onClick={() => onChange(active ? 'all' : (f.value as WikiTypeFilter))}
            style={toolbarPillStyle(active, color)}>
            <Icon size={11} /> {f.label}
          </button>
        )
      })}
    </div>
  )
}
