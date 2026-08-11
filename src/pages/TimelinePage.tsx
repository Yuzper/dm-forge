// path: src/pages/TimelinePage.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../store/store'
import { Clock, Plus, ArrowLeft, Filter, Settings, X, ListTree, AlertTriangle } from 'lucide-react'
import { parseInWorldDate, InWorldDatePicker, serializeInWorldDate } from '../components/InWorldDatePicker'
import type { ArticleType, Session, Article } from '../types'
import { buildArticleTimeline, type Lifespan } from '../constants/timelineDates'
import { ArticleEditor } from '../components/wiki/ArticleEditor'
import {
  dayToCalendarDate,
  type CampaignCalendar, getCampaignCalendar,
  formatCalendarDay,
  type TimelineEventItem, type ClusterItem, type SessionRenderItem, type Era,
} from '../utils/timelineGeometry'
import {
  TimelineBreadcrumb, TimelineDecadeView, TimelineYearView, TimelineSpanView,
  type DrilldownLevel, type SpanOrientation,
} from '../components/TimelineDrilldown'
import { buildDecadeBands, buildSpanBuckets } from '../utils/timelineDrilldown'

import { TimelineOutline } from '../components/TimelineOutline'
import { ChronologyPanel } from '../components/ChronologyPanel'
import { auditChronology, type AuditArticle, type ChronologyIssue } from '../utils/chronologyAudit'

import { SECTION_ACCENTS } from '../constants/sections'
import { TimelineFilterPanel as FilterPanel, DEFAULT_TIMELINE_FILTERS as DEFAULT_FILTERS, type TimelineFilters } from '../components/TimelineFilterPanel'
import Modal from '../components/Modal'
import { ColorDotPicker } from '../components/SwatchPicker'
import { useContextMenu, useMenuCtx } from '../hooks/useContextMenu'
import { buildArticleMenu, buildSessionMenu } from '../utils/contextMenus'

// Section accent used for timeline UI chrome on this page.
// Section colours are theme-dependent and user-overridable, so they're read
// during render rather than captured at module load.

function loadFilters(id: number): TimelineFilters {
  try { const s = localStorage.getItem(`timeline-filters-${id}`); if (s) return { ...DEFAULT_FILTERS, ...JSON.parse(s) } } catch {}
  return { ...DEFAULT_FILTERS }
}
function saveFilters(id: number, f: TimelineFilters) {
  localStorage.setItem(`timeline-filters-${id}`, JSON.stringify(f))
}

