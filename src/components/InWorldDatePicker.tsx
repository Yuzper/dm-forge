// path: src/components/InWorldDatePicker.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/store'
import { Calendar, X } from 'lucide-react'

export interface InWorldDate {
  day: number   // 1-based day offset from campaign start
  year: number  // e.g. 1507
  label: string // human-readable e.g. "Day 22, Year 1507"
}

export function parseInWorldDate(raw: string): InWorldDate | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.day === 'number') return parsed
  } catch {}
  return null
}

export function formatInWorldDate(d: InWorldDate): string {
  return `Day ${d.day}, Year ${d.year}`
}

export function serializeInWorldDate(d: InWorldDate): string {
  return JSON.stringify({ ...d, label: formatInWorldDate(d) })
}

// ── Mini timeline SVG renderer ──────────────────────────────────────────────

interface MiniTimelineProps {
  campaignId: number
  selectedDay: number
  baseYear: number
  yearLength: number
  onPickDay: (day: number) => void
}

type ZoomLevel = 'full' | 'decade' | 'year' | 'day'

const ZOOM_BIN: Record<ZoomLevel, number | null> = { full: 50, decade: 10, year: null, day: null }
const ZOOM_LABEL: Record<ZoomLevel, string> = { full: 'Full', decade: '10yr', year: '1yr', day: 'Day' }
const ZOOM_ORDER: ZoomLevel[] = ['full', 'decade', 'year', 'day']

