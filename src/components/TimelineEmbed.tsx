// path: src/components/TimelineEmbed.tsx
// Read-only, embeddable timeline view for the campaign hub.
// Shares SVG rendering logic with TimelinePage but strips all edit affordances.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/store'
import { ZoomIn, ZoomOut, Filter, X, ExternalLink } from 'lucide-react'
import { parseInWorldDate } from '../components/InWorldDatePicker'

// ── Constants (mirrored from TimelinePage) ─────────────────────────────────────

const PAD_L = 64
const PAD_R = 80
const AXIS_Y = 120
const ARC_H = 14
const ARC_Y = AXIS_Y - ARC_H / 2
const SESSION_PILL_H = 10
const SESSION_PILL_Y = AXIS_Y - ARC_H / 2 - 22
const SESSION_DOT_Y = AXIS_Y - ARC_H / 2 - 54
const EVENT_Y = AXIS_Y - ARC_H / 2 - 110
const DEATH_Y = AXIS_Y + 30
const NS = 'http://www.w3.org/2000/svg'

const ZOOM_LEVELS = [4, 6, 8, 10, 14, 18, 24, 32]
const DEFAULT_ZOOM = 4

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionExt {
  id: number; name: string; session_number: number; session_sub: string | null
  arc_id: number | null; in_world_day?: number | null; in_world_day_end?: number | null
}

interface TimelineItem {
  id: number; title: string; day: number; year: number
  kind: 'event' | 'death'; article_type: string; color: string
}

