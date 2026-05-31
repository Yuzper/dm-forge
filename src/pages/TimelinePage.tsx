// path: src/pages/TimelinePage.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/store'
import { Clock, Plus, ArrowLeft, ExternalLink, Filter, ZoomIn, ZoomOut, Settings, X } from 'lucide-react'
import { parseInWorldDate, InWorldDatePicker } from '../components/InWorldDatePicker'
import type { ArticleType, Session } from '../types'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'
import {
  ZoomLevel, ZOOM_LABEL, ZOOM_ORDER, YEAR_LENGTH,
  isYearMode, dayToWorldYear, computeBins,
  makePageAxisGeo,
} from '../utils/timelineGeometry'
import {
  renderAxis, renderDayTicks, renderLogBreak,
  renderYearBands, renderYearTicks, renderBinChips,
  renderArcTubes, renderClusters,
  type TimelineEventItem, type ClusterItem,
} from '../utils/timelineSvg'

// ── Layout constants ───────────────────────────────────────────────────────────

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
const TOTAL_H = AXIS_Y + 50

const DAY_ZOOM_LEVELS = [4, 6, 8, 10, 14, 18, 24, 32]
const DEFAULT_DAY_ZOOM = 4

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimelineFilters {
  sessions: boolean; events: boolean; deaths: boolean
}
const DEFAULT_FILTERS: TimelineFilters = { sessions: true, events: true, deaths: true }

function loadFilters(id: number): TimelineFilters {
  try { const s = localStorage.getItem(`timeline-filters-${id}`); if (s) return { ...DEFAULT_FILTERS, ...JSON.parse(s) } } catch {}
  return { ...DEFAULT_FILTERS }
}
function saveFilters(id: number, f: TimelineFilters) {
  localStorage.setItem(`timeline-filters-${id}`, JSON.stringify(f))
}

interface SelectedItem {
  kind: 'session' | 'event' | 'death'
  id: number; title: string; day: number; dayEnd?: number; year: number
  arcColor?: string; arcName?: string; sessionNum?: string; articleType?: string
}

interface BinTooltip { label: string; syCount: number; evCount: number; items: { title: string; kind: string }[]; x: number; y: number; nextZoom: ZoomLevel }
interface DayTooltip { items: ClusterItem[]; x: number; y: number }