function MiniTimeline({ campaignId, selectedDay, baseYear, yearLength, onPickDay }: MiniTimelineProps) {
  const { sessions, arcs } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [zoom, setZoom] = useState<ZoomLevel>('year')
  const [hoverBin, setHoverBin] = useState<{ label: string; sx: number; syCount: number; evCount: number; nextZoom: ZoomLevel; centerYear: number } | null>(null)
  const [events, setEvents] = useState<{ day: number }[]>([])

  useEffect(() => {
    if (!campaignId) return
    window.api.getArticlesList({ campaignId, type: 'event' }).then((list: any[]) => {
      setEvents(list.flatMap((a: any) => {
        try {
          const t = JSON.parse(a.tracks ?? '{}')
          const d = parseInWorldDate(t.In_World_Date)
          return d ? [{ day: d.day }] : []
        } catch { return [] }
      }))
    })
  }, [campaignId])

  // ── Constants ───────────────────────────────────────────────────────────────
  const PAD_L = 20
  const PAD_R = 24
  const H = 60
  const AXIS_Y = 40
  const ARC_H = 8
  const ARC_Y = AXIS_Y - ARC_H - 4
  const isYearMode = zoom === 'full' || zoom === 'decade'

  // ── Day-mode geometry ────────────────────────────────────────────────────────
  const PX_PER_DAY = zoom === 'day' ? 6 : 2
  const allDays = [...sessions.map(s => (s as any).in_world_day).filter(Boolean), selectedDay || 1, 1]
  const MIN_DAY = Math.min(...allDays, 1) - 5
  const MAX_DAY = Math.max(...allDays, yearLength + 10) + 10
  const TOTAL_DAYS = MAX_DAY - MIN_DAY
  const W_DAY = PAD_L + TOTAL_DAYS * PX_PER_DAY + PAD_R
  const dxDay = (day: number) => PAD_L + (day - MIN_DAY) * PX_PER_DAY
  const xToDayLinear = (x: number) => Math.round((x - PAD_L) / PX_PER_DAY) + MIN_DAY

  // ── Year-mode geometry (log-linear) ─────────────────────────────────────────
  const CAMPAIGN_X = 170
  const PX_PER_YEAR = zoom === 'full' ? 14 : 22
  const LOG_K = 55
  const W_YEAR = 680

  const dxYear = (wy: number) => wy >= baseYear
    ? CAMPAIGN_X + (wy - baseYear) * PX_PER_YEAR
    : CAMPAIGN_X - LOG_K * Math.log(1 + (baseYear - wy) / 2)

  const xToWorldYear = (x: number) => x >= CAMPAIGN_X
    ? baseYear + (x - CAMPAIGN_X) / PX_PER_YEAR
    : baseYear - 2 * (Math.exp((CAMPAIGN_X - x) / LOG_K) - 1)

  const dayToWorldYear = (d: number) => baseYear + (d - 1) / yearLength
  const worldYearToDay = (wy: number) => Math.round((wy - baseYear) * yearLength + 1)

  const W = isYearMode ? W_YEAR : W_DAY
  const dx = isYearMode ? (d: number) => dxYear(dayToWorldYear(d)) : dxDay

  // ── Scroll to marker on zoom change ─────────────────────────────────────────
  useEffect(() => {
    if (!scrollRef.current) return
    const targetX = selectedDay ? dx(selectedDay) : (isYearMode ? CAMPAIGN_X : dxDay(1))
    scrollRef.current.scrollLeft = targetX - (scrollRef.current.clientWidth / 2)
  }, [zoom])

  // ── Shared data ──────────────────────────────────────────────────────────────
  const arcMap = Object.fromEntries(arcs.map(a => [a.id, a]))
  const arcSpans = arcs.map(arc => {
    const days = sessions.filter(s => s.arc_id === arc.id).map(s => (s as any).in_world_day ?? 0).filter(d => d > 0)
    if (!days.length) return null
    return { arc, start: Math.min(...days), end: Math.max(...days) + 8 }
  }).filter(Boolean) as { arc: typeof arcs[0]; start: number; end: number }[]

  const sessionDots = sessions
    .filter(s => (s as any).in_world_day)
    .map(s => ({ day: (s as any).in_world_day as number, color: arcMap[s.arc_id ?? 0]?.color ?? '#555' }))

  // ── Bin chips for year modes ─────────────────────────────────────────────────
  const binSize = ZOOM_BIN[zoom] ?? 10
  const bins = isYearMode ? (() => {
    const allHistoryDays = [...sessions.map(s => (s as any).in_world_day), ...events.map(e => e.day)].filter(d => d && d < 1)
    const oldestYear = allHistoryDays.length ? Math.floor(dayToWorldYear(Math.min(...allHistoryDays))) : baseYear - binSize
    const startBin = Math.floor(oldestYear / binSize) * binSize
    const result = []
    for (let y = startBin; y < baseYear; y += binSize) {
      const endY = Math.min(y + binSize, baseYear)
      const inBin = (d: number) => { const wy = dayToWorldYear(d); return wy >= y && wy < endY }
      result.push({
        startYear: y, endYear: endY,
        syCount: sessions.filter(s => inBin((s as any).in_world_day ?? 0)).length,
        evCount: events.filter(e => inBin(e.day)).length,
      })
    }
    return result
  })() : []

  // ── Mouse → day ──────────────────────────────────────────────────────────────
  const mouseToDay = (e: MouseEvent | React.MouseEvent): number | null => {
    if (!svgRef.current) return null
    const x = e.clientX - svgRef.current.getBoundingClientRect().left + (scrollRef.current?.scrollLeft ?? 0)
    if (isYearMode) {
      return worldYearToDay(Math.round(xToWorldYear(x)))
    }
    return Math.max(MIN_DAY, Math.min(MAX_DAY, xToDayLinear(x)))
  }

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragging.current) return
    const d = mouseToDay(e)
    if (d !== null) onPickDay(d)
  }

  const handleHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    dragging.current = true
    const onMove = (ev: MouseEvent) => { const d = mouseToDay(ev); if (d !== null) onPickDay(d) }
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const hasMarker = selectedDay !== 0
  const sx = hasMarker ? dx(selectedDay) : null
  const markerLabel = isYearMode ? `${Math.round(dayToWorldYear(selectedDay))}` : `D${selectedDay}`

  // ── Year-mode campaign year ticks ────────────────────────────────────────────
  const campaignYears = isYearMode ? (() => {
    const years = []
    for (let wy = baseYear; dxYear(wy) < W_YEAR - PAD_R; wy++) years.push(wy)
    return years
  })() : []

  return (
    <div>
      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        {ZOOM_ORDER.map(z => (
          <button key={z} onClick={() => setZoom(z)} style={{
            padding: '2px 7px', fontSize: 10, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: `1px solid ${zoom === z ? 'var(--border-gold)' : 'var(--border)'}`,
            background: zoom === z ? 'var(--bg-hover)' : 'transparent',
            color: zoom === z ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-ui)',
          }}>
            {ZOOM_LABEL[z]}
          </button>
        ))}
      </div>

      <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'visible', position: 'relative' }}>
        <svg
          ref={svgRef}
          width={W}
          height={H}
          style={{ display: 'block', cursor: 'crosshair', overflow: 'visible' }}
          onClick={handleSvgClick}
        >
          {isYearMode ? <>
            {/* Pre-campaign bin chips */}
            {bins.map(bin => {
              const x1 = Math.max(dxYear(bin.startYear), PAD_L)
              const x2 = dxYear(bin.endYear)
              const w = Math.max(x2 - x1, 8)
              const hasItems = bin.syCount > 0 || bin.evCount > 0
              const nextZoom = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + 1] ?? 'year'
              return (
                <g key={bin.startYear}
                  style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); setZoom(nextZoom); setHoverBin(null) }}
                  onMouseEnter={() => setHoverBin({ label: `${bin.startYear}–${bin.endYear}`, sx: (x1 + x2) / 2, syCount: bin.syCount, evCount: bin.evCount, nextZoom, centerYear: (bin.startYear + bin.endYear) / 2 })}
                  onMouseLeave={() => setHoverBin(null)}
                >
                  <rect x={x1} y={AXIS_Y - 18} width={w} height={18} rx="2"
                    fill={hasItems ? '#2a2820' : '#1a1810'} stroke={hasItems ? '#3a3828' : '#222018'} strokeWidth="1" />
                  {w > 18 && hasItems && (
                    <text x={x1 + w / 2} y={AXIS_Y - 7} textAnchor="middle" fill="#c8a84b88" fontSize="6" fontFamily="sans-serif">
                      {[bin.syCount > 0 && `${bin.syCount}s`, bin.evCount > 0 && `${bin.evCount}ev`].filter(Boolean).join(' · ')}
                    </text>
                  )}
                  {w > 30 && (
                    <text x={x1 + w / 2} y={AXIS_Y - 20} textAnchor="middle" fill="#3a3628" fontSize="6" fontFamily="sans-serif">
                      {bin.startYear}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Log-linear break */}
            <line x1={CAMPAIGN_X} y1={0} x2={CAMPAIGN_X} y2={AXIS_Y + 5} stroke="#c8a84b33" strokeWidth="1.5" strokeDasharray="3 2" />

            {/* Campaign year bands */}
            {campaignYears.map((wy, i) => {
              const x1 = dxYear(wy), x2 = dxYear(wy + 1)
              return (
                <g key={wy}>
                  <rect x={x1} y={0} width={x2 - x1} height={AXIS_Y} fill={i % 2 === 0 ? '#c8a84b08' : '#ffffff04'} />
                  <line x1={x1} y1={0} x2={x1} y2={AXIS_Y} stroke="#c8a84b18" strokeWidth="1" />
                  {x2 - x1 > 18 && <text x={x1 + 3} y={10} fill="#c8a84b55" fontSize="6" fontFamily="sans-serif" fontWeight="600">{wy}</text>}
                </g>
              )
            })}

            {/* Axis */}
            <line x1={PAD_L} y1={AXIS_Y} x2={W - PAD_R + 8} y2={AXIS_Y} stroke="#3a3828" strokeWidth="1.5" />
            <polygon points={`${W - PAD_R + 8},${AXIS_Y} ${W - PAD_R + 2},${AXIS_Y - 3} ${W - PAD_R + 2},${AXIS_Y + 3}`} fill="#3a3828" />

            {/* Campaign year ticks */}
            {campaignYears.map(wy => {
              const x = dxYear(wy)
              return x >= CAMPAIGN_X && x <= W - PAD_R ? (
                <g key={wy}>
                  <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 4} stroke="#2a2820" strokeWidth="1" />
                  <text x={x} y={AXIS_Y + 12} textAnchor="middle" fill="#3a3628" fontSize="6" fontFamily="sans-serif">{wy}</text>
                </g>
              ) : null
            })}

            {/* Arc tubes (campaign zone) */}
            {arcSpans.map(({ arc, start, end }) => {
              const x1 = dx(start), x2 = dx(end), w = Math.max(x2 - x1, 6)
              return (
                <g key={arc.id}>
                  <rect x={x1} y={ARC_Y} width={w} height={ARC_H} rx="4" fill={arc.color + '28'} stroke={arc.color + '55'} strokeWidth="1" />
                  {w > 20 && <text x={x1 + w / 2} y={ARC_Y + ARC_H / 2 + 3} textAnchor="middle" fill={arc.color} fontSize="5.5" fontFamily="sans-serif" fontWeight="600">{arc.name}</text>}
                </g>
              )
            })}

            {/* Session / event dots */}
            {sessionDots.map((s, i) => <circle key={i} cx={dx(s.day)} cy={AXIS_Y} r="3" fill={s.color} opacity={0.7} />)}
            {events.filter(e => e.day >= 1).map((e, i) => <circle key={i} cx={dx(e.day)} cy={AXIS_Y} r="2.5" fill="#e05555" opacity={0.7} />)}

          </> : <>
            {/* Day-mode year bands */}
            {(() => {
              const bands = []
              const firstYi = Math.floor((MIN_DAY - 1) / yearLength)
              for (let yi = firstYi; ; yi++) {
                const bandStart = 1 + yi * yearLength
                const x1 = Math.max(dxDay(Math.max(bandStart, MIN_DAY)), PAD_L)
                const x2 = Math.min(dxDay(Math.min(bandStart + yearLength - 1, MAX_DAY)), W_DAY - PAD_R)
                if (x1 > W_DAY - PAD_R) break
                const wy = baseYear + yi
                bands.push(
                  <g key={yi}>
                    <rect x={x1} y={0} width={Math.max(x2 - x1, 0)} height={AXIS_Y} fill={yi % 2 === 0 ? '#c8a84b08' : '#ffffff04'} />
                    {dxDay(bandStart) >= PAD_L && yi !== firstYi && <line x1={dxDay(bandStart)} y1={0} x2={dxDay(bandStart)} y2={AXIS_Y} stroke="#c8a84b18" strokeWidth="1" />}
                    {x2 - x1 > 20 && <text x={x1 + 4} y={10} fill="#c8a84b55" fontSize="7" fontFamily="sans-serif" fontWeight="600">{wy}</text>}
                  </g>
                )
              }
              return bands
            })()}

            {/* Axis */}
            <line x1={PAD_L} y1={AXIS_Y} x2={W_DAY - PAD_R + 8} y2={AXIS_Y} stroke="#3a3828" strokeWidth="1.5" />
            <polygon points={`${W_DAY - PAD_R + 8},${AXIS_Y} ${W_DAY - PAD_R + 2},${AXIS_Y - 3} ${W_DAY - PAD_R + 2},${AXIS_Y + 3}`} fill="#3a3828" />

            {/* Day ticks */}
            {Array.from({ length: Math.ceil(TOTAL_DAYS / (zoom === 'day' ? 10 : 30)) + 2 }, (_, i) => {
              const step = zoom === 'day' ? 10 : 30
              const day = Math.ceil(MIN_DAY / step) * step + i * step
              if (day > MAX_DAY) return null
              const x = dxDay(day)
              return (
                <g key={day}>
                  <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 4} stroke="#2a2820" strokeWidth="1" />
                  <text x={x} y={AXIS_Y + 13} textAnchor="middle" fill={day <= 0 ? '#6b5050' : '#3a3628'} fontSize="7" fontFamily="sans-serif">{`D${day}`}</text>
                </g>
              )
            })}

            {/* Arc tubes */}
            {arcSpans.map(({ arc, start, end }) => {
              const x1 = dxDay(start), x2 = dxDay(end), w = Math.max(x2 - x1, 6)
              return (
                <g key={arc.id}>
                  <rect x={x1} y={ARC_Y} width={w} height={ARC_H} rx="4" fill={arc.color + '28'} stroke={arc.color + '55'} strokeWidth="1" />
                  {w > 30 && <text x={x1 + w / 2} y={ARC_Y + ARC_H / 2 + 3} textAnchor="middle" fill={arc.color} fontSize="6" fontFamily="sans-serif" fontWeight="600">{arc.name}</text>}
                </g>
              )
            })}

            {/* Session dots */}
            {sessionDots.map((s, i) => <circle key={i} cx={dxDay(s.day)} cy={AXIS_Y} r="3" fill={s.color} opacity={0.7} />)}
          </>}

          {/* Draggable marker — shared */}
          {hasMarker && sx !== null && (
            <g onMouseDown={handleHandleMouseDown} style={{ cursor: 'ew-resize' }}>
              <line x1={sx} y1={0} x2={sx} y2={AXIS_Y + 4} stroke="#c8a84b" strokeWidth="1.5" />
              <rect x={sx - 16} y={1} width={32} height={13} rx="3" fill="#c8a84b" />
              <text x={sx} y={10} textAnchor="middle" fill="#131210" fontSize="7" fontFamily="sans-serif" fontWeight="700">{markerLabel}</text>
              <rect x={sx - 10} y={0} width={20} height={H} fill="transparent" />
            </g>
          )}
        </svg>

        {/* Bin hover tooltip */}
        {hoverBin && (
          <div style={{
            position: 'absolute', pointerEvents: 'none', zIndex: 20,
            left: Math.max(4, Math.min(hoverBin.sx - 64, (scrollRef.current?.clientWidth ?? 360) - 132)),
            top: AXIS_Y - 66,
            background: 'var(--bg-surface)', border: '1px solid var(--border-gold)',
            borderRadius: 'var(--radius-sm)', padding: '6px 9px',
            fontSize: 10, color: 'var(--text-secondary)', boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: 3 }}>{hoverBin.label}</div>
            {hoverBin.syCount > 0 && <div>{hoverBin.syCount} session{hoverBin.syCount !== 1 ? 's' : ''}</div>}
            {hoverBin.evCount > 0 && <div>{hoverBin.evCount} event{hoverBin.evCount !== 1 ? 's' : ''}</div>}
            {hoverBin.syCount === 0 && hoverBin.evCount === 0 && <div style={{ color: 'var(--text-muted)' }}>empty</div>}
            <div style={{ color: 'var(--text-muted)', marginTop: 4, paddingTop: 3, borderTop: '1px solid var(--border)' }}>
              click to zoom into {ZOOM_LABEL[hoverBin.nextZoom]}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Context label ───────────────────────────────────────────────────────────

function contextLabel(day: number, sessions: any[], arcs: any[]): string {
  const arcMap = Object.fromEntries(arcs.map((a: any) => [a.id, a]))
  const dated = sessions
    .filter((s: any) => s.in_world_day)
    .sort((a: any, b: any) => a.in_world_day - b.in_world_day)

  const prev = [...dated].reverse().find((s: any) => s.in_world_day <= day)
  const next = dated.find((s: any) => s.in_world_day > day)

  let ctx = ''
  if (prev && next) ctx = `between Session ${prev.session_number}${prev.session_sub ?? ''} and Session ${next.session_number}${next.session_sub ?? ''}`
  else if (prev) ctx = `after Session ${prev.session_number}${prev.session_sub ?? ''}`
  else if (next) ctx = `before Session ${next.session_number}${next.session_sub ?? ''}`
  else ctx = 'no sessions placed yet'

  const arc = arcs.find((a: any) => {
    const arcSessions = sessions.filter((s: any) => s.arc_id === a.id && s.in_world_day)
    if (arcSessions.length === 0) return false
    const min = Math.min(...arcSessions.map((s: any) => s.in_world_day))
    const max = Math.max(...arcSessions.map((s: any) => s.in_world_day)) + 8
    return day >= min && day <= max
  })
  if (arc) ctx += ` · ${arc.name}`

  return ctx
}

// ── Main component ──────────────────────────────────────────────────────────

interface InWorldDatePickerProps {
  value: string          // serialized InWorldDate JSON or ''
  onChange: (raw: string) => void
  baseYear?: number
  label?: string
}

const YEAR_LENGTH = 365

function deriveYear(day: number, baseYear: number): number {
  return baseYear + Math.floor((day - 1) / YEAR_LENGTH)
}

export function InWorldDatePicker({ value, onChange, baseYear = 1507, label = 'In-world date' }: InWorldDatePickerProps) {
  const { currentCampaign, sessions, arcs } = useStore()
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [dropLeft, setDropLeft] = useState(false)
  const [day, setDay] = useState<number>(() => parseInWorldDate(value)?.day ?? 0)
  const containerRef = useRef<HTMLDivElement>(null)

  const year = day !== 0 ? deriveYear(day, baseYear) : baseYear

  // Sync inbound value
  useEffect(() => {
    const d = parseInWorldDate(value)
    if (d) setDay(d.day)
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggleOpen = () => {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDropUp(window.innerHeight - rect.bottom < 340)
      setDropLeft(window.innerWidth - rect.left < 360)
    }
    setOpen(o => !o)
  }

  const commit = (d: number) => {
    const y = deriveYear(d, baseYear)
    const date: InWorldDate = { day: d, year: y, label: `Day ${d}, Year ${y}` }
    onChange(serializeInWorldDate(date))
  }

  const handlePickDay = (d: number) => {
    setDay(d)
    commit(d)
  }

  const handleDayInput = (v: string) => {
    const n = parseInt(v)
    if (isNaN(n)) return
    setDay(n)
    commit(n)
  }

  const displayValue = day !== 0 ? `Day ${day}, Year ${year}` : ''
  const ctx = day !== 0 ? contextLabel(day, sessions as any[], arcs) : ''

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <button
        onClick={handleToggleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', background: 'var(--bg-elevated)', border: `1px solid ${open ? 'var(--border-gold)' : 'var(--border-light)'}`,
          borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'border-color var(--transition)',
          color: displayValue ? 'var(--gold)' : 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-ui)',
        }}
      >
        <span>{displayValue || 'Pick a date…'}</span>
        <Calendar size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', ...(dropUp ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }), ...(dropLeft ? { right: 0 } : { left: 0 }),
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          zIndex: 200, overflow: 'hidden', minWidth: 360,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Day</span>
              <input
                type="number" value={day || ''}
                placeholder="—"
                onChange={e => handleDayInput(e.target.value)}
                style={{ width: 56, padding: '3px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: day <= 0 ? '#e88c3a' : 'var(--gold)', fontSize: 12, fontFamily: 'var(--font-ui)', textAlign: 'center' }}
              />
              {day !== 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  Year <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{year}</span>
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
              <X size={13} />
            </button>
          </div>

          {/* Mini timeline */}
          <div style={{ padding: '8px 12px 4px' }}>
            {currentCampaign && (
              <MiniTimeline
                campaignId={currentCampaign.id}
                selectedDay={day}
                baseYear={baseYear}
                yearLength={YEAR_LENGTH}
                onPickDay={handlePickDay}
              />
            )}
          </div>

          {/* Context footer */}
          {day !== 0 && (
            <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <span style={{ color: day <= 0 ? '#e88c3a' : 'var(--gold)' }}>Day {day}, Year {year}</span>
              {day <= 0 && <span style={{ color: '#e88c3a88' }}> (before campaign start)</span>}
              {ctx && <span> — {ctx}</span>}
            </div>
          )}

          {/* Clear */}
          {day !== 0 && (
            <button
              onClick={() => { setDay(0); onChange(''); setOpen(false) }}
              style={{ width: '100%', padding: '7px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', transition: 'background var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  )
}