// path: src/components/TimelineEmbed.tsx
// Read-only, embeddable timeline view for the campaign hub.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/store'
import { ZoomIn, ZoomOut, Filter, X, ExternalLink } from 'lucide-react'
import { parseInWorldDate } from '../components/InWorldDatePicker'
import {
  ZoomLevel, ZOOM_LABEL, ZOOM_ORDER,
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
const AXIS_Y = 120
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

interface Filters { sessions: boolean; events: boolean; deaths: boolean }
interface Tooltip { x: number; y: number; label: string; sub?: string; color: string }
interface BinTooltip { label: string; syCount: number; evCount: number; items: { title: string; kind: string }[]; x: number; y: number; nextZoom: ZoomLevel }
interface DayTooltip { items: ClusterItem[]; x: number; y: number }

// ── Filter Panel ───────────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, onClose }: { filters: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const ROWS = [
    { key: 'sessions' as const, label: 'Sessions', color: 'var(--gold)', icon: '○' },
    { key: 'events'   as const, label: 'Events',   color: '#e05555',    icon: '◆' },
    { key: 'deaths'   as const, label: 'Deaths',   color: '#9b7de8',    icon: '☠' },
  ]
  return (
    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 180, zIndex: 100, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Show</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={12} /></button>
      </div>
      {ROWS.map(row => (
        <button key={row.key} onClick={() => onChange({ ...filters, [row.key]: !filters[row.key] })}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TimelineEmbed() {
  const { currentCampaign, sessions, arcs, setView, selectSession, openArticle } = useStore()

  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<TimelineEventItem[]>([])
  const [zoom, setZoom] = useState<ZoomLevel>('day')
  const [dayZoomIdx, setDayZoomIdx] = useState(DEFAULT_DAY_ZOOM)
  const [filters, setFilters] = useState<Filters>({ sessions: true, events: true, deaths: true })
  const [showFilter, setShowFilter] = useState(false)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [binTooltip, setBinTooltip] = useState<BinTooltip | null>(null)
  const [dayTooltip, setDayTooltip] = useState<DayTooltip | null>(null)
  const [baseYear, setBaseYear] = useState<number>((currentCampaign as any)?.timeline_base_year ?? 1507)

  const pxPerDay = DAY_ZOOM_LEVELS[dayZoomIdx]

  useEffect(() => { setBaseYear((currentCampaign as any)?.timeline_base_year ?? 1507) }, [currentCampaign?.id])

  useEffect(() => {
    if (!showFilter) return
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showFilter])

  const loadItems = useCallback(async () => {
    if (!currentCampaign) return
    const list = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    const result: TimelineEventItem[] = []
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
  const datedSessions = sessions.filter(s => s.in_world_day)
  const latestSession = datedSessions.length > 0 ? [...datedSessions].sort((a, b) => b.session_number - a.session_number)[0] : null

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

    if (bins.length > 0) {
      renderLogBreak(svg, PAD_L + geo.campaignOffX, TOTAL_H)
      renderBinChips(svg, bins, worldYearToX, PAD_L, {
        axisY: AXIS_Y, arcY: ARC_Y,
        onHover: (chip, cx, cy) => {
          const nextZoom = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + 1] ?? zoom
          const rect = scrollRef.current?.getBoundingClientRect()
          setBinTooltip({ label: `${chip.startYear}–${chip.endYear}`, syCount: chip.syCount, evCount: chip.evCount, items: chip.items, x: cx - (rect?.left ?? 0), y: cy - (rect?.top ?? 0), nextZoom })
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

    const clusterItems: ClusterItem[] = [
      ...(filters.sessions ? sessionItems.map(s => ({
        id: s.id, title: s.name, kind: 'session' as const,
        day: s.in_world_day, color: arcMap[s.arc_id ?? 0]?.color ?? '#8a8a8a',
        session_number: s.session_number, session_sub: s.session_sub,
        arc_id: s.arc_id, in_world_day_end: s.in_world_day_end,
      })) : []),
      ...(filters.events ? items.filter(i => i.kind === 'event').map(i => ({ id: i.id, title: i.title, kind: 'event' as const, day: i.day, color: i.color, article_type: i.article_type })) : []),
      ...(filters.deaths ? items.filter(i => i.kind === 'death').map(i => ({ id: i.id, title: i.title, kind: 'death' as const, day: i.day, color: i.color, article_type: i.article_type })) : []),
    ]

    renderClusters(svg, clusterItems, dx, arcMap, {
      axisY: AXIS_Y, sessionDotY: SESSION_DOT_Y, eventY: EVENT_Y, deathY: DEATH_Y, arcY: ARC_Y,
      onHover: (cluster, cx, cy, container) => {
        const rect = (container as HTMLElement).getBoundingClientRect()
        if (cluster.length === 1) {
          const it = cluster[0]
          setTooltip({ x: cx - rect.left, y: cy - rect.top - 10, label: it.title, sub: it.kind === 'session' ? arcMap[it.arc_id ?? 0]?.name : it.kind === 'death' ? 'Death' : 'Event', color: it.color })
        } else {
          setDayTooltip({ items: cluster, x: cx - rect.left, y: cy - rect.top })
        }
      },
      onLeave: () => { setTooltip(null); setDayTooltip(null) },
      onClickSingle: async item => {
        if (item.kind === 'session') { selectSession(item as any); setView('session') }
        else { await openArticle(item.id); setView('wiki') }
      },
      onClickCluster: () => {
        const nextZoom = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + 1] ?? zoom
        if (nextZoom !== zoom) setZoom(nextZoom)
      },
    })
  }, [datedSessions, arcs, items, filters, CANVAS_W, baseYear, zoom, pxPerDay, minDay, maxDay, latestSession, bins])

  // Scroll to latest session on mount/data change
  useEffect(() => {
    if (!scrollRef.current || !latestSession) return
    const x = dx(latestSession.in_world_day!)
    scrollRef.current.scrollLeft = Math.max(0, x - scrollRef.current.clientWidth * 0.6)
  }, [sessions, items.length, zoom, pxPerDay])

  // Scroll to campaign start when entering year mode
  useEffect(() => {
    if (!scrollRef.current || !isYearMode(zoom)) return
    scrollRef.current.scrollLeft = Math.max(0, (PAD_L + geo.campaignOffX) - scrollRef.current.clientWidth * 0.4)
  }, [zoom])

  if (datedSessions.length === 0 && items.length === 0) return null

  const zoomBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-light)', background: 'var(--bg-elevated)',
    color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms', flexShrink: 0,
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, flex: 1 }}>Timeline</span>

        {/* Zoom level tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {ZOOM_ORDER.map(z => (
            <button key={z} onClick={() => setZoom(z)} style={{
              padding: '2px 6px', fontSize: 10, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: `1px solid ${zoom === z ? 'var(--border-gold)' : 'var(--border)'}`,
              background: zoom === z ? 'var(--bg-hover)' : 'transparent',
              color: zoom === z ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-ui)',
            }}>{ZOOM_LABEL[z]}</button>
          ))}
        </div>

        {/* Day-level zoom (only in day mode) */}
        {zoom === 'day' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <button style={zoomBtnStyle} onClick={() => setDayZoomIdx(i => Math.max(0, i - 1))} disabled={dayZoomIdx === 0}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}><ZoomOut size={11} /></button>
            <button style={zoomBtnStyle} onClick={() => setDayZoomIdx(i => Math.min(DAY_ZOOM_LEVELS.length - 1, i + 1))} disabled={dayZoomIdx === DAY_ZOOM_LEVELS.length - 1}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}><ZoomIn size={11} /></button>
          </div>
        )}

        {/* Filter */}
        <div ref={filterRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowFilter(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', background: showFilter ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', transition: 'background var(--transition)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = showFilter ? 'var(--bg-elevated)' : 'transparent'}>
            <Filter size={11} /> Filter
            {Object.values(filters).some(v => !v) && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />}
          </button>
          {showFilter && <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilter(false)} />}
        </div>

        <button onClick={() => setView('timeline')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}>
          <ExternalLink size={10} /> Full timeline
        </button>
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative' }}>
        <div ref={scrollRef} onMouseLeave={() => { setTooltip(null); setBinTooltip(null); setDayTooltip(null) }}
          style={{ overflowX: 'auto', overflowY: 'hidden', padding: '24px 0 0', background: 'var(--bg-base)', scrollbarWidth: 'thin' }}>
          <svg ref={svgRef} style={{ display: 'block', overflow: 'visible' }} />
          <div style={{ height: 8 }} />
        </div>

        {/* Item hover tooltip */}
        {tooltip && (
          <div style={{ position: 'absolute', left: Math.min(tooltip.x + 12, (scrollRef.current?.clientWidth ?? 400) - 180), top: tooltip.y - 36, background: 'var(--bg-elevated)', border: `1px solid ${tooltip.color}55`, borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', pointerEvents: 'none', zIndex: 50, boxShadow: 'var(--shadow-md)', whiteSpace: 'nowrap' }}>
            <span style={{ color: tooltip.color, fontWeight: 600 }}>{tooltip.label}</span>
            {tooltip.sub && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>{tooltip.sub}</span>}
          </div>
        )}

        {/* Bin tooltip */}
        {binTooltip && (
          <div style={{ position: 'absolute', left: Math.max(8, binTooltip.x - 70), top: Math.max(8, binTooltip.y - 110), background: 'var(--bg-surface)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 11, color: 'var(--text-secondary)', pointerEvents: 'none', zIndex: 50, boxShadow: 'var(--shadow-lg)', minWidth: 150 }}>
            <div style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: 4 }}>{binTooltip.label}</div>
            {binTooltip.items.slice(0, 5).map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ color: it.kind === 'session' ? 'var(--gold)' : it.kind === 'death' ? '#9b7de8' : '#e05555', fontSize: 9, flexShrink: 0 }}>{it.kind === 'session' ? '○' : it.kind === 'death' ? '☠' : '◆'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
              </div>
            ))}
            {binTooltip.items.length > 5 && <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>…and {binTooltip.items.length - 5} more</div>}
            {binTooltip.items.length === 0 && <div style={{ color: 'var(--text-muted)' }}>empty period</div>}
            {binTooltip.nextZoom !== zoom && <div style={{ color: 'var(--text-muted)', marginTop: 4, paddingTop: 3, borderTop: '1px solid var(--border)', fontSize: 10 }}>click to zoom into {ZOOM_LABEL[binTooltip.nextZoom]}</div>}
          </div>
        )}

        {/* Day cluster tooltip */}
        {dayTooltip && (
          <div style={{ position: 'absolute', left: Math.max(8, dayTooltip.x - 70), top: Math.max(8, dayTooltip.y - 110), background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 11, color: 'var(--text-secondary)', pointerEvents: 'none', zIndex: 50, boxShadow: 'var(--shadow-lg)', minWidth: 150 }}>
            <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, fontSize: 10 }}>Day {dayTooltip.items[0]?.day}</div>
            {dayTooltip.items.slice(0, 5).map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ color: it.kind === 'session' ? 'var(--gold)' : it.kind === 'death' ? '#9b7de8' : '#e05555', fontSize: 9, flexShrink: 0 }}>{it.kind === 'session' ? '○' : it.kind === 'death' ? '☠' : '◆'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
              </div>
            ))}
            {dayTooltip.items.length > 5 && <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>…and {dayTooltip.items.length - 5} more</div>}
            <div style={{ color: 'var(--text-muted)', marginTop: 4, paddingTop: 3, borderTop: '1px solid var(--border)', fontSize: 10 }}>click to zoom in</div>
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
            Latest: <span style={{ color: 'var(--gold)' }}>Session {latestSession.session_number}{latestSession.session_sub ?? ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}