// ── Filter Panel ───────────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, onClose }: {
  filters: TimelineFilters; onChange: (f: TimelineFilters) => void; onClose: () => void
}) {
  const ROWS = [
    { key: 'sessions' as const, label: 'Sessions', color: 'var(--gold)', icon: '○' },
    { key: 'events'   as const, label: 'Events',   color: '#e05555',    icon: '◆' },
    { key: 'deaths'   as const, label: 'Deaths',   color: '#9b7de8',    icon: '☠' },
  ]
  return (
    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 200, zIndex: 100, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Show on timeline</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>
      {ROWS.map(row => (
        <button key={row.key} onClick={() => onChange({ ...filters, [row.key]: !filters[row.key] })}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left', transition: 'background 80ms' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
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

function YearConfigModal({ currentYear, onSave, onClose }: { currentYear: number; onSave: (y: number) => void; onClose: () => void }) {
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
              onChange={e => setTitle(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
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
  undatedSessions: (Session & { _arcColor: string })[]
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
    setSaving(true); await onSessionDateSet(activeSession, startRaw, endRaw)
    setSaving(false); setActiveSession(null); setStartRaw(''); setEndRaw('')
  }
  const handleSaveEvent = async () => {
    if (!activeEvent || !eventDateRaw) return
    setSaving(true); await onEventDateSet(activeEvent, eventDateRaw)
    setSaving(false); setActiveEvent(null); setEventDateRaw('')
  }

  return (
    <div style={{ borderTop: '2px solid #e88c3a55', background: '#e88c3a08', flexShrink: 0 }}>
      <div style={{ padding: '10px 32px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e88c3a', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e88c3a' }}>{total} item{total !== 1 ? 's' : ''} not yet placed on timeline</span>
        </div>
        {undatedSessions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sessions:</span>
            {undatedSessions.map(s => (
              <button key={s.id}
                onClick={() => { setActiveSession(s.id === activeSession ? null : s.id); setActiveEvent(null); setStartRaw(''); setEndRaw('') }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, border: `1px solid ${s.id === activeSession ? s._arcColor : 'var(--border-light)'}`, background: s.id === activeSession ? s._arcColor + '18' : 'transparent', color: s.id === activeSession ? s._arcColor : 'var(--text-muted)', cursor: 'pointer' }}>
                <span style={{ fontWeight: 600 }}>{s.session_number}{s.session_sub ?? ''}</span>
                <span style={{ opacity: 0.7 }}>· {s.name}</span>
              </button>
            ))}
          </div>
        )}
        {undatedEvents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Events:</span>
            {undatedEvents.map(ev => (
              <button key={ev.id}
                onClick={() => { setActiveEvent(ev.id === activeEvent ? null : ev.id); setActiveSession(null); setEventDateRaw('') }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, border: `1px solid ${ev.id === activeEvent ? '#e05555' : 'var(--border-light)'}`, background: ev.id === activeEvent ? '#e0555518' : 'transparent', color: ev.id === activeEvent ? '#e05555' : 'var(--text-muted)', cursor: 'pointer' }}>
                {ev.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {activeSession !== null && (
        <div style={{ padding: '0 32px 12px', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: '0 0 210px' }}><InWorldDatePicker value={startRaw} onChange={raw => { setStartRaw(raw); try { const sd = JSON.parse(raw)?.day; const ed = endRaw ? JSON.parse(endRaw)?.day : null; if (sd != null && (ed == null || ed < sd)) setEndRaw(raw) } catch {} }} label="Start date" baseYear={baseYear} /></div>
          <div style={{ flex: '0 0 210px' }}><InWorldDatePicker value={endRaw} onChange={raw => { try { const sd = startRaw ? JSON.parse(startRaw)?.day : null; const ed = JSON.parse(raw)?.day; setEndRaw(sd != null && ed != null && ed < sd ? startRaw : raw) } catch { setEndRaw(raw) } }} label="End date (optional)" baseYear={baseYear} /></div>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setActiveSession(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSaveSession} disabled={!startRaw || saving}>{saving ? 'Saving…' : 'Place session'}</button>
          </div>
        </div>
      )}
      {activeEvent !== null && (
        <div style={{ padding: '0 32px 12px', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: '0 0 210px' }}><InWorldDatePicker value={eventDateRaw} onChange={setEventDateRaw} label="Event date" baseYear={baseYear} /></div>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setActiveEvent(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSaveEvent} disabled={!eventDateRaw || saving}>{saving ? 'Saving…' : 'Place event'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ item, baseYear, onOpenArticle, onOpenSession, onSaveSessionDate, onSaveItemDate }: {
  item: SelectedItem | null; baseYear: number
  onOpenArticle: (id: number) => void; onOpenSession: (id: number) => void
  onSaveSessionDate: (id: number, start: string, end: string) => Promise<void>
  onSaveItemDate: (id: number, dateRaw: string, kind: 'event' | 'death') => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [startRaw, setStartRaw] = useState('')
  const [endRaw, setEndRaw] = useState('')
  const [dateRaw, setDateRaw] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setEditing(false); setStartRaw(''); setEndRaw(''); setDateRaw('') }, [item?.id, item?.kind])

  if (!item) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
      Click any session, event, or death to see details
    </div>
  )

  const color = item.kind === 'session' ? (item.arcColor ?? 'var(--gold)')
    : item.kind === 'death' ? '#9b7de8'
    : (ARTICLE_TYPE_COLORS[item.articleType ?? 'event'] ?? '#e05555')

  const dateLabel = item.dayEnd && item.dayEnd > item.day
    ? `Day ${item.day}–${item.dayEnd}, Year ${item.year} (${item.dayEnd - item.day + 1} days)`
    : `Day ${item.day}, Year ${item.year}${item.day <= 0 ? ' (pre-campaign)' : ''}`

  const handleSave = async () => {
    setSaving(true)
    if (item.kind === 'session') {
      await onSaveSessionDate(item.id, startRaw || JSON.stringify({ day: item.day, year: item.year, label: '' }), endRaw || (item.dayEnd ? JSON.stringify({ day: item.dayEnd, year: item.year, label: '' }) : ''))
    } else {
      await onSaveItemDate(item.id, dateRaw || JSON.stringify({ day: item.day, year: item.year, label: '' }), item.kind)
    }
    setSaving(false); setEditing(false)
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
            <button onClick={() => { setEditing(v => !v); if (!editing) { setStartRaw(JSON.stringify({ day: item.day, year: item.year, label: dateLabel })); setEndRaw(item.dayEnd && item.dayEnd > item.day ? JSON.stringify({ day: item.dayEnd, year: item.year, label: '' }) : ''); setDateRaw(JSON.stringify({ day: item.day, year: item.year, label: dateLabel })) } }}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: 'none', border: `1px solid ${editing ? color + '55' : 'var(--border-light)'}`, borderRadius: 'var(--radius-sm)', padding: '2px 8px', color: editing ? color : item.day <= 0 ? '#e88c3a' : 'var(--text-muted)', cursor: 'pointer' }}>
              ✎ {dateLabel}
            </button>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
        </div>
        <button onClick={() => item.kind === 'session' ? onOpenSession(item.id) : onOpenArticle(item.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11, background: color + '18', border: `0.5px solid ${color}44`, borderRadius: 'var(--radius-sm)', color, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <ExternalLink size={11} /> {item.kind === 'session' ? 'Open session' : 'Open article'}
        </button>
      </div>
      {editing && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: `1px solid ${color}33` }}>
          {item.kind === 'session' ? (
            <>
              <div style={{ flex: '0 0 200px' }}><InWorldDatePicker value={startRaw} onChange={raw => { setStartRaw(raw); try { const sd = JSON.parse(raw)?.day; const ed = endRaw ? JSON.parse(endRaw)?.day : null; if (sd != null && (ed == null || ed < sd)) setEndRaw(raw) } catch {} }} label="Start date" baseYear={baseYear} /></div>
              <div style={{ flex: '0 0 200px' }}><InWorldDatePicker value={endRaw} onChange={raw => { try { const sd = startRaw ? JSON.parse(startRaw)?.day : null; const ed = JSON.parse(raw)?.day; setEndRaw(sd != null && ed != null && ed < sd ? startRaw : raw) } catch { setEndRaw(raw) } }} label="End date (optional)" baseYear={baseYear} /></div>
            </>
          ) : (
            <div style={{ flex: '0 0 200px' }}><InWorldDatePicker value={dateRaw} onChange={setDateRaw} label="Date" baseYear={baseYear} /></div>
          )}
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save date'}</button>
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

  const [items, setItems] = useState<TimelineEventItem[]>([])
  const [undatedEvents, setUndatedEvents] = useState<{ id: number; title: string }[]>([])
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [zoom, setZoom] = useState<ZoomLevel>('day')
  const [dayZoomIdx, setDayZoomIdx] = useState(DEFAULT_DAY_ZOOM)
  const [filters, setFilters] = useState<TimelineFilters>(() => currentCampaign ? loadFilters(currentCampaign.id) : DEFAULT_FILTERS)
  const [showFilter, setShowFilter] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showYearConfig, setShowYearConfig] = useState(false)
  const [baseYear, setBaseYear] = useState<number>((currentCampaign as any)?.timeline_base_year ?? 1507)
  const [binTooltip, setBinTooltip] = useState<BinTooltip | null>(null)
  const [dayTooltip, setDayTooltip] = useState<DayTooltip | null>(null)

  const pxPerDay = DAY_ZOOM_LEVELS[dayZoomIdx]

  useEffect(() => { setBaseYear((currentCampaign as any)?.timeline_base_year ?? 1507) }, [currentCampaign?.id])

  useEffect(() => {
    if (!showFilter) return
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showFilter])

  useEffect(() => {
    if (currentCampaign) setFilters(loadFilters(currentCampaign.id))
  }, [currentCampaign?.id])

  const handleFiltersChange = (f: TimelineFilters) => {
    setFilters(f); if (currentCampaign) saveFilters(currentCampaign.id, f)
  }

  const loadItems = useCallback(async () => {
    if (!currentCampaign) return
    const list = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    const result: TimelineEventItem[] = []
    const undated: { id: number; title: string }[] = []
    list.forEach((a: any) => {
      try {
        const t = JSON.parse(a.tracks ?? '{}')
        if (a.article_type === 'event') {
          const d = parseInWorldDate(t.In_World_Date)
          if (d) result.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'event', article_type: a.article_type, color: '#e05555' })
          else undated.push({ id: a.id, title: a.title })
        }
        if (a.article_type === 'character' || a.article_type === 'playerCharacter') {
          const d = parseInWorldDate(t.Death_Date)
          if (d) result.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'death', article_type: a.article_type, color: '#9b7de8', articleId: a.id })
        }
      } catch {}
    })
    setItems(result); setUndatedEvents(undated)
  }, [currentCampaign?.id])

  useEffect(() => { loadItems() }, [loadItems])

  const arcMap = Object.fromEntries(arcs.map(a => [a.id, a]))
  const datedSessions = sessions.filter(s => s.in_world_day)
  const undatedSessions = sessions.filter(s => !s.in_world_day).map(s => ({ ...s, _arcColor: arcMap[s.arc_id ?? 0]?.color ?? '#8a8a8a' }))

  const allDays = [
    ...datedSessions.flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!]),
    ...items.map(e => e.day), 1,
  ]
  const minDay = Math.min(...allDays) - 5
  const maxDay = Math.max(...allDays) + 20

  const geo = makePageAxisGeo(zoom, PAD_L, minDay, pxPerDay, baseYear)
  const { dx, worldYearToX, canvasWidth } = geo
  const CANVAS_W = canvasWidth(PAD_R, maxDay)

  const arcSpans = arcs.map(arc => {
    const days = datedSessions.filter(s => s.arc_id === arc.id).flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!])
    if (!days.length) return null
    return { arc, start: Math.min(...days), end: Math.max(...days) }
  }).filter(Boolean) as { arc: typeof arcs[0]; start: number; end: number }[]

  const sessionItems: SessionRenderItem[] = datedSessions.map(s => ({
    id: s.id, name: s.name, session_number: s.session_number, session_sub: s.session_sub,
    arc_id: s.arc_id, in_world_day: s.in_world_day!, in_world_day_end: s.in_world_day_end,
  }))

  const bins = computeBins(zoom, baseYear, datedSessions, items)
  const maxWY = Math.ceil(dayToWorldYear(maxDay, baseYear)) + 1

  // Render SVG
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.innerHTML = ''
    svg.setAttribute('width', String(CANVAS_W))
    svg.setAttribute('height', String(TOTAL_H))

    // Pre-campaign bins + log break — shown at all zoom levels when history exists
    if (bins.length > 0) {
      renderLogBreak(svg, PAD_L + geo.campaignOffX, TOTAL_H)
      renderBinChips(svg, bins, worldYearToX, PAD_L, {
        axisY: AXIS_Y, arcY: ARC_Y,
        onHover: (chip, cx, cy) => {
          const nextZoom = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + 1] ?? zoom
          const rect = scrollRef.current?.getBoundingClientRect()
          setBinTooltip({ label: `${chip.startYear}–${chip.endYear}`, syCount: chip.syCount, evCount: chip.evCount, items: chip.items, x: cx - (rect?.left ?? 0) + (scrollRef.current?.scrollLeft ?? 0), y: cy - (rect?.top ?? 0), nextZoom })
        },
        onLeave: () => setBinTooltip(null),
        onClick: () => {
          const nextZoom = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + 1] ?? zoom
          if (nextZoom !== zoom) setZoom(nextZoom)
        },
      })
    }

    if (isYearMode(zoom)) {
      renderYearBands(svg, AXIS_Y, baseYear, maxWY, worldYearToX)
      renderAxis(svg, PAD_L - 10, AXIS_Y, CANVAS_W - PAD_R + 8)
      renderYearTicks(svg, baseYear, maxWY, AXIS_Y, worldYearToX, PAD_L + geo.campaignOffX, CANVAS_W - PAD_R)
    } else {
      renderAxis(svg, PAD_L - 10, AXIS_Y, CANVAS_W - PAD_R + 8)
      renderDayTicks(svg, minDay, maxDay, AXIS_Y, dx, pxPerDay)
    }

    renderArcTubes(svg, arcSpans, dx, ARC_Y, ARC_H)

    // Build combined item list and cluster by pixel proximity
    const clusterItems: ClusterItem[] = [
      ...(filters.sessions ? sessionItems.map(s => ({
        id: s.id, title: s.name, kind: 'session' as const,
        day: s.in_world_day, color: arcMap[s.arc_id ?? 0]?.color ?? '#8a8a8a',
        session_number: s.session_number, session_sub: s.session_sub,
        arc_id: s.arc_id, in_world_day_end: s.in_world_day_end,
      })) : []),
      ...(filters.events ? items.filter(i => i.kind === 'event').map(i => ({
        id: i.id, title: i.title, kind: 'event' as const,
        day: i.day, color: i.color, article_type: i.article_type,
      })) : []),
      ...(filters.deaths ? items.filter(i => i.kind === 'death').map(i => ({
        id: i.id, title: i.title, kind: 'death' as const,
        day: i.day, color: i.color, article_type: i.article_type,
      })) : []),
    ]

    renderClusters(svg, clusterItems, dx, arcMap, {
      axisY: AXIS_Y, sessionDotY: SESSION_DOT_Y, eventY: EVENT_Y, deathY: DEATH_Y, arcY: ARC_Y,
      onHover: (cluster, cx, cy, container) => {
        const rect = (container as HTMLElement).getBoundingClientRect()
        setDayTooltip({ items: cluster, x: cx - rect.left, y: cy - rect.top })
      },
      onLeave: () => setDayTooltip(null),
      onClickSingle: item => {
        if (item.kind === 'session') {
          const s = datedSessions.find(s => s.id === item.id)
          if (s) setSelected({ kind: 'session', id: s.id, title: s.name, day: s.in_world_day!, dayEnd: s.in_world_day_end ?? s.in_world_day!, year: baseYear, arcColor: arcMap[s.arc_id ?? 0]?.color, arcName: arcMap[s.arc_id ?? 0]?.name, sessionNum: `${s.session_number}${s.session_sub ?? ''}` })
        } else {
          const ev = items.find(i => i.id === item.id && i.kind === item.kind)
          if (ev) setSelected({ kind: ev.kind, id: ev.id, title: ev.title, day: ev.day, year: ev.year, articleType: ev.article_type, arcColor: ev.color })
        }
      },
      onClickCluster: cluster => {
        // Zoom in one level; if already at Day, open first item
        const nextZoom = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + 1] ?? zoom
        if (nextZoom !== zoom) setZoom(nextZoom)
      },
    })
  }, [datedSessions, arcs, items, selected, filters, CANVAS_W, baseYear, zoom, pxPerDay, minDay, maxDay, bins])

  // Scroll to latest session on mount/data change
  useEffect(() => {
    if (!scrollRef.current) return
    const dated = sessions.filter(s => s.in_world_day)
    if (!dated.length) return
    const latest = [...dated].sort((a, b) => b.session_number - a.session_number)[0]
    const x = dx(latest.in_world_day!)
    scrollRef.current.scrollLeft = Math.max(0, x - scrollRef.current.clientWidth * 0.6)
  }, [sessions, items.length, zoom, pxPerDay])

  // Scroll to campaign start when entering year mode
  useEffect(() => {
    if (!scrollRef.current || !isYearMode(zoom)) return
    scrollRef.current.scrollLeft = Math.max(0, (PAD_L + geo.campaignOffX) - scrollRef.current.clientWidth * 0.4)
  }, [zoom])

  const handleSessionDateSet = useCallback(async (sessionId: number, startRaw: string, endRaw: string) => {
    const sd = (() => { try { return JSON.parse(startRaw)?.day ?? null } catch { return null } })()
    const ed = (() => { try { return JSON.parse(endRaw)?.day ?? null } catch { return null } })()
    if (!sd) return
    await updateSession(sessionId, { in_world_day: sd, in_world_day_end: ed } as any)
  }, [updateSession])

  const handleEventDateSet = useCallback(async (eventId: number, dateRaw: string) => {
    const article = await window.api.getArticle(eventId)
    const t = (() => { try { return JSON.parse(article?.tracks ?? '{}') } catch { return {} } })()
    await window.api.updateArticle(eventId, { tracks: JSON.stringify({ ...t, In_World_Date: dateRaw }) })
    loadItems()
  }, [loadItems])

  const handleSaveYear = useCallback(async (y: number) => {
    if (!currentCampaign) return
    await updateCampaign(currentCampaign.id, { timeline_base_year: y } as any)
    setBaseYear(y); setShowYearConfig(false)
  }, [currentCampaign, updateCampaign])

  const handleSaveItemDate = useCallback(async (id: number, dateRaw: string, kind: 'event' | 'death') => {
    const article = await window.api.getArticle(id)
    const t = (() => { try { return JSON.parse(article?.tracks ?? '{}') } catch { return {} } })()
    const trackKey = kind === 'death' ? 'Death_Date' : 'In_World_Date'
    const patch = kind === 'death' ? { ...t, [trackKey]: dateRaw, Vitality: 'Dead' } : { ...t, [trackKey]: dateRaw }
    await window.api.updateArticle(id, { tracks: JSON.stringify(patch) })
    setSelected(null); loadItems()
  }, [loadItems])

  const handleOpenSession = useCallback((id: number) => {
    const s = sessions.find(s => s.id === id); if (!s) return; selectSession(s); setView('session')
  }, [sessions, selectSession, setView])

  const handleOpenArticle = useCallback(async (id: number) => {
    await openArticle(id); setView('wiki')
  }, [openArticle, setView])

  const activeFilterCount = Object.values(filters).filter(v => !v).length

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
            {/* Zoom level tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderRight: '1px solid var(--border)', paddingRight: 10, marginRight: 2 }}>
              {ZOOM_ORDER.map(z => (
                <button key={z} onClick={() => setZoom(z)} style={{
                  padding: '3px 8px', fontSize: 11, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  border: `1px solid ${zoom === z ? 'var(--border-gold)' : 'var(--border)'}`,
                  background: zoom === z ? 'var(--bg-hover)' : 'transparent',
                  color: zoom === z ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-ui)',
                }}>{ZOOM_LABEL[z]}</button>
              ))}
            </div>

            {/* Day-level zoom +/- (only in day mode) */}
            {zoom === 'day' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderRight: '1px solid var(--border)', paddingRight: 10, marginRight: 2 }}>
                <button style={zoomBtnStyle} onClick={() => setDayZoomIdx(i => Math.max(0, i - 1))} disabled={dayZoomIdx === 0}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}><ZoomOut size={13} /></button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 28, textAlign: 'center' }}>{pxPerDay}px</span>
                <button style={zoomBtnStyle} onClick={() => setDayZoomIdx(i => Math.min(DAY_ZOOM_LEVELS.length - 1, i + 1))} disabled={dayZoomIdx === DAY_ZOOM_LEVELS.length - 1}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}><ZoomIn size={13} /></button>
              </div>
            )}

            {/* Filter */}
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowFilter(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: showFilter ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = showFilter ? 'var(--bg-elevated)' : 'transparent'}>
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

      {/* Timeline scroll area */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', padding: '32px 0 0', background: 'var(--bg-base)' }}>
          <svg ref={svgRef} style={{ display: 'block', overflow: 'visible' }} />
          <div style={{ height: 20 }} />
        </div>

        {/* Bin tooltip */}
        {binTooltip && (
          <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 20, left: Math.max(8, binTooltip.x - 70), top: Math.max(8, binTooltip.y - 120), background: 'var(--bg-surface)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 11, color: 'var(--text-secondary)', boxShadow: 'var(--shadow-lg)', minWidth: 160 }}>
            <div style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: 4 }}>{binTooltip.label}</div>
            {binTooltip.items.slice(0, 5).map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ color: it.kind === 'session' ? 'var(--gold)' : it.kind === 'death' ? '#9b7de8' : '#e05555', fontSize: 9, flexShrink: 0 }}>{it.kind === 'session' ? '○' : it.kind === 'death' ? '☠' : '◆'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
              </div>
            ))}
            {binTooltip.items.length > 5 && <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>…and {binTooltip.items.length - 5} more</div>}
            {binTooltip.items.length === 0 && <div style={{ color: 'var(--text-muted)' }}>empty period</div>}
            {binTooltip.nextZoom !== zoom && (
              <div style={{ color: 'var(--text-muted)', marginTop: 5, paddingTop: 4, borderTop: '1px solid var(--border)', fontSize: 10 }}>click to zoom into {ZOOM_LABEL[binTooltip.nextZoom]}</div>
            )}
          </div>
        )}

        {/* Day cluster tooltip */}
        {dayTooltip && (
          <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 20, left: Math.max(8, dayTooltip.x - 70), top: Math.max(8, dayTooltip.y - 120), background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 11, color: 'var(--text-secondary)', boxShadow: 'var(--shadow-lg)', minWidth: 160 }}>
            <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, fontSize: 10 }}>Day {dayTooltip.items[0]?.day}</div>
            {dayTooltip.items.slice(0, 5).map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ color: it.kind === 'session' ? 'var(--gold)' : it.kind === 'death' ? '#9b7de8' : '#e05555', fontSize: 9, flexShrink: 0 }}>{it.kind === 'session' ? '○' : it.kind === 'death' ? '☠' : '◆'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
              </div>
            ))}
            {dayTooltip.items.length > 5 && <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>…and {dayTooltip.items.length - 5} more</div>}
            {dayTooltip.items.length > 1 && <div style={{ color: 'var(--text-muted)', marginTop: 5, paddingTop: 4, borderTop: '1px solid var(--border)', fontSize: 10 }}>click to zoom in</div>}
          </div>
        )}
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
        {isYearMode(zoom) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 16, height: 8, background: '#2a2820', border: '1px solid #3a3828', borderRadius: 2 }} /> History bin (click to zoom)
          </div>
        )}
        {!isYearMode(zoom) && minDay < 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#e88c3a88', marginLeft: 'auto' }}>
            <div style={{ width: 12, height: 12, background: '#e88c3a22', border: '1px solid #e88c3a44', borderRadius: 2 }} /> Pre-campaign region
          </div>
        )}
      </div>

      <UnplacedBanner undatedSessions={undatedSessions} undatedEvents={undatedEvents} baseYear={baseYear} onSessionDateSet={handleSessionDateSet} onEventDateSet={handleEventDateSet} />

      <div style={{ flex: 1, padding: '14px 32px', background: 'var(--bg-elevated)', minHeight: 0, overflow: 'auto' }}>
        <DetailPanel item={selected} baseYear={baseYear} onOpenArticle={handleOpenArticle} onOpenSession={handleOpenSession} onSaveSessionDate={handleSessionDateSet} onSaveItemDate={handleSaveItemDate} />
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreated={loadItems} baseYear={baseYear} />}
      {showYearConfig && <YearConfigModal currentYear={baseYear} onSave={handleSaveYear} onClose={() => setShowYearConfig(false)} />}
    </div>
  )
}