interface Filters { sessions: boolean; events: boolean; deaths: boolean }

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
  filters: Filters; onChange: (f: Filters) => void; onClose: () => void
}) {
  const ROWS: { key: keyof Filters; label: string; color: string; icon: string }[] = [
    { key: 'sessions', label: 'Sessions', color: 'var(--gold)', icon: '○' },
    { key: 'events',   label: 'Events',   color: '#e05555',    icon: '◆' },
    { key: 'deaths',   label: 'Deaths',   color: '#9b7de8',    icon: '☠' },
  ]
  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 6,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
      minWidth: 180, zIndex: 100, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Show</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={12} /></button>
      </div>
      {ROWS.map(row => (
        <button key={row.key}
          onClick={() => onChange({ ...filters, [row.key]: !filters[row.key] })}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
        >
          <div style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${filters[row.key] ? row.color : 'var(--border)'}`, background: filters[row.key] ? row.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 120ms' }}>
            {filters[row.key] && <span style={{ fontSize: 8, color: '#000', fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ color: row.color, marginRight: 2 }}>{row.icon}</span>
          {row.label}
        </button>
      ))}
    </div>
  )
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

interface Tooltip { x: number; y: number; label: string; sub?: string; color: string }

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TimelineEmbed() {
  const { currentCampaign, sessions, arcs, setView, selectSession, openArticle } = useStore()

  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<TimelineItem[]>([])
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM)
  const [filters, setFilters] = useState<Filters>({ sessions: true, events: true, deaths: true })
  const [showFilter, setShowFilter] = useState(false)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [baseYear, setBaseYear] = useState<number>((currentCampaign as any)?.timeline_base_year ?? 1507)

  const PX_PER_DAY = ZOOM_LEVELS[zoomIdx]

  useEffect(() => {
    setBaseYear((currentCampaign as any)?.timeline_base_year ?? 1507)
  }, [currentCampaign?.id])

  // Close filter on outside click
  useEffect(() => {
    if (!showFilter) return
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showFilter])

  // Load events + deaths
  const loadItems = useCallback(async () => {
    if (!currentCampaign) return
    const list = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    const result: TimelineItem[] = []
    list.forEach((a: any) => {
      try {
        const t = JSON.parse(a.tracks ?? '{}')
        if (a.article_type === 'event') {
          const d = parseInWorldDate(t.In_World_Date)
          if (d) result.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'event', article_type: a.article_type, color: '#e05555' })
        }
        if (a.article_type === 'character' || a.article_type === 'playerCharacter') {
          const d = parseInWorldDate(t.Death_Date)
          if (d) result.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'death', article_type: a.article_type, color: '#9b7de8' })
        }
      } catch {}
    })
    setItems(result)
  }, [currentCampaign?.id])

  useEffect(() => { loadItems() }, [loadItems])

  const arcMap = Object.fromEntries(arcs.map(a => [a.id, a]))
  const datedSessions = (sessions as SessionExt[]).filter(s => s.in_world_day)

  // Axis bounds
  const allDays = [
    ...datedSessions.flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!]),
    ...items.map(e => e.day),
    1,
  ]
  const minDay = Math.min(...allDays) - 5
  const maxDay = Math.max(...allDays) + 20
  const CANVAS_W = PAD_L + (maxDay - minDay) * PX_PER_DAY + PAD_R

  const dx = useCallback((day: number) => PAD_L + (day - minDay) * PX_PER_DAY, [minDay, PX_PER_DAY])

  const arcSpans = arcs.map(arc => {
    const days = datedSessions.filter(s => s.arc_id === arc.id).flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!])
    if (days.length === 0) return null
    return { arc, start: Math.min(...days), end: Math.max(...days) }
  }).filter(Boolean) as { arc: typeof arcs[0]; start: number; end: number }[]

  const sortedDated = [...datedSessions].sort((a, b) => (a.in_world_day ?? 0) - (b.in_world_day ?? 0))

  // Find the latest session for highlighting
  const latestSession = datedSessions.length > 0
    ? [...datedSessions].sort((a, b) => b.session_number - a.session_number)[0]
    : null

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
        const isLatest = s.id === latestSession?.id
        const R = isLatest ? 15 : 12

        const g = svgEl('g', { style: 'cursor:pointer', 'pointer-events': 'bounding-box' }, svg)

        g.addEventListener('click', () => {
          selectSession(s as any)
          setView('session')
        })

        g.addEventListener('mouseenter', (e: Event) => {
          const me = e as MouseEvent
          const rect = (svg.parentElement as HTMLElement).getBoundingClientRect()
          setTooltip({
            x: me.clientX - rect.left,
            y: me.clientY - rect.top - 10,
            label: `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`,
            sub: arc?.name,
            color,
          })
        })
        g.addEventListener('mousemove', (e: Event) => {
          const me = e as MouseEvent
          const rect = (svg.parentElement as HTMLElement).getBoundingClientRect()
          setTooltip(prev => prev ? { ...prev, x: me.clientX - rect.left, y: me.clientY - rect.top - 10 } : null)
        })
        g.addEventListener('mouseleave', () => setTooltip(null))

        if (isMultiDay) {
          svgEl('rect', { x: startX, y: SESSION_PILL_Y, width: endX - startX, height: SESSION_PILL_H, rx: '5', fill: isLatest ? color + '55' : color + '22', stroke: color, 'stroke-width': isLatest ? '2' : '1', 'pointer-events': 'none' }, g)
          svgEl('line', { x1: startX, y1: SESSION_DOT_Y + R, x2: startX, y2: SESSION_PILL_Y, stroke: color + '55', 'stroke-width': '1', 'stroke-dasharray': '2 2', 'pointer-events': 'none' }, g)
        } else {
          svgEl('line', { x1: startX, y1: SESSION_DOT_Y + R, x2: startX, y2: ARC_Y, stroke: color + '44', 'stroke-width': '1', 'stroke-dasharray': '3 2', 'pointer-events': 'none' }, g)
        }

        svgEl('circle', { cx: startX, cy: SESSION_DOT_Y, r: R, fill: isLatest ? color + '44' : color + '1a', stroke: color, 'stroke-width': isLatest ? '2.5' : '1.5', 'pointer-events': 'none' }, g)
        svgTxt(`${s.session_number}${s.session_sub ?? ''}`, { x: startX, y: SESSION_DOT_Y + 4, 'text-anchor': 'middle', fill: color, 'font-size': '9', 'font-weight': '600', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)

        const words = s.name.split(' '); const half = Math.ceil(words.length / 2)
        svgTxt(words.slice(0, half).join(' '), { x: startX, y: SESSION_DOT_Y - R - 10, 'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
        if (words.length > half) svgTxt(words.slice(half).join(' '), { x: startX, y: SESSION_DOT_Y - R - 2, 'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      })
    }

    // Events + Deaths
    items.forEach(item => {
      if (item.kind === 'event' && !filters.events) return
      if (item.kind === 'death' && !filters.deaths) return

      const x = dx(item.day)
      const S = 7
      const yPos = item.kind === 'death' ? DEATH_Y : EVENT_Y
      const connBot = item.kind === 'death' ? AXIS_Y : (filters.sessions ? SESSION_DOT_Y - 16 : ARC_Y)

      const g = svgEl('g', { style: 'cursor:pointer', 'pointer-events': 'bounding-box' }, svg)

      g.addEventListener('click', async () => {
        await openArticle(item.id)
        setView('wiki')
      })

      g.addEventListener('mouseenter', (e: Event) => {
        const me = e as MouseEvent
        const rect = (svg.parentElement as HTMLElement).getBoundingClientRect()
        setTooltip({
          x: me.clientX - rect.left,
          y: me.clientY - rect.top - 10,
          label: item.title,
          sub: item.kind === 'death' ? `Death · ${item.article_type}` : 'Event',
          color: item.color,
        })
      })
      g.addEventListener('mousemove', (e: Event) => {
        const me = e as MouseEvent
        const rect = (svg.parentElement as HTMLElement).getBoundingClientRect()
        setTooltip(prev => prev ? { ...prev, x: me.clientX - rect.left, y: me.clientY - rect.top - 10 } : null)
      })
      g.addEventListener('mouseleave', () => setTooltip(null))

      svgEl('line', { x1: x, y1: item.kind === 'death' ? yPos - S : yPos + S, x2: x, y2: connBot, stroke: item.color + '44', 'stroke-width': '1', 'stroke-dasharray': '2 3', 'pointer-events': 'none' }, g)

      if (item.kind === 'death') {
        svgEl('polygon', { points: `${x},${yPos - S} ${x + S},${yPos} ${x},${yPos + S} ${x - S},${yPos}`, fill: item.color + '22', stroke: item.color, 'stroke-width': '1.5', 'pointer-events': 'none' }, g)
        svgTxt('☠', { x, y: yPos + 3.5, 'text-anchor': 'middle', fill: item.color, 'font-size': '7', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
        svgTxt(item.title, { x, y: yPos + S + 10, 'text-anchor': 'middle', fill: item.color, 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      } else {
        svgEl('polygon', { points: `${x},${yPos - S} ${x + S},${yPos} ${x},${yPos + S} ${x - S},${yPos}`, fill: item.color + '1a', stroke: item.color, 'stroke-width': '1.5', 'pointer-events': 'none' }, g)
        svgTxt(item.title, { x, y: yPos - S - 5, 'text-anchor': 'middle', fill: item.color, 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      }
    })

  }, [datedSessions, arcs, items, filters, CANVAS_W, baseYear, arcSpans, sortedDated, dx, PX_PER_DAY, minDay, maxDay, latestSession])

  // Scroll to latest session on mount / data change
  useEffect(() => {
    if (!scrollRef.current || !latestSession) return
    const allD = [
      ...datedSessions.flatMap(s => [s.in_world_day!, s.in_world_day_end ?? s.in_world_day!]),
      1,
    ]
    const mn = Math.min(...allD) - 5
    const x = PAD_L + (latestSession.in_world_day! - mn) * PX_PER_DAY
    scrollRef.current.scrollLeft = Math.max(0, x - scrollRef.current.clientWidth * 0.6)
  }, [sessions, items.length, PX_PER_DAY])

  if (datedSessions.length === 0 && items.length === 0) return null

  const zoomBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-light)', background: 'var(--bg-elevated)',
    color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms', flexShrink: 0,
  }

  const activeFilterCount = Object.values(filters).filter(v => !v).length

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, flex: 1 }}>
          Timeline
        </span>

        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={zoomBtnStyle} onClick={() => setZoomIdx(i => Math.max(0, i - 1))} disabled={zoomIdx === 0}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
            <ZoomOut size={11} />
          </button>
          <button style={zoomBtnStyle} onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
            <ZoomIn size={11} />
          </button>
        </div>

        {/* Filter */}
        <div ref={filterRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowFilter(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', background: showFilter ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', transition: 'background var(--transition)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = showFilter ? 'var(--bg-elevated)' : 'transparent'}
          >
            <Filter size={11} /> Filter
            {activeFilterCount > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />}
          </button>
          {showFilter && <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilter(false)} />}
        </div>

        {/* Open full timeline */}
        <button
          onClick={() => setView('timeline')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}
        >
          <ExternalLink size={10} /> Full timeline
        </button>
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative' }}>
        <div ref={scrollRef} onMouseLeave={() => setTooltip(null)} style={{ overflowX: 'auto', overflowY: 'hidden', padding: '24px 0 0', background: 'var(--bg-base)', scrollbarWidth: 'thin' }}>
          <svg ref={svgRef} style={{ display: 'block', overflow: 'visible' }} />
          <div style={{ height: 8 }} />
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 12, (scrollRef.current?.clientWidth ?? 400) - 180),
            top: tooltip.y - 36,
            background: 'var(--bg-elevated)',
            border: `1px solid ${tooltip.color}55`,
            borderRadius: 'var(--radius-sm)',
            padding: '5px 10px',
            fontSize: 12,
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            zIndex: 50,
            boxShadow: 'var(--shadow-md)',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: tooltip.color, fontWeight: 600 }}>{tooltip.label}</span>
            {tooltip.sub && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>{tooltip.sub}</span>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#8a8a8a22" stroke="#8a8a8a" strokeWidth="1.2" /></svg> Session
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <svg width="12" height="12"><polygon points="6,1 11,6 6,11 1,6" fill="#e0555522" stroke="#e05555" strokeWidth="1.2" /></svg> Event
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <svg width="12" height="12"><polygon points="6,1 11,6 6,11 1,6" fill="#9b7de822" stroke="#9b7de8" strokeWidth="1.2" /></svg> Death
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <div style={{ width: 20, height: 6, borderRadius: 3, background: '#8a8a8a22', border: '1px solid #8a8a8a44' }} /> Arc
        </div>
        {latestSession && (
          <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
            Latest: <span style={{ color: 'var(--gold)' }}>Session: {latestSession.session_number}{latestSession.session_sub ?? ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}