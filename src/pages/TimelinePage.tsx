// path: src/pages/TimelinePage.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/store'
import { Clock, Plus, ArrowLeft, ExternalLink, Filter, ZoomIn, ZoomOut, Settings, X, Skull } from 'lucide-react'
import { parseInWorldDate, InWorldDatePicker } from '../components/InWorldDatePicker'
import type { ArticleType } from '../types'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'

// ── Constants ──────────────────────────────────────────────────────────────────

const PAD_L = 64
const PAD_R = 80
const AXIS_Y = 190
const ARC_H = 14
const ARC_Y = AXIS_Y - ARC_H / 2
const SESSION_PILL_H = 10
const SESSION_PILL_Y = AXIS_Y - ARC_H / 2 - 22
const SESSION_DOT_Y = AXIS_Y - ARC_H / 2 - 54
const EVENT_Y = AXIS_Y - ARC_H / 2 - 110
const DEATH_Y = AXIS_Y + 30
const NS = 'http://www.w3.org/2000/svg'

const ZOOM_LEVELS = [4, 6, 8, 10, 14, 18, 24, 32]
const DEFAULT_ZOOM = 4 // index into ZOOM_LEVELS


// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionExt {
  id: number; name: string; session_number: number; session_sub: string | null
  arc_id: number | null; in_world_day?: number | null; in_world_day_end?: number | null
}

interface TimelineItem {
  id: number; title: string; day: number; year: number
  kind: 'event' | 'death'; article_type: string; color: string
  articleId?: number
}

interface SelectedItem {
  kind: 'session' | 'event' | 'death'
  id: number; title: string; day: number; dayEnd?: number; year: number
  arcColor?: string; arcName?: string; sessionNum?: string; articleType?: string
}

// ── Filters ────────────────────────────────────────────────────────────────────

interface TimelineFilters {
  sessions: boolean
  events: boolean
  deaths: boolean
}

const DEFAULT_FILTERS: TimelineFilters = { sessions: true, events: true, deaths: true }

function loadFilters(campaignId: number): TimelineFilters {
  try {
    const s = localStorage.getItem(`timeline-filters-${campaignId}`)
    if (s) return { ...DEFAULT_FILTERS, ...JSON.parse(s) }
  } catch {}
  return { ...DEFAULT_FILTERS }
}

function saveFilters(campaignId: number, f: TimelineFilters) {
  localStorage.setItem(`timeline-filters-${campaignId}`, JSON.stringify(f))
}

// ── SVG helpers ────────────────────────────────────────────────────────────────

function svgEl(tag: string, attrs: Record<string, string | number>, parent?: SVGElement) {
  const e = document.createElementNS(NS, tag)
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)))
  if (parent) parent.appendChild(e)
  return e
}
function svgTxt(str: string, attrs: Record<string, string | number>, parent: SVGElement) {
  const e = document.createElementNS(NS, 'text')
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)))
  e.textContent = str
  parent.appendChild(e)
  return e
}

// ── Filter Panel ───────────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, onClose }: {
  filters: TimelineFilters
  onChange: (f: TimelineFilters) => void
  onClose: () => void
}) {
  const ROWS: { key: keyof TimelineFilters; label: string; color: string; icon: string }[] = [
    { key: 'sessions', label: 'Sessions', color: 'var(--gold)', icon: '○' },
    { key: 'events',   label: 'Events',   color: '#e05555',    icon: '◆' },
    { key: 'deaths',   label: 'Deaths',   color: '#9b7de8',    icon: '☠' },
  ]
  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 6,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
      minWidth: 200, zIndex: 100, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Show on timeline</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>
      {ROWS.map(row => (
        <button key={row.key}
          onClick={() => onChange({ ...filters, [row.key]: !filters[row.key] })}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left', transition: 'background 80ms' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
        >
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

// ── Year Config Modal ──────────────────────────────────────────────────────────

function YearConfigModal({ currentYear, onSave, onClose }: {
  currentYear: number; onSave: (y: number) => void; onClose: () => void
}) {
  const [year, setYear] = useState(currentYear)
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 320 }}>
        <div className="modal-title">Timeline base year</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
          This sets the in-world year shown on all timeline dates. "Day 1" of the campaign is in this year.
        </div>
        <div className="input-group">
          <label className="input-label">Year</label>
          <input className="input" type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || currentYear)}
            style={{ color: 'var(--gold)', fontWeight: 600 }} autoFocus onKeyDown={e => e.key === 'Enter' && onSave(year)} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(year)}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Create Event Modal ─────────────────────────────────────────────────────────