function parseEras(raw: any): Era[] {
  try { const a = JSON.parse(raw ?? '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// Where the drill-down was left, per campaign. This is now only the *seed for a
// new timeline tab* — an existing tab's position lives on its own Location, so
// two timeline tabs can sit on different years. Before that, both tabs read this
// one key at mount and silently converged on whichever moved last.
interface NavState { level: DrilldownLevel; orient: SpanOrientation }

function loadNav(id: number): NavState {
  try {
    const s = localStorage.getItem(`timeline-nav-${id}`)
    if (s) {
      const n = JSON.parse(s)
      if (n?.level?.view) return { level: n.level, orient: n.orient === 'horizontal' ? 'horizontal' : 'vertical' }
    }
  } catch {}
  return { level: { view: 'decades' }, orient: 'vertical' }
}
function saveNav(id: number, n: NavState) {
  localStorage.setItem(`timeline-nav-${id}`, JSON.stringify(n))
}

// Filter panel shared with the hub embed — see components/TimelineFilterPanel.

// ── Timeline Settings Modal (calendar + era bands) ───────────────────────────────

function TimelineSettingsModal({ calendar, eras, showLifespans, onSave, onClose }: {
  calendar: CampaignCalendar; eras: Era[]; showLifespans: boolean
  onSave: (cal: CampaignCalendar, eras: Era[], showLifespans: boolean) => void; onClose: () => void
}) {
  const [unitName, setUnitName] = useState(calendar.unitName)
  const [spans, setSpans] = useState(calendar.spans.map(s => ({ ...s })))
  const [startYear, setStartYear] = useState(calendar.start.year)
  const [startSpan, setStartSpan] = useState(calendar.start.span)
  const [startDay, setStartDay] = useState(calendar.start.day)
  const [list, setList] = useState<Era[]>(eras)
  const [lifespansOn, setLifespansOn] = useState(showLifespans)

  const totalDays = spans.reduce((s, sp) => s + (sp.days || 0), 0)
  const unit = unitName.trim() || 'Month'

  const addSpan = () => setSpans(s => [...s, { name: '', days: 30 }])
  const updateSpan = (i: number, patch: Partial<{ name: string; days: number }>) =>
    setSpans(s => s.map((sp, idx) => idx === i ? { ...sp, ...patch } : sp))
  const removeSpan = (i: number) => {
    setSpans(s => s.filter((_, idx) => idx !== i))
    setStartSpan(v => Math.max(0, Math.min(i < v ? v - 1 : v, spans.length - 2)))
  }

  const buildCalendar = (): CampaignCalendar => {
    const cleanSpans = spans.length > 0
      ? spans.map(s => ({ name: s.name.trim(), days: Math.max(1, Math.round(s.days || 1)) }))
      : [{ name: '', days: 365 }]
    const span = Math.min(startSpan, cleanSpans.length - 1)
    return {
      unitName: unit,
      spans: cleanSpans,
      start: { year: startYear, span, day: Math.min(Math.max(1, startDay), cleanSpans[span].days) },
    }
  }

  const addEra = () => setList(l => [...l, { id: `era_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: 'New Era', startYear, endYear: startYear + 10, color: '#c8a84b' }])
  const updateEra = (id: string, patch: Partial<Era>) => setList(l => l.map(e => e.id === id ? { ...e, ...patch } : e))
  const removeEra = (id: string) => setList(l => l.filter(e => e.id !== id))

  return (
    <Modal title="Timeline settings" onClose={onClose} style={{ maxWidth: 540, maxHeight: '86vh', overflowY: 'auto' }}>

        {/* ── Calendar ─────────────────────────────────────────────────────── */}
        <div className="input-group">
          <label className="input-label">Year divisions</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>One division is called a</span>
            <input className="input" value={unitName} onChange={e => setUnitName(e.target.value)}
              placeholder="Month, Season, Tenday…" style={{ width: 150 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
            {spans.map((sp, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <input className="input" value={sp.name} onChange={e => updateSpan(i, { name: e.target.value })}
                  placeholder={`${unit} ${i + 1}`} style={{ flex: 1, minWidth: 0 }} />
                <input className="input" type="number" min={1} value={sp.days}
                  onChange={e => updateSpan(i, { days: parseInt(e.target.value) || 1 })}
                  title="Days" style={{ width: 70, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>days</span>
                <button onClick={() => removeSpan(i)} disabled={spans.length <= 1} title={spans.length <= 1 ? 'At least one division is needed' : 'Remove'}
                  style={{ background: 'none', border: 'none', color: spans.length <= 1 ? 'var(--border)' : 'var(--text-muted)', cursor: spans.length <= 1 ? 'default' : 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <button className="btn btn-sm" onClick={addSpan}><Plus size={12} /> Add {unit.toLowerCase()}</button>
            <span style={{ fontSize: 12, color: 'var(--gold)' }}>= {totalDays} days per year</span>
          </div>
        </div>

        {/* ── Campaign start date ──────────────────────────────────────────── */}
        <div className="input-group" style={{ marginTop: 18 }}>
          <label className="input-label">Campaign start date</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Day</span>
            <input className="input" type="number" min={1} max={spans[Math.min(startSpan, spans.length - 1)]?.days ?? 1}
              value={startDay} onChange={e => setStartDay(parseInt(e.target.value) || 1)} style={{ width: 64 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>of</span>
            <select className="input" value={Math.min(startSpan, spans.length - 1)}
              onChange={e => setStartSpan(parseInt(e.target.value))} style={{ width: 150 }}>
              {spans.map((sp, i) => <option key={i} value={i}>{sp.name.trim() || `${unit} ${i + 1}`}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>, year</span>
            <input className="input" type="number" value={startYear}
              onChange={e => setStartYear(parseInt(e.target.value) || startYear)}
              style={{ width: 84, color: 'var(--gold)', fontWeight: 600 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            Campaign day 1 falls on this date. Dates are stored as days since campaign start, so changing the calendar re-labels them without moving anything.
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="input-label" style={{ margin: 0 }}>Era bands</label>
            <button className="btn btn-sm" onClick={addEra}><Plus size={12} /> Add era</button>
          </div>
          {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0 8px' }}>No eras yet. Add named periods (e.g. "The Long Winter") to show as background bands.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
            {list.map(era => (
              <div key={era.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ColorDotPicker value={era.color} onChange={c => updateEra(era.id, { color: c })} size={24} title="Band colour" />
                <input className="input" value={era.name} onChange={e => updateEra(era.id, { name: e.target.value })} placeholder="Era name" style={{ flex: 1, minWidth: 0 }} />
                <input className="input" type="number" value={era.startYear} onChange={e => updateEra(era.id, { startYear: parseInt(e.target.value) || 0 })} title="Start year" style={{ width: 74, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-muted)' }}>–</span>
                <input className="input" type="number" value={era.endYear} onChange={e => updateEra(era.id, { endYear: parseInt(e.target.value) || 0 })} title="End year" style={{ width: 74, flexShrink: 0 }} />
                <button onClick={() => removeEra(era.id)} title="Remove era" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}><X size={14} /></button>
              </div>
            ))}
          </div>
          {list.some(e => e.endYear <= e.startYear) && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6 }}>Eras with end ≤ start year will be skipped.</div>}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={lifespansOn} onChange={e => setLifespansOn(e.target.checked)} style={{ cursor: 'pointer' }} />
          Show lifespan bands
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— faint bands between start/end dates (Founded→Destroyed, Born→Died…)</span>
        </label>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(buildCalendar(), list.filter(e => e.endYear > e.startYear), lifespansOn)}>Save</button>
        </div>
    </Modal>
  )
}

// ── Create Event Modal ─────────────────────────────────────────────────────────

function CreateEventModal({ onClose, onCreated, baseYear, initialDateRaw }: { onClose: () => void; onCreated: () => void; baseYear: number; initialDateRaw?: string }) {
  const { createArticle } = useStore()
  const [title, setTitle] = useState('')
  const [dateRaw, setDateRaw] = useState(initialDateRaw ?? '')
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
    <Modal title="New timeline event" onClose={onClose} style={{ maxWidth: 420 }}>
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
    </Modal>
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
  const ACCENT = SECTION_ACCENTS['timeline']
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
    <div style={{ borderTop: `2px solid ${ACCENT}55`, background: `${ACCENT}08`, flexShrink: 0 }}>
      <div style={{ padding: '10px 32px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT }}>{total} item{total !== 1 ? 's' : ''} not yet placed on timeline</span>
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

// ── Main Timeline Page ─────────────────────────────────────────────────────────

export default function TimelinePage() {
  const ACCENT = SECTION_ACCENTS['timeline']
  const { currentCampaign, sessions, drafts, arcs, setView, selectSession, setCampaignSubView, updateSession, updateCampaign, setHintContext } = useStore()
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()
  useEffect(() => { setHintContext('timeline'); return () => setHintContext(null) }, [setHintContext])
  const filterRef = useRef<HTMLDivElement>(null)
  const issuesRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<TimelineEventItem[]>([])
  const [lifespans, setLifespans] = useState<Lifespan[]>([])
  const [undatedEvents, setUndatedEvents] = useState<{ id: number; title: string }[]>([])
  const [filters, setFilters] = useState<TimelineFilters>(() => currentCampaign ? loadFilters(currentCampaign.id) : DEFAULT_FILTERS)
  const [showFilter, setShowFilter] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [cal, setCal] = useState<CampaignCalendar>(() => getCampaignCalendar(currentCampaign))
  const [eras, setEras] = useState<Era[]>(() => parseEras((currentCampaign as any)?.timeline_eras))
  const [showLifespans, setShowLifespans] = useState<boolean>(!!(currentCampaign as any)?.timeline_show_lifespans)
  const [embeddedArticle, setEmbeddedArticle] = useState<Article | null>(null)
  const [createDateRaw, setCreateDateRaw] = useState('')
  const [mode, setMode] = useState<'axis' | 'outline'>('axis')
  const [rawArticles, setRawArticles] = useState<AuditArticle[]>([])
  const [showIssues, setShowIssues] = useState(false)
  // This tab's own drill position, falling back to the campaign's last-known one
  // when the tab has none yet (a freshly opened timeline tab).
  const patchLocation = useStore(s => s.patchLocation)
  const [level, setLevel] = useState<DrilldownLevel>(() => {
    const loc = useStore.getState().activeLocation()
    if (loc?.type === 'timeline' && loc.level) return loc.level
    return currentCampaign ? loadNav(currentCampaign.id).level : { view: 'decades' }
  })
  const [orient, setOrient] = useState<SpanOrientation>(() => {
    const loc = useStore.getState().activeLocation()
    if (loc?.type === 'timeline' && loc.orient) return loc.orient
    return currentCampaign ? loadNav(currentCampaign.id).orient : 'vertical'
  })

  useEffect(() => {
    // Onto the tab (so each tab keeps its own place) and onto the campaign key
    // (so the *next* new timeline tab opens where you last were).
    patchLocation('timeline', { level, orient })
    if (currentCampaign) saveNav(currentCampaign.id, { level, orient })
  }, [currentCampaign?.id, level, orient, patchLocation])

  useEffect(() => {
    setCal(getCampaignCalendar(currentCampaign))
    setEras(parseEras((currentCampaign as any)?.timeline_eras))
    setShowLifespans(!!(currentCampaign as any)?.timeline_show_lifespans)
  }, [currentCampaign?.id])

  useEffect(() => {
    if (!showFilter) return
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showFilter])

  useEffect(() => {
    if (!showIssues) return
    const h = (e: MouseEvent) => { if (issuesRef.current && !issuesRef.current.contains(e.target as Node)) setShowIssues(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showIssues])

  useEffect(() => {
    if (!currentCampaign) return
    setFilters(loadFilters(currentCampaign.id))
    // Deliberately does NOT reset level/orient from the campaign key any more.
    // That ran on mount as well as on a campaign change, so it overwrote this
    // tab's own position with whatever another timeline tab last saved.
    // Switching campaigns rebuilds the tab set and remounts this page anyway.
  }, [currentCampaign?.id])

  const handleFiltersChange = (f: TimelineFilters) => {
    setFilters(f); if (currentCampaign) saveFilters(currentCampaign.id, f)
  }

  const loadItems = useCallback(async () => {
    if (!currentCampaign) return
    const list = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    const result: TimelineEventItem[] = []
    const undated: { id: number; title: string }[] = []
    const spans: Lifespan[] = []
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
        // Semantic dates (founded/destroyed/born…), freeform milestones, and any
        // legacy Timeline_Date → point markers + an optional lifespan.
        const { markers, lifespan } = buildArticleTimeline(a, t, parseInWorldDate)
        result.push(...markers)
        if (lifespan) spans.push(lifespan)
      } catch {}
    })
    setItems(result); setUndatedEvents(undated); setLifespans(spans)
    // Kept raw so the chronology audit can look at dates the parser rejected —
    // those never make it into `items`.
    setRawArticles(list.map((a: any) => ({ id: a.id, title: a.title, article_type: a.article_type, tracks: a.tracks ?? null })))
  }, [currentCampaign?.id])

  useEffect(() => { loadItems() }, [loadItems])

  const arcMap = Object.fromEntries(arcs.map(a => [a.id, a]))
  const datedSessions = sessions.filter(s => s.in_world_day)
  const undatedSessions = sessions.filter(s => !s.in_world_day).map(s => ({ ...s, _arcColor: arcMap[s.arc_id ?? 0]?.color ?? '#8a8a8a' }))

  const issues = useMemo(() => auditChronology(
    rawArticles,
    sessions.map(s => ({
      id: s.id, name: s.name, session_number: s.session_number,
      session_sub: s.session_sub, in_world_day: s.in_world_day ?? null,
    })),
    parseInWorldDate,
    day => formatCalendarDay(day, cal),
  ), [rawArticles, sessions, cal])
  const errorCount = issues.filter(i => i.severity === 'error').length

  const sessionItems: SessionRenderItem[] = datedSessions.map(s => ({
    id: s.id, name: s.name, session_number: s.session_number, session_sub: s.session_sub,
    arc_id: s.arc_id, in_world_day: s.in_world_day!, in_world_day_end: s.in_world_day_end,
  }))

  // One flat, filter-aware list feeds every level of the drill-down — the views
  // only ever bucket it, never re-derive it.
  const clusterItems: ClusterItem[] = useMemo(() => [
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
    ...(filters.quests ? items.filter(i => i.kind === 'quest').map(i => ({
      id: i.id, title: i.title, kind: 'quest' as const,
      day: i.day, color: i.color, article_type: i.article_type,
    })) : []),
    ...(filters.articles ? items.filter(i => i.kind === 'article').map(i => ({
      id: i.id, title: i.title, kind: 'article' as const,
      day: i.day, color: i.color, article_type: i.article_type,
    })) : []),
  ], [filters, items, sessions, arcs])

  const decadeBands = useMemo(() => buildDecadeBands(clusterItems, cal), [clusterItems, cal])
  const spanBuckets = useMemo(
    () => level.view === 'year' ? buildSpanBuckets(clusterItems, level.year, cal) : [],
    [clusterItems, cal, level],
  )

  // Lifespans are article-derived, not filtered by kind, so they carry their own
  // toggle from settings rather than a filter row.
  const lifespanBands = useMemo(
    () => lifespans.map(l => ({ id: l.id, title: l.title, color: l.color, startDay: l.startDay, endDay: l.endDay })),
    [lifespans],
  )

  const stepYear = useCallback((delta: number) => setLevel(l =>
    l.view === 'year' ? { view: 'year', year: l.year + delta } : l), [])

  const stepSpan = useCallback((delta: number) => setLevel(l => {
    if (l.view !== 'span') return l
    let span = l.span + delta, year = l.year
    if (span < 0) { span = cal.spans.length - 1; year -= 1 }
    if (span >= cal.spans.length) { span = 0; year += 1 }
    return { view: 'span', year, span }
  }), [cal.spans.length])

  // A calendar edit can leave a stored division index past the end of the new
  // division list, which would read cal.spans[undefined].
  useEffect(() => {
    setLevel(l => l.view === 'span' && l.span >= cal.spans.length
      ? { view: 'year', year: l.year } : l)
  }, [cal.spans.length])

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

  const handleSaveSettings = useCallback(async (newCal: CampaignCalendar, newEras: Era[], lifespansOn: boolean) => {
    if (!currentCampaign) return
    // timeline_base_year mirrors the calendar start year so older code paths
    // (and the fallback calendar) stay consistent.
    await updateCampaign(currentCampaign.id, {
      timeline_base_year: newCal.start.year,
      timeline_calendar: JSON.stringify(newCal),
      timeline_eras: JSON.stringify(newEras),
      timeline_show_lifespans: lifespansOn ? 1 : 0,
    } as any)
    setCal(newCal); setEras(newEras); setShowLifespans(lifespansOn); setShowSettings(false)
  }, [currentCampaign, updateCampaign])

  const handleOpenSession = useCallback((id: number) => {
    const s = sessions.find(s => s.id === id); if (!s) return; selectSession(s); setView('session')
  }, [sessions, selectSession, setView])

  // Single-click on a timeline entry: sessions open their full page; events and
  // deaths (which are articles) embed inline in the panel below the timeline.
  const navigateToItem = useCallback(async (item: ClusterItem) => {
    if (item.kind === 'session') { handleOpenSession(item.id); return }
    const article = await window.api.getArticle(item.id)
    if (article) setEmbeddedArticle(article)
  }, [handleOpenSession])

  // Right-click an entry. A timeline entry is a session or an article wearing a
  // date, so it gets that entity's menu — with "Open" rebound to this page's own
  // behaviour (embed below rather than leave the timeline).
  const itemMenu = useCallback((item: ClusterItem, e: React.MouseEvent) => {
    if (item.kind === 'session') {
      const s = [...sessions, ...drafts].find(x => x.id === item.id)
      if (s) showMenu(e, buildSessionMenu(s, menuCtx))
      return
    }
    showMenu(e, () => buildArticleMenu(
      { id: item.id, title: item.title, article_type: item.article_type },
      menuCtx,
      { extra: [{ label: 'Preview below the timeline', click: () => void navigateToItem(item) }] },
    ))
  }, [sessions, drafts, showMenu, menuCtx, navigateToItem])

  // Jump from an audit row to the thing it's complaining about: sessions open
  // their page, articles embed below, and the drill-down navigates to the
  // division holding the offending day.
  const handleSelectIssue = useCallback(async (issue: ChronologyIssue) => {
    setShowIssues(false)
    if (issue.sessionId != null) { handleOpenSession(issue.sessionId); return }
    if (issue.articleId == null) return
    if (issue.day != null && mode === 'axis') {
      const d = dayToCalendarDate(issue.day, cal)
      setLevel({ view: 'span', year: d.year, span: d.span })
    }
    const article = await window.api.getArticle(issue.articleId)
    if (article) setEmbeddedArticle(article)
  }, [handleOpenSession, mode, cal])

  // "Add here" from a division opens the create modal already dated to it.
  const handleAddAt = useCallback((day: number) => {
    const d = dayToCalendarDate(day, cal)
    setCreateDateRaw(serializeInWorldDate({ day, year: d.year, label: formatCalendarDay(day, cal) }))
    setShowCreate(true)
  }, [cal])

  const activeFilterCount = Object.values(filters).filter(v => !v).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
              className="hover-text">
              <ArrowLeft size={14} /> Back
            </button>
            <Clock size={20} color={ACCENT} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, letterSpacing: '0.03em', color: 'var(--text-primary)', margin: 0 }}>Timeline</h1>
            <button onClick={() => setShowSettings(true)} title="Timeline settings (calendar, start date, era bands)"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: 11, color: 'var(--gold)', cursor: 'pointer' }}>
              <Settings size={10} /> Calendar · {cal.start.year}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {datedSessions.length} sessions · {items.filter(i => i.kind === 'event').length} events · {items.filter(i => i.kind === 'death').length} deaths
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Axis / outline mode */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderRight: '1px solid var(--border)', paddingRight: 10, marginRight: 2 }}>
              {([['axis', 'Timeline', Clock], ['outline', 'Outline', ListTree]] as const).map(([m, label, Icon]) => (
                <button key={m} onClick={() => setMode(m)} title={m === 'outline' ? 'Read the same data as a document — includes entries with no date' : 'Axis view'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', fontSize: 11, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: `1px solid ${mode === m ? 'var(--border-gold)' : 'var(--border)'}`,
                    background: mode === m ? 'var(--bg-hover)' : 'transparent',
                    color: mode === m ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-ui)',
                  }}><Icon size={11} /> {label}</button>
              ))}
            </div>

            {/* Chronology audit */}
            <div ref={issuesRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowIssues(v => !v)} title="Chronology problems — contradictions, unreadable dates, undated articles"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: showIssues ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${errorCount > 0 ? 'var(--danger-border)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', color: errorCount > 0 ? 'var(--danger)' : 'var(--text-secondary)', transition: 'background var(--transition)' }}
                className="hover-bg-elevated">
                <AlertTriangle size={13} /> {issues.length > 0 ? issues.length : 'Canon'}
              </button>
              {showIssues && <ChronologyPanel issues={issues} onSelect={handleSelectIssue} onClose={() => setShowIssues(false)} />}
            </div>

            {/* Filter */}
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowFilter(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: showFilter ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
                className="hover-bg-elevated">
                <Filter size={13} /> Filter
                {activeFilterCount > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />}
              </button>
              {showFilter && <FilterPanel filters={filters} onChange={handleFiltersChange} onClose={() => setShowFilter(false)} />}
            </div>

            <button onClick={() => { setCreateDateRaw(''); setShowCreate(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', transition: 'all 120ms' }}
              className="hover-gold-border">
              <Plus size={13} /> Add event
            </button>
          </div>
        </div>
      </div>


      {mode === 'axis' && (<>
      <TimelineBreadcrumb level={level} cal={cal} onNavigate={setLevel} />

      {level.view === 'decades' && (
        <TimelineDecadeView
          bands={decadeBands} eras={eras} showEras={filters.eras}
          campaignYear={cal.start.year}
          onPickYear={year => setLevel({ view: 'year', year })}
        />
      )}

      {level.view === 'year' && (
        <TimelineYearView
          year={level.year} buckets={spanBuckets} cal={cal}
          eras={eras} showEras={filters.eras}
          lifespans={lifespanBands} showLifespans={showLifespans}
          onPickSpan={span => setLevel({ view: 'span', year: level.year, span })}
          onStepYear={stepYear}
        />
      )}

      {level.view === 'span' && (
        <TimelineSpanView
          year={level.year} span={level.span} items={clusterItems} cal={cal}
          lifespans={lifespanBands} showLifespans={showLifespans}
          orient={orient} onOrientChange={setOrient}
          onStepSpan={stepSpan} onOpenItem={navigateToItem} onItemMenu={itemMenu} onAddAt={handleAddAt}
        />
      )}

      <UnplacedBanner undatedSessions={undatedSessions} undatedEvents={undatedEvents} baseYear={cal.start.year} onSessionDateSet={handleSessionDateSet} onEventDateSet={handleEventDateSet} />
      </>)}

      {mode === 'outline' && (
        <TimelineOutline
          eras={eras} cal={cal} sessions={sessionItems} arcMap={arcMap} items={items}
          issues={issues} undatedSessions={undatedSessions}
          onOpenSession={handleOpenSession}
          onOpenArticle={async id => {
            const article = await window.api.getArticle(id)
            if (article) setEmbeddedArticle(article)
          }}
          onSelectIssue={handleSelectIssue}
          onRowMenu={(entry, e) => itemMenu({
            id: (entry.sessionId ?? entry.articleId)!,
            title: entry.title, kind: entry.kind, day: entry.day, color: entry.color,
          }, e)}
        />
      )}

      {(mode === 'axis' || embeddedArticle) && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
          {embeddedArticle ? (
            <ArticleEditor key={embeddedArticle.id} article={embeddedArticle}
              backLabel="Close" onBack={() => { setEmbeddedArticle(null); loadItems() }} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 32px', color: 'var(--text-muted)', fontSize: 13 }}>
              Click an event or death to read it here · sessions open their full page
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreated={loadItems} baseYear={cal.start.year} initialDateRaw={createDateRaw} />}
      {showSettings && <TimelineSettingsModal calendar={cal} eras={eras} showLifespans={showLifespans} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
