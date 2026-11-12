// path: src/components/TimelineFilterPanel.tsx
// Shared show/hide filter dropdown used by the full Timeline page and the
// campaign-hub timeline embed.
import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { ARTICLE_TYPES } from './wiki/wikiConstants'
import type { ArticleType } from '../types'

export interface TimelineFilters {
  sessions: boolean; events: boolean; deaths: boolean
  quests: boolean; eras: boolean
  /** Per article type, for everything that isn't an event or a quest (those
   *  already have their own row above). Missing = shown. */
  types: Partial<Record<ArticleType, boolean>>
  /** Selected tags; empty means no tag restriction. An article passes if it
   *  carries any one of the selected tags. */
  tags: string[]
}

// Events and quests get their own row (kind-based, above) — a duplicate
// per-type toggle for them would just be confusing.
const TYPE_ROWS = ARTICLE_TYPES.filter(t => t.value !== 'event' && t.value !== 'quest')

// The only types that ever carry a death mark — soloing "Deaths" or a type
// that can die keeps both sides of that pairing open.
const DEATH_TYPES: ArticleType[] = ['character', 'playerCharacter']

export const DEFAULT_TIMELINE_FILTERS: TimelineFilters = {
  sessions: true, events: true, deaths: true, quests: true, eras: true,
  types: Object.fromEntries(TYPE_ROWS.map(t => [t.value, true])) as Partial<Record<ArticleType, boolean>>,
  tags: [],
}

/** How many conditions are narrowing the view away from "show everything". */
export function countActiveTimelineFilters(f: TimelineFilters): number {
  const boolOff = [f.sessions, f.events, f.deaths, f.quests, f.eras].filter(v => !v).length
  const typeOff = TYPE_ROWS.filter(t => f.types[t.value] === false).length
  return boolOff + typeOff + f.tags.length
}

type BoolKey = 'sessions' | 'events' | 'deaths' | 'quests' | 'eras'

const BOOL_ROWS: { key: BoolKey; label: string; color: string; icon: string }[] = [
  { key: 'sessions', label: 'Sessions',  color: 'var(--gold)', icon: '○' },
  { key: 'events',   label: 'Events',    color: '#e05555',     icon: '◆' },
  { key: 'deaths',   label: 'Deaths',    color: '#9b7de8',     icon: '☠' },
  { key: 'quests',   label: 'Quests',    color: '#5b9fe8',     icon: '◆' },
  { key: 'eras',     label: 'Era bands', color: '#c8a84b',     icon: '▭' },
]

export function TimelineFilterPanel({ filters, onChange, onClose, availableTags = [], title = 'Show on timeline' }: {
  filters: TimelineFilters
  onChange: (f: TimelineFilters) => void
  onClose: () => void
  /** Tags in use across the campaign's dated articles — the tag filter is
   *  hidden entirely when there are none. */
  availableTags?: string[]
  title?: string
}) {
  // Which row the pointer is over — that row's "only" button shows.
  const [soloHover, setSoloHover] = useState<string | null>(null)

  // A death mark is gated by both "Deaths" and its character's type, so soloing
  // either one has to keep the other side open too, or it hides itself.
  const soloBool = (key: BoolKey) => {
    const keepTypes = new Set<ArticleType>(key === 'deaths' ? DEATH_TYPES : [])
    onChange({
      ...filters,
      sessions: false, events: false, deaths: false, quests: false, eras: false,
      types: Object.fromEntries(TYPE_ROWS.map(t => [t.value, keepTypes.has(t.value)])),
      [key]: true,
    })
  }
  const soloType = (value: ArticleType) => onChange({
    ...filters,
    sessions: false, events: false, quests: false, eras: false,
    deaths: DEATH_TYPES.includes(value),
    types: Object.fromEntries(TYPE_ROWS.map(t => [t.value, t.value === value])),
  })
  const toggleTag = (tag: string) => onChange({
    ...filters,
    tags: filters.tags.includes(tag) ? filters.tags.filter(t => t !== tag) : [...filters.tags, tag],
  })

  const row = (key: string, checked: boolean, color: string, icon: ReactNode, label: string, onToggle: () => void, onSolo: () => void) => (
    <button key={key} onClick={onToggle}
      onMouseEnter={() => setSoloHover(key)} onMouseLeave={() => setSoloHover(h => h === key ? null : h)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left' }}
      className="hover-bg">
      <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? color : 'var(--border)'}`, background: checked ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {checked && <span style={{ fontSize: 9, color: '#000', fontWeight: 700 }}>✓</span>}
      </div>
      <span style={{ color, fontSize: 13, width: 14, textAlign: 'center', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {soloHover === key ? (
        <span onClick={e => { e.stopPropagation(); onSolo() }} title={`Show only ${label}`}
          style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}
          className="hover-gold">
          only
        </span>
      ) : <span style={{ width: 24, flexShrink: 0 }} />}
    </button>
  )

  return (
    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', width: 230, maxHeight: 480, overflowY: 'auto', zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>

      {BOOL_ROWS.map(r => row(r.key, filters[r.key], r.color, r.icon, r.label,
        () => onChange({ ...filters, [r.key]: !filters[r.key] }), () => soloBool(r.key)))}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 14px 4px', borderTop: '1px solid var(--border)', marginTop: 2 }}>
        Article types
      </div>
      {TYPE_ROWS.map(t => {
        const Icon = t.icon
        const checked = filters.types[t.value] !== false
        return row(t.value, checked, t.color, <Icon size={12} />, t.label,
          () => onChange({ ...filters, types: { ...filters.types, [t.value]: !checked } }),
          () => soloType(t.value))
      })}

      {availableTags.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px', borderTop: '1px solid var(--border)', marginTop: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tags</span>
            {filters.tags.length > 0 && (
              <button onClick={() => onChange({ ...filters, tags: [] })}
                style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                className="hover-gold">
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '4px 14px 6px' }}>
            {availableTags.map(tag => {
              const active = filters.tags.includes(tag)
              return (
                <button key={tag} onClick={() => toggleTag(tag)} title={active ? `Stop requiring "${tag}"` : `Only show things tagged "${tag}"`}
                  style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border)'}`,
                    background: active ? 'var(--gold-glow)' : 'transparent',
                    color: active ? 'var(--gold)' : 'var(--text-secondary)',
                  }}>
                  {tag}
                </button>
              )
            })}
          </div>
          {filters.tags.length > 0 && (
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', padding: '0 14px 10px', fontStyle: 'italic' }}>
              Only things tagged {filters.tags.length === 1 ? `"${filters.tags[0]}"` : 'with any of these'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