function CreateEventModal({ onClose, onCreated, baseYear }: { onClose: () => void; onCreated: () => void; baseYear: number }) {
  const { createArticle } = useStore()
  const [title, setTitle] = useState('')
  const [dateRaw, setDateRaw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!title.trim() || !dateRaw) return
    setSaving(true); setError('')
    try {
      const article = await createArticle({ title: title.trim(), article_type: 'event' as ArticleType })
      await window.api.updateArticle(article.id, { tracks: JSON.stringify({ In_World_Date: dateRaw }) })
      onCreated(); onClose()
    } catch { setSaving(false); setError('Failed — title may already exist.') }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-title">New timeline event</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Title</label>
            <input className="input" placeholder="The Library Fire…" value={title}
              onChange={e => setTitle(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            {error && <div style={{ fontSize: 12, color: '#e05555', marginTop: 4 }}>{error}</div>}
          </div>
          <InWorldDatePicker value={dateRaw} onChange={setDateRaw} label="In-world date" baseYear={baseYear} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>Creates an event article. Flesh it out in the Wiki afterwards.</div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!title.trim() || !dateRaw || saving}>
            {saving ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Unplaced Banner ────────────────────────────────────────────────────────────

function UnplacedBanner({ undatedSessions, undatedEvents, baseYear, onSessionDateSet, onEventDateSet }: {
  undatedSessions: (SessionExt & { _arcColor: string })[]
  undatedEvents: { id: number; title: string }[]
  baseYear: number
  onSessionDateSet: (id: number, start: string, end: string) => Promise<void>
  onEventDateSet: (id: number, dateRaw: string) => Promise<void>
}) {
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [activeEvent, setActiveEvent] = useState<number | null>(null)
  const [startRaw, setStartRaw] = useState('')
  const [endRaw, setEndRaw] = useState('')
  const [eventDateRaw, setEventDateRaw] = useState('')
  const [saving, setSaving] = useState(false)

  const total = undatedSessions.length + undatedEvents.length
  if (total === 0) return null

  const handleSaveSession = async () => {
    if (!activeSession || !startRaw) return
    setSaving(true)
    await onSessionDateSet(activeSession, startRaw, endRaw)
    setSaving(false); setActiveSession(null); setStartRaw(''); setEndRaw('')
  }

  const handleSaveEvent = async () => {
    if (!activeEvent || !eventDateRaw) return
    setSaving(true)
    await onEventDateSet(activeEvent, eventDateRaw)
    setSaving(false); setActiveEvent(null); setEventDateRaw('')
  }

  return (
    <div style={{ borderTop: '2px solid #e88c3a55', background: '#e88c3a08', flexShrink: 0 }}>
      <div style={{ padding: '10px 32px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e88c3a', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e88c3a' }}>
            {total} item{total !== 1 ? 's' : ''} not yet placed on timeline
          </span>
        </div>

        {/* Session chips */}
        {undatedSessions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sessions:</span>
            {undatedSessions.map(s => (
              <button key={s.id}
                onClick={() => { setActiveSession(s.id === activeSession ? null : s.id); setActiveEvent(null); setStartRaw(''); setEndRaw('') }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, border: `1px solid ${s.id === activeSession ? s._arcColor : 'var(--border-light)'}`, background: s.id === activeSession ? s._arcColor + '18' : 'transparent', color: s.id === activeSession ? s._arcColor : 'var(--text-muted)', cursor: 'pointer', transition: 'all 100ms' }}>
                <span style={{ fontWeight: 600 }}>{s.session_number}{s.session_sub ?? ''}</span>
                <span style={{ opacity: 0.7 }}>· {s.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Event chips */}
        {undatedEvents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Events:</span>
            {undatedEvents.map(ev => (
              <button key={ev.id}
                onClick={() => { setActiveEvent(ev.id === activeEvent ? null : ev.id); setActiveSession(null); setEventDateRaw('') }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, border: `1px solid ${ev.id === activeEvent ? '#e05555' : 'var(--border-light)'}`, background: ev.id === activeEvent ? '#e0555518' : 'transparent', color: ev.id === activeEvent ? '#e05555' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 100ms' }}>
                {ev.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session date pickers */}
      {activeSession !== null && (
        <div style={{ padding: '0 32px 12px', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: '0 0 210px' }}><InWorldDatePicker value={startRaw} onChange={raw => {
            setStartRaw(raw)
            try { const sd = JSON.parse(raw)?.day; const ed = endRaw ? JSON.parse(endRaw)?.day : null; if (sd != null && (ed == null || ed < sd)) setEndRaw(raw) } catch {}
          }} label="Start date" baseYear={baseYear} /></div>
          <div style={{ flex: '0 0 210px' }}><InWorldDatePicker value={endRaw} onChange={raw => {
            try { const sd = startRaw ? JSON.parse(startRaw)?.day : null; const ed = JSON.parse(raw)?.day; setEndRaw(sd != null && ed != null && ed < sd ? startRaw : raw) } catch { setEndRaw(raw) }
          }} label="End date (optional)" baseYear={baseYear} /></div>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setActiveSession(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSaveSession} disabled={!startRaw || saving}>
              {saving ? 'Saving…' : 'Place session'}
            </button>
          </div>
        </div>
      )}

      {/* Event date picker */}
      {activeEvent !== null && (
        <div style={{ padding: '0 32px 12px', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: '0 0 210px' }}><InWorldDatePicker value={eventDateRaw} onChange={setEventDateRaw} label="Event date" baseYear={baseYear} /></div>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setActiveEvent(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSaveEvent} disabled={!eventDateRaw || saving}>
              {saving ? 'Saving…' : 'Place event'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ item, baseYear, onOpenArticle, onOpenSession, onSaveSessionDate, onSaveItemDate }: {
  item: SelectedItem | null
  baseYear: number
  onOpenArticle: (id: number) => void
  onOpenSession: (id: number) => void
  onSaveSessionDate: (id: number, start: string, end: string) => Promise<void>
  onSaveItemDate: (id: number, dateRaw: string, kind: 'event' | 'death') => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [startRaw, setStartRaw] = useState('')
  const [endRaw, setEndRaw] = useState('')
  const [dateRaw, setDateRaw] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset editor when selection changes
  useEffect(() => { setEditing(false); setStartRaw(''); setEndRaw(''); setDateRaw('') }, [item?.id, item?.kind])

  if (!item) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
        Click any session, event, or death to see details
      </div>
    )
  }

  const color = item.kind === 'session' ? (item.arcColor ?? 'var(--gold)')
    : item.kind === 'death' ? '#9b7de8'
    : (ARTICLE_TYPE_COLORS[item.articleType ?? 'event'] ?? '#e05555')

  const dateLabel = item.dayEnd && item.dayEnd > item.day
    ? `Day ${item.day}–${item.dayEnd}, Year ${item.year} (${item.dayEnd - item.day + 1} days)`
    : `Day ${item.day}, Year ${item.year}${item.day <= 0 ? ' (pre-campaign)' : ''}`

  const handleSave = async () => {
    setSaving(true)
    if (item.kind === 'session') {
      // Build raw strings from current values if not changed
      const s = startRaw || JSON.stringify({ day: item.day, year: item.year, label: '' })
      const e = endRaw || (item.dayEnd ? JSON.stringify({ day: item.dayEnd, year: item.year, label: '' }) : '')
      await onSaveSessionDate(item.id, s, e)
    } else {
      const d = dateRaw || JSON.stringify({ day: item.day, year: item.year, label: '' })
      await onSaveItemDate(item.id, d, item.kind)
    }
    setSaving(false)
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: color + '18', color, border: `0.5px solid ${color}44` }}>
              {item.kind === 'session' ? `Session ${item.sessionNum}` : item.kind === 'death' ? `Death · ${item.articleType}` : `Event · ${item.articleType}`}
            </span>
            {item.kind === 'session' && item.arcName && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.arcName}</span>}
            {/* Date display / edit trigger */}
            <button
              onClick={() => {
                setEditing(v => !v)
                if (!editing) {
                  setStartRaw(JSON.stringify({ day: item.day, year: item.year, label: dateLabel }))
                  setEndRaw(item.dayEnd && item.dayEnd > item.day ? JSON.stringify({ day: item.dayEnd, year: item.year, label: '' }) : '')
                  setDateRaw(JSON.stringify({ day: item.day, year: item.year, label: dateLabel }))
                }
              }}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: 'none', border: `1px solid ${editing ? color + '55' : 'var(--border-light)'}`, borderRadius: 'var(--radius-sm)', padding: '2px 8px', color: editing ? color : item.day <= 0 ? '#e88c3a' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms' }}
              onMouseEnter={e => { if (!editing) (e.currentTarget as HTMLElement).style.borderColor = color + '55'; (e.currentTarget as HTMLElement).style.color = color }}
              onMouseLeave={e => { if (!editing) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = item.day <= 0 ? '#e88c3a' : 'var(--text-muted)' } }}
            >
              ✎ {dateLabel}
            </button>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title}
          </div>
        </div>
        <button
          onClick={() => item.kind === 'session' ? onOpenSession(item.id) : onOpenArticle(item.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11, background: color + '18', border: `0.5px solid ${color}44`, borderRadius: 'var(--radius-sm)', color, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <ExternalLink size={11} /> {item.kind === 'session' ? 'Open session' : 'Open article'}
        </button>
      </div>

      {/* Inline date editor */}
      {editing && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: `1px solid ${color}33` }}>
          {item.kind === 'session' ? (
            <>
              <div style={{ flex: '0 0 200px' }}><InWorldDatePicker value={startRaw} onChange={raw => {
                setStartRaw(raw)
                try { const sd = JSON.parse(raw)?.day; const ed = endRaw ? JSON.parse(endRaw)?.day : null; if (sd != null && (ed == null || ed < sd)) setEndRaw(raw) } catch {}
              }} label="Start date" baseYear={baseYear} /></div>
              <div style={{ flex: '0 0 200px' }}><InWorldDatePicker value={endRaw} onChange={raw => {
                try { const sd = startRaw ? JSON.parse(startRaw)?.day : null; const ed = JSON.parse(raw)?.day; setEndRaw(sd != null && ed != null && ed < sd ? startRaw : raw) } catch { setEndRaw(raw) }
              }} label="End date (optional)" baseYear={baseYear} /></div>
            </>
          ) : (
            <div style={{ flex: '0 0 200px' }}><InWorldDatePicker value={dateRaw} onChange={setDateRaw} label="Date" baseYear={baseYear} /></div>
          )}
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save date'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Timeline Page ─────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { currentCampaign, sessions, arcs, setView, openArticle, selectSession, setCampaignSubView, updateSession, updateCampaign } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<TimelineItem[]>([]) // events + deaths
  const [undatedEvents, setUndatedEvents] = useState<{ id: number; title: string }[]>([])
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM)
  const [filters, setFilters] = useState<TimelineFilters>(() => currentCampaign ? loadFilters(currentCampaign.id) : { ...DEFAULT_FILTERS })
  const [showFilter, setShowFilter] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showYearConfig, setShowYearConfig] = useState(false)
  const [baseYear, setBaseYear] = useState<number>((currentCampaign as any)?.timeline_base_year ?? 1507)

  const PX_PER_DAY = ZOOM_LEVELS[zoomIdx]

  // Reload year from campaign when it changes
  useEffect(() => {
    setBaseYear((currentCampaign as any)?.timeline_base_year ?? 1507)
  }, [currentCampaign?.id])

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilter) return
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showFilter])

  // Sync filters to localStorage
  useEffect(() => {
    if (currentCampaign) { setFilters(loadFilters(currentCampaign.id)) }
  }, [currentCampaign?.id])
  const handleFiltersChange = (f: TimelineFilters) => {
    setFilters(f)
    if (currentCampaign) saveFilters(currentCampaign.id, f)
  }

  const loadItems = useCallback(async () => {
    if (!currentCampaign) return
    const list = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    const result: TimelineItem[] = []
    const undated: { id: number; title: string }[] = []

    list.forEach((a: any) => {
      try {
        const t = JSON.parse(a.tracks ?? '{}')

        // Event articles with In_World_Date
        if (a.article_type === 'event') {
          const d = parseInWorldDate(t.In_World_Date)
          if (d) result.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'event', article_type: a.article_type, color: '#e05555' })
          else undated.push({ id: a.id, title: a.title })
        }

        // Character/playerCharacter death dates
        if (a.article_type === 'character' || a.article_type === 'playerCharacter') {
          const d = parseInWorldDate(t.Death_Date)
          if (d) result.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'death', article_type: a.article_type, color: '#9b7de8', articleId: a.id })
        }
      } catch {}
    })

    setItems(result)
    setUndatedEvents(undated)
  }, [currentCampaign?.id])

  useEffect(() => { loadItems() }, [loadItems])

  const arcMap = Object.fromEntries(arcs.map(a => [a.id, a]))
  const datedSessions = (sessions as SessionExt[]).filter(s => s.in_world_day)
  const undatedSessions = (sessions as SessionExt[])
    .filter(s => !s.in_world_day)
    .map(s => ({ ...s, _arcColor: arcMap[s.arc_id ?? 0]?.color ?? '#8a8a8a' }))

  // Compute axis bounds — support negative days
  const allDays = [
    ...datedSessions.flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!]),
    ...items.map(e => e.day),
    1,
  ]
  const minDay = Math.min(...allDays) - 5
  const maxDay = Math.max(...allDays) + 20
  const TOTAL_DAYS = maxDay - minDay
  const CANVAS_W = PAD_L + TOTAL_DAYS * PX_PER_DAY + PAD_R

  const dx = useCallback((day: number) => PAD_L + (day - minDay) * PX_PER_DAY, [minDay, PX_PER_DAY])

  // Arc spans
  const arcSpans = arcs.map(arc => {
    const days = datedSessions.filter(s => s.arc_id === arc.id).flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!])
    if (days.length === 0) return null
    return { arc, start: Math.min(...days), end: Math.max(...days) }
  }).filter(Boolean) as { arc: typeof arcs[0]; start: number; end: number }[]

  const sortedDated = [...datedSessions].sort((a, b) => (a.in_world_day ?? 0) - (b.in_world_day ?? 0))

  // Render SVG
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.innerHTML = ''
    svg.setAttribute('width', String(CANVAS_W))
    svg.setAttribute('height', String(AXIS_Y + 50))

    // Pre-campaign shaded region
    if (minDay < 1) {
      const x1 = dx(minDay), x2 = dx(1)
      svgEl('rect', { x: x1, y: 0, width: x2 - x1, height: AXIS_Y + 50, fill: '#e88c3a08' }, svg)
      svgEl('line', { x1: x2, y1: 0, x2: x2, y2: AXIS_Y + 50, stroke: '#e88c3a22', 'stroke-width': '1', 'stroke-dasharray': '4 3' }, svg)
      svgTxt('Pre-campaign', { x: x1 + (x2 - x1) / 2, y: AXIS_Y + 44, 'text-anchor': 'middle', fill: '#e88c3a55', 'font-size': '9', 'font-family': 'sans-serif' }, svg)
    }

    // Axis
    svgEl('line', { x1: PAD_L - 10, y1: AXIS_Y, x2: CANVAS_W - PAD_R + 16, y2: AXIS_Y, stroke: '#3a3828', 'stroke-width': '1.5' }, svg)
    svgEl('polygon', { points: `${CANVAS_W - PAD_R + 16},${AXIS_Y} ${CANVAS_W - PAD_R + 8},${AXIS_Y - 4} ${CANVAS_W - PAD_R + 8},${AXIS_Y + 4}`, fill: '#3a3828' }, svg)

    // Tick spacing adapts to zoom
    const tickStep = PX_PER_DAY <= 6 ? 20 : PX_PER_DAY <= 10 ? 10 : PX_PER_DAY <= 18 ? 5 : 1
    const firstTick = Math.ceil(minDay / tickStep) * tickStep
    for (let d = firstTick; d <= maxDay; d += tickStep) {
      const x = dx(d)
      svgEl('line', { x1: x, y1: AXIS_Y, x2: x, y2: AXIS_Y + 7, stroke: '#2a2820', 'stroke-width': '1' }, svg)
      svgTxt(`D${d}`, { x, y: AXIS_Y + 18, 'text-anchor': 'middle', fill: d <= 0 ? '#6b5040' : '#4a4840', 'font-size': '9', 'font-family': 'sans-serif' }, svg)
    }
    svgTxt(`Year ${baseYear}`, { x: PAD_L, y: AXIS_Y + 30, 'text-anchor': 'start', fill: '#3a3628', 'font-size': '9', 'font-family': 'sans-serif' }, svg)

    // Arc tubes
    arcSpans.forEach(({ arc, start, end }) => {
      const x1 = dx(start), x2 = dx(end), w = x2 - x1
      const g = svgEl('g', {}, svg)
      svgEl('rect', { x: x1, y: ARC_Y, width: Math.max(w, 12), height: ARC_H, rx: '7', fill: arc.color + '28', stroke: arc.color + '55', 'stroke-width': '1' }, g)
      if (w > 70) svgTxt(arc.name, { x: x1 + Math.max(w, 12) / 2, y: ARC_Y + ARC_H / 2 + 3.5, 'text-anchor': 'middle', fill: arc.color, 'font-size': '9', 'font-family': 'sans-serif', 'font-weight': '600' }, g)
    })

    // Sessions
    if (filters.sessions) {
      sortedDated.forEach(s => {
        const arc = arcMap[s.arc_id ?? 0]
        const color = arc?.color ?? '#8a8a8a'
        const startX = dx(s.in_world_day!)
        const endDay = s.in_world_day_end ?? s.in_world_day!
        const endX = dx(endDay)
        const isMultiDay = endDay > s.in_world_day!
        const isSel = selected?.kind === 'session' && selected.id === s.id
        const R = isSel ? 15 : 12

        const g = svgEl('g', { style: 'cursor:pointer' }, svg)
        g.addEventListener('click', () => setSelected({
          kind: 'session', id: s.id, title: s.name, day: s.in_world_day!, dayEnd: endDay,
          year: baseYear, arcColor: color, arcName: arc?.name,
          sessionNum: `${s.session_number}${s.session_sub ?? ''}`,
        }))

        if (isMultiDay) {
          svgEl('rect', { x: startX, y: SESSION_PILL_Y, width: endX - startX, height: SESSION_PILL_H, rx: '5', fill: isSel ? color + '44' : color + '22', stroke: color, 'stroke-width': isSel ? '2' : '1' }, g)
          svgEl('line', { x1: startX, y1: SESSION_DOT_Y + R, x2: startX, y2: SESSION_PILL_Y, stroke: color + '55', 'stroke-width': '1', 'stroke-dasharray': '2 2' }, g)
          svgEl('line', { x1: endX, y1: SESSION_PILL_Y, x2: endX, y2: SESSION_PILL_Y + SESSION_PILL_H, stroke: color, 'stroke-width': '1' }, g)
        } else {
          svgEl('line', { x1: startX, y1: SESSION_DOT_Y + R, x2: startX, y2: ARC_Y, stroke: color + '44', 'stroke-width': '1', 'stroke-dasharray': '3 2' }, g)
        }

        svgEl('circle', { cx: startX, cy: SESSION_DOT_Y, r: R, fill: isSel ? color + '44' : color + '1a', stroke: color, 'stroke-width': isSel ? '2' : '1.5' }, g)
        svgTxt(`${s.session_number}${s.session_sub ?? ''}`, { x: startX, y: SESSION_DOT_Y + 4, 'text-anchor': 'middle', fill: color, 'font-size': '9', 'font-weight': '600', 'font-family': 'sans-serif' }, g)

        const words = s.name.split(' '); const half = Math.ceil(words.length / 2)
        svgTxt(words.slice(0, half).join(' '), { x: startX, y: SESSION_DOT_Y - R - 10, 'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif' }, g)
        if (words.length > half) svgTxt(words.slice(half).join(' '), { x: startX, y: SESSION_DOT_Y - R - 2, 'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif' }, g)
      })
    }

    // Events + Deaths
    items.forEach(item => {
      if (item.kind === 'event' && !filters.events) return
      if (item.kind === 'death' && !filters.deaths) return

      const x = dx(item.day)
      const isSel = selected?.id === item.id && selected.kind === item.kind
      const S = isSel ? 9 : 7
      const yPos = item.kind === 'death' ? DEATH_Y : EVENT_Y
      const connTop = item.kind === 'death' ? yPos - S : yPos + S
      const connBot = item.kind === 'death' ? AXIS_Y : (filters.sessions ? SESSION_DOT_Y - 16 : ARC_Y)

      const g = svgEl('g', { style: 'cursor:pointer' }, svg)
      g.addEventListener('click', () => setSelected({
        kind: item.kind, id: item.id, title: item.title, day: item.day, year: item.year,
        articleType: item.article_type, arcColor: item.color,
      }))

      svgEl('line', {
        x1: x, y1: item.kind === 'death' ? connTop : connTop,
        x2: x, y2: connBot,
        stroke: item.color + '44', 'stroke-width': '1', 'stroke-dasharray': '2 3'
      }, g)

      if (item.kind === 'death') {
        // Skull diamond below axis
        svgEl('polygon', {
          points: `${x},${yPos - S} ${x + S},${yPos} ${x},${yPos + S} ${x - S},${yPos}`,
          fill: isSel ? item.color + '55' : item.color + '22',
          stroke: item.color, 'stroke-width': isSel ? '2' : '1.5',
        }, g)
        svgTxt('☠', { x, y: yPos + 3.5, 'text-anchor': 'middle', fill: item.color, 'font-size': '7', 'font-family': 'sans-serif' }, g)
        svgTxt(item.title, { x, y: yPos + S + 10, 'text-anchor': 'middle', fill: item.color, 'font-size': '8', 'font-family': 'sans-serif' }, g)
      } else {
        // Diamond above axis
        svgEl('polygon', {
          points: `${x},${yPos - S} ${x + S},${yPos} ${x},${yPos + S} ${x - S},${yPos}`,
          fill: isSel ? item.color + '55' : item.color + '1a',
          stroke: item.color, 'stroke-width': isSel ? '2' : '1.5',
        }, g)
        svgTxt(item.title, { x, y: yPos - S - 5, 'text-anchor': 'middle', fill: item.color, 'font-size': '8', 'font-family': 'sans-serif' }, g)
      }
    })

  }, [datedSessions, arcs, items, selected, filters, CANVAS_W, baseYear, arcSpans, sortedDated, dx, PX_PER_DAY, minDay, maxDay])

  // Scroll to latest session (highest session_number) on mount/data change
  useEffect(() => {
    if (!scrollRef.current) return
    const dated = (sessions as SessionExt[]).filter(s => s.in_world_day)
    if (dated.length === 0) return
    const latest = [...dated].sort((a, b) => b.session_number - a.session_number)[0]
    const targetDay = latest.in_world_day!
    // Recompute dx inline so we always use current values
    const allD = [
      ...dated.flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!]),
      1,
    ]
    const mn = Math.min(...allD) - 5
    const x = PAD_L + (targetDay - mn) * PX_PER_DAY
    scrollRef.current.scrollLeft = Math.max(0, x - scrollRef.current.clientWidth * 0.6)
  }, [sessions, items.length, PX_PER_DAY])

  const handleSessionDateSet = useCallback(async (sessionId: number, startRaw: string, endRaw: string) => {
    const sd = (() => { try { return JSON.parse(startRaw)?.day ?? null } catch { return null } })()
    const ed = (() => { try { return JSON.parse(endRaw)?.day ?? null } catch { return null } })()
    if (!sd) return
    await updateSession(sessionId, { in_world_day: sd, in_world_day_end: ed } as any)
  }, [updateSession])

  const handleEventDateSet = useCallback(async (eventId: number, dateRaw: string) => {
    const article = await window.api.getArticle(eventId)
    const existingTracks = (() => { try { return JSON.parse(article?.tracks ?? '{}') } catch { return {} } })()
    await window.api.updateArticle(eventId, { tracks: JSON.stringify({ ...existingTracks, In_World_Date: dateRaw }) })
    loadItems()
  }, [items, loadItems])

  const handleSaveYear = useCallback(async (y: number) => {
    if (!currentCampaign) return
    await updateCampaign(currentCampaign.id, { timeline_base_year: y } as any)
    setBaseYear(y)
    setShowYearConfig(false)
  }, [currentCampaign, updateCampaign])

  const handleSaveItemDate = useCallback(async (id: number, dateRaw: string, kind: 'event' | 'death') => {
    const article = await window.api.getArticle(id)
    const existingTracks = (() => { try { return JSON.parse(article?.tracks ?? '{}') } catch { return {} } })()
    const trackKey = kind === 'death' ? 'Death_Date' : 'In_World_Date'
    await window.api.updateArticle(id, { tracks: JSON.stringify({ ...existingTracks, [trackKey]: dateRaw }) })
    // If death date updated, also set Vitality to Dead
    if (kind === 'death') {
      await window.api.updateArticle(id, { tracks: JSON.stringify({ ...existingTracks, [trackKey]: dateRaw, Vitality: 'Dead' }) })
    }
    setSelected(null)
    loadItems()
  }, [loadItems])

  const handleOpenSession = useCallback((id: number) => {
    const s = sessions.find(s => s.id === id)
    if (!s) return; selectSession(s); setView('session')
  }, [sessions, selectSession, setView])

  const handleOpenArticle = useCallback(async (id: number) => {
    await openArticle(id); setView('wiki')
  }, [openArticle, setView])

  const activeFilterCount = Object.values(filters).filter(v => !v).length

  const pillStyle = (active: boolean, color = 'var(--gold)'): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
    border: `0.5px solid ${active ? color + '55' : 'var(--border-light)'}`,
    background: active ? color + '11' : 'none', color: active ? color : 'var(--text-muted)', transition: 'all 120ms',
  })

  const zoomBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-light)', background: 'var(--bg-elevated)',
    color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms', flexShrink: 0,
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
              <ArrowLeft size={14} /> Back
            </button>
            <Clock size={20} color='#e88c3a' />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, letterSpacing: '0.03em', color: 'var(--text-primary)', margin: 0 }}>Timeline</h1>
            <button onClick={() => setShowYearConfig(true)} title="Configure base year"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: 11, color: 'var(--gold)', cursor: 'pointer' }}>
              <Settings size={10} /> Year {baseYear}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {datedSessions.length} sessions · {items.filter(i => i.kind === 'event').length} events · {items.filter(i => i.kind === 'death').length} deaths
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Zoom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderRight: '1px solid var(--border)', paddingRight: 10, marginRight: 2 }}>
              <button style={zoomBtnStyle} onClick={() => setZoomIdx(i => Math.max(0, i - 1))} disabled={zoomIdx === 0}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
                <ZoomOut size={13} />
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 28, textAlign: 'center' }}>{PX_PER_DAY}px</span>
              <button style={zoomBtnStyle} onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
                <ZoomIn size={13} />
              </button>
            </div>

            {/* Filter */}
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFilter(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: showFilter ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = showFilter ? 'var(--bg-elevated)' : 'transparent'}
              >
                <Filter size={13} /> Filter
                {activeFilterCount > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />}
              </button>
              {showFilter && <FilterPanel filters={filters} onChange={handleFiltersChange} onClose={() => setShowFilter(false)} />}
            </div>

            <button onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', transition: 'all 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}>
              <Plus size={13} /> Add event
            </button>
          </div>
        </div>
      </div>

      {/* Timeline scroll */}
      <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', flexShrink: 0, padding: '32px 0 0', background: 'var(--bg-base)' }}>
        <svg ref={svgRef} style={{ display: 'block', overflow: 'visible' }} />
        <div style={{ height: 20 }} />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 32px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface)' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Legend</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#8a8a8a22" stroke="#8a8a8a" strokeWidth="1.2" /></svg> Session
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <svg width="28" height="10"><rect x="0" y="1" width="28" height="8" rx="4" fill="#8a8a8a22" stroke="#8a8a8a" strokeWidth="1" /></svg> Multi-day
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <svg width="14" height="14"><polygon points="7,1 13,7 7,13 1,7" fill="#e0555522" stroke="#e05555" strokeWidth="1.2" /></svg> Event
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <svg width="14" height="14"><polygon points="7,1 13,7 7,13 1,7" fill="#9b7de822" stroke="#9b7de8" strokeWidth="1.2" /></svg> Death
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <div style={{ width: 24, height: 8, borderRadius: 4, background: '#8a8a8a22', border: '1px solid #8a8a8a44' }} /> Arc
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#e88c3a88', marginLeft: 'auto' }}>
          <div style={{ width: 12, height: 12, background: '#e88c3a22', border: '1px solid #e88c3a44', borderRadius: 2 }} /> Pre-campaign region
        </div>
      </div>

      {/* Unplaced banner */}
      <UnplacedBanner
        undatedSessions={undatedSessions}
        undatedEvents={undatedEvents}
        baseYear={baseYear}
        onSessionDateSet={handleSessionDateSet}
        onEventDateSet={handleEventDateSet}
      />

      {/* Detail panel */}
      <div style={{ flex: 1, padding: '14px 32px', background: 'var(--bg-elevated)', minHeight: 0, overflow: 'auto' }}>
        <DetailPanel
          item={selected}
          baseYear={baseYear}
          onOpenArticle={handleOpenArticle}
          onOpenSession={handleOpenSession}
          onSaveSessionDate={handleSessionDateSet}
          onSaveItemDate={handleSaveItemDate}
        />
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreated={loadItems} baseYear={baseYear} />}
      {showYearConfig && <YearConfigModal currentYear={baseYear} onSave={handleSaveYear} onClose={() => setShowYearConfig(false)} />}
    </div>
  )
}