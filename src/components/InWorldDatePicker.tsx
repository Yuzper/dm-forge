// path: src/components/InWorldDatePicker.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import { Calendar, X, Trash2 } from 'lucide-react'
import {
  ZoomLevel, ZOOM_LABEL, ZOOM_ORDER,
  isYearMode, dayToWorldYear, computeBins,
  makePickerAxisGeo, DEFAULT_BASE_YEAR,
  type CampaignCalendar, getCampaignCalendar, defaultCalendar,
  yearLength, startDayOfYear, dayToCalendarDate, calendarDateToDay,
  formatCalendarDay, isPlainCalendar, spanLabel,
} from '../utils/timelineGeometry'

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
  cal: CampaignCalendar
  onPickDay: (day: number) => void
}

function MiniTimeline({ campaignId, selectedDay, cal, onPickDay }: MiniTimelineProps) {
  const { sessions, arcs } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [zoom, setZoom] = useState<ZoomLevel>('day')
  const [hoverBin, setHoverBin] = useState<{ label: string; sx: number; syCount: number; evCount: number; nextZoom: ZoomLevel; centerYear: number } | null>(null)
  const [events, setEvents] = useState<{ day: number; kind: 'event' | 'death' }[]>([])

  useEffect(() => {
    if (!campaignId) return
    Promise.all([
      window.api.getArticlesList({ campaignId, type: 'event' }),
      window.api.getArticlesList({ campaignId, type: 'character' }),
      window.api.getArticlesList({ campaignId, type: 'playerCharacter' }),
    ]).then(([evList, charList, pcList]: any[][]) => {
      const evItems = evList.flatMap((a: any) => {
        try {
          const t = JSON.parse(a.tracks ?? '{}')
          const d = parseInWorldDate(t.In_World_Date)
          return d ? [{ day: d.day, kind: 'event' as const }] : []
        } catch { return [] }
      })
      const deathItems = [...charList, ...pcList].flatMap((a: any) => {
        try {
          const t = JSON.parse(a.tracks ?? '{}')
          const d = parseInWorldDate(t.Death_Date)
          return d ? [{ day: d.day, kind: 'death' as const }] : []
        } catch { return [] }
      })
      setEvents([...evItems, ...deathItems])
    })
  }, [campaignId])

  // ── Layout constants ─────────────────────────────────────────────────────────
  const PAD_L = 20
  const PAD_R = 24
  const H = 60
  const AXIS_Y = 40
  const ARC_H = 8
  const ARC_Y = AXIS_Y - ARC_H - 4

  // ── Geometry (shared utility) ────────────────────────────────────────────────
  const L = yearLength(cal)
  const startOff = startDayOfYear(cal) - 1   // days of the start year before campaign day 1
  const baseYear = cal.start.year
  const PX_PER_DAY = zoom === 'day' ? 6 : 2
  const allDays = [...sessions.map(s => (s as any).in_world_day).filter(Boolean), selectedDay || 1, 1]
  const MIN_DAY = Math.min(...allDays, 1) - 5
  const MAX_DAY = Math.max(...allDays, L + 10) + 10
  const geo = makePickerAxisGeo(zoom, PAD_L, MIN_DAY, PX_PER_DAY, cal)
  const { dx, xToDay, worldYearToX } = geo
  const W_DAY = PAD_L + (MAX_DAY - MIN_DAY) * PX_PER_DAY + PAD_R
  const W_YEAR = 680
  const W = isYearMode(zoom) ? W_YEAR : W_DAY

  // ── Scroll to marker on zoom change ─────────────────────────────────────────
  useEffect(() => {
    if (!scrollRef.current) return
    const targetX = selectedDay ? dx(selectedDay) : (isYearMode(zoom) ? PAD_L + geo.campaignOffX : PAD_L + (1 - MIN_DAY) * PX_PER_DAY)
    scrollRef.current.scrollLeft = targetX - (scrollRef.current.clientWidth / 2)
  }, [zoom, selectedDay])

  // ── Shared data ──────────────────────────────────────────────────────────────
  const arcMap = Object.fromEntries(arcs.map(a => [a.id, a]))
  const arcSpans = arcs.map(arc => {
    const days = sessions.filter(s => s.arc_id === arc.id).map(s => (s as any).in_world_day ?? 0).filter(d => d > 0)
    if (!days.length) return null
    return { arc, start: Math.min(...days), end: Math.max(...days) }
  }).filter(Boolean) as { arc: typeof arcs[0]; start: number; end: number }[]

  const sessionDots = sessions
    .filter(s => (s as any).in_world_day)
    .map(s => ({ day: (s as any).in_world_day as number, color: arcMap[s.arc_id ?? 0]?.color ?? '#555' }))

  // ── Bin chips (pre-campaign context only) ───────────────────────────────────
  const bins = computeBins(zoom, cal, sessions as any[], events).filter(b => b.zone === 'pre')

  // ── Mouse → day ──────────────────────────────────────────────────────────────
  const mouseToDay = (e: MouseEvent | React.MouseEvent): number | null => {
    if (!svgRef.current) return null
    // svg.getBoundingClientRect() already accounts for the scroll position, so
    // the click-to-content x is simply clientX minus the svg's left edge.
    const x = e.clientX - svgRef.current.getBoundingClientRect().left
    return Math.max(MIN_DAY, Math.min(MAX_DAY, xToDay(x)))
  }

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragging.current) return
    const d = mouseToDay(e); if (d !== null) onPickDay(d)
  }

  const handleHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    dragging.current = true
    document.body.style.userSelect = 'none'   // stop dragging from selecting page text
    const onMove = (ev: MouseEvent) => { ev.preventDefault(); const d = mouseToDay(ev); if (d !== null) onPickDay(d) }
    const onUp = () => {
      dragging.current = false
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const hasMarker = selectedDay !== 0
  const sx = hasMarker ? dx(selectedDay) : null
  const markerLabel = isYearMode(zoom) ? `${Math.round(dayToWorldYear(selectedDay, cal))}` : `D${selectedDay}`

  // ── Year-mode campaign year ticks (guard: pxPerYear=0 means no campaign zone) ─
  const campaignYears = isYearMode(zoom) && geo.pxPerYear > 0 ? (() => {
    const years: number[] = []
    for (let wy = baseYear; worldYearToX(wy) < W_YEAR - PAD_R; wy++) years.push(wy)
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
          style={{ display: 'block', cursor: 'crosshair', overflow: 'visible', userSelect: 'none' }}
          onClick={handleSvgClick}
        >
          {/* Pre-campaign bin chips — all zoom levels */}
          {bins.length > 0 && <>
            {bins.map(bin => {
              const x1 = Math.max(worldYearToX(bin.startYear), PAD_L)
              const x2 = worldYearToX(bin.endYear)
              const w = Math.max(x2 - x1, 8)
              const hasItems = bin.syCount > 0 || bin.evCount > 0
              const nextZoom = ZOOM_ORDER[ZOOM_ORDER.indexOf(zoom) + 1] ?? zoom
              return (
                <g key={bin.startYear} style={{ cursor: nextZoom !== zoom ? 'pointer' : 'default' }}
                  onClick={e => { e.stopPropagation(); if (nextZoom !== zoom) { setZoom(nextZoom); setHoverBin(null) } }}
                  onMouseEnter={() => setHoverBin({ label: `${bin.startYear}–${bin.endYear}`, sx: (x1 + x2) / 2, syCount: bin.syCount, evCount: bin.evCount, nextZoom, centerYear: (bin.startYear + bin.endYear) / 2 })}
                  onMouseLeave={() => setHoverBin(null)}>
                  <rect x={x1} y={AXIS_Y - 18} width={w} height={18} rx="2"
                    fill={hasItems ? '#2a2820' : '#1a1810'} stroke={hasItems ? '#3a3828' : '#222018'} strokeWidth="1" />
                  {w > 18 && hasItems && <text x={x1 + w / 2} y={AXIS_Y - 7} textAnchor="middle" fill="#c8a84b88" fontSize="6" fontFamily="sans-serif">{[bin.syCount > 0 && `${bin.syCount}s`, bin.evCount > 0 && `${bin.evCount}ev`].filter(Boolean).join(' · ')}</text>}
                  {w > 30 && <text x={x1 + w / 2} y={AXIS_Y - 20} textAnchor="middle" fill="#3a3628" fontSize="6" fontFamily="sans-serif">{bin.startYear}</text>}
                </g>
              )
            })}
            {/* Log-linear break */}
            <line x1={PAD_L + geo.campaignOffX} y1={0} x2={PAD_L + geo.campaignOffX} y2={AXIS_Y + 5} stroke="#c8a84b33" strokeWidth="1.5" strokeDasharray="3 2" />
          </>}

          {isYearMode(zoom) && <>

            {/* Campaign year bands */}
            {campaignYears.map((wy, i) => {
              const x1 = worldYearToX(wy), x2 = worldYearToX(wy + 1)
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
              const x = worldYearToX(wy)
              return x >= PAD_L + geo.campaignOffX && x <= W - PAD_R ? (
                <g key={wy}>
                  <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 4} stroke="#2a2820" strokeWidth="1" />
                  <text x={x} y={AXIS_Y + 12} textAnchor="middle" fill="#3a3628" fontSize="6" fontFamily="sans-serif">{wy}</text>
                </g>
              ) : null
            })}

            {/* Arc tubes */}
            {arcSpans.map(({ arc, start, end }) => {
              const x1 = dx(start), x2 = dx(end), w = Math.max(x2 - x1, 6)
              return (
                <g key={arc.id}>
                  <rect x={x1} y={ARC_Y} width={w} height={ARC_H} rx="4" fill={arc.color + '28'} stroke={arc.color + '55'} strokeWidth="1" />
                  {w > 20 && <text x={x1 + w / 2} y={ARC_Y + ARC_H / 2 + 3} textAnchor="middle" fill={arc.color} fontSize="5.5" fontFamily="sans-serif" fontWeight="600">{arc.name}</text>}
                </g>
              )
            })}

            {/* Session / event / death dots */}
            {sessionDots.map((s, i) => <circle key={i} cx={dx(s.day)} cy={AXIS_Y} r="3" fill={s.color} opacity={0.7} />)}
            {events.map((e, i) => <circle key={i} cx={dx(e.day)} cy={AXIS_Y} r="2.5" fill={e.kind === 'death' ? '#9b7de8' : '#e05555'} opacity={0.7} />)}

          </>}

          {!isYearMode(zoom) && <>
            {/* Day-mode year bands */}
            {(() => {
              const bands: React.ReactNode[] = []
              const firstYi = Math.floor((MIN_DAY - 1 + startOff) / L)
              for (let yi = firstYi; ; yi++) {
                const bandStart = 1 - startOff + yi * L
                const x1 = Math.max(dx(Math.max(bandStart, MIN_DAY)), PAD_L)
                const x2 = Math.min(dx(Math.min(bandStart + L - 1, MAX_DAY)), W_DAY - PAD_R)
                if (x1 > W_DAY - PAD_R) break
                const wy = baseYear + yi
                bands.push(
                  <g key={yi}>
                    <rect x={x1} y={0} width={Math.max(x2 - x1, 0)} height={AXIS_Y} fill={yi % 2 === 0 ? '#c8a84b08' : '#ffffff04'} />
                    {dx(bandStart) >= PAD_L && yi !== firstYi && <line x1={dx(bandStart)} y1={0} x2={dx(bandStart)} y2={AXIS_Y} stroke="#c8a84b18" strokeWidth="1" />}
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
            {Array.from({ length: Math.ceil((MAX_DAY - MIN_DAY) / (zoom === 'day' ? 10 : 30)) + 2 }, (_, i) => {
              const step = zoom === 'day' ? 10 : 30
              const day = Math.ceil(MIN_DAY / step) * step + i * step
              if (day > MAX_DAY) return null
              const x = dx(day)
              return (
                <g key={day}>
                  <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 4} stroke="#2a2820" strokeWidth="1" />
                  <text x={x} y={AXIS_Y + 13} textAnchor="middle" fill={day <= 0 ? '#6b5050' : '#3a3628'} fontSize="7" fontFamily="sans-serif">{`D${day}`}</text>
                </g>
              )
            })}

            {/* Arc tubes */}
            {arcSpans.map(({ arc, start, end }) => {
              const x1 = dx(start), x2 = dx(end), w = Math.max(x2 - x1, 6)
              return (
                <g key={arc.id}>
                  <rect x={x1} y={ARC_Y} width={w} height={ARC_H} rx="4" fill={arc.color + '28'} stroke={arc.color + '55'} strokeWidth="1" />
                  {w > 30 && <text x={x1 + w / 2} y={ARC_Y + ARC_H / 2 + 3} textAnchor="middle" fill={arc.color} fontSize="6" fontFamily="sans-serif" fontWeight="600">{arc.name}</text>}
                </g>
              )
            })}

            {/* Session / event / death dots */}
            {sessionDots.map((s, i) => <circle key={i} cx={dx(s.day)} cy={AXIS_Y} r="3" fill={s.color} opacity={0.7} />)}
            {events.map((e, i) => <circle key={i} cx={dx(e.day)} cy={AXIS_Y} r="2.5" fill={e.kind === 'death' ? '#9b7de8' : '#e05555'} opacity={0.7} />)}
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

export function InWorldDatePicker({ value, onChange, baseYear = DEFAULT_BASE_YEAR, label = 'In-world date' }: InWorldDatePickerProps) {
  const { currentCampaign, sessions, arcs } = useStore()
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [dropLeft, setDropLeft] = useState(false)
  const [day, setDay] = useState<number>(() => parseInWorldDate(value)?.day ?? 0)
  const containerRef = useRef<HTMLDivElement>(null)

  const cal = currentCampaign ? getCampaignCalendar(currentCampaign) : defaultCalendar(baseYear)
  const plain = isPlainCalendar(cal)
  // Calendar date of the current selection (day 1 as the editing base when unset).
  const calDate = dayToCalendarDate(day || 1, cal)
  const year = day !== 0 ? calDate.year : cal.start.year

  // Local text buffer for the editable year field, so partial edits (and
  // clearing the box) don't snap the marker around mid-type.
  const [yearInput, setYearInput] = useState<string>(String(year))
  useEffect(() => { setYearInput(String(year)) }, [year])

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
    const date: InWorldDate = { day: d, year: dayToCalendarDate(d, cal).year, label: formatCalendarDay(d, cal) }
    onChange(JSON.stringify(date))
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

  // Day-within-span input (calendar mode) — clamped to the span's length.
  const handleSpanDayInput = (v: string) => {
    const n = parseInt(v)
    if (isNaN(n)) return
    const clamped = Math.min(Math.max(1, n), cal.spans[calDate.span].days)
    const d = calendarDateToDay(year, calDate.span, clamped, cal)
    setDay(d)
    commit(d)
  }

  // Span select (calendar mode) — keeps the day-of-span, clamped to the new span.
  const handleSpanSelect = (idx: number) => {
    const clampedDay = Math.min(calDate.dayOfSpan, cal.spans[idx].days)
    const d = calendarDateToDay(year, idx, clampedDay, cal)
    setDay(d)
    commit(d)
  }

  // Editing the year shifts the absolute day by whole years, keeping the
  // day-of-year fixed (so the marker lands on the same day in the new year).
  const handleYearInput = (v: string) => {
    setYearInput(v)
    const y = parseInt(v)
    if (isNaN(y)) return
    const newDay = calendarDateToDay(y, calDate.span, calDate.dayOfSpan, cal)
    setDay(newDay)
    commit(newDay)
  }

  const displayValue = day !== 0 ? formatCalendarDay(day, cal) : ''
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
          zIndex: 200, width: 380, maxHeight: 340, display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {plain ? (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Day</span>
                  <input
                    type="number" value={day || ''}
                    placeholder="—"
                    onChange={e => handleDayInput(e.target.value)}
                    style={{ width: 56, padding: '3px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: day <= 0 ? '#e88c3a' : 'var(--gold)', fontSize: 12, fontFamily: 'var(--font-ui)', textAlign: 'center' }}
                  />
                </>
              ) : (
                <>
                  <input
                    type="number" value={day !== 0 ? calDate.dayOfSpan : ''}
                    placeholder="—"
                    min={1} max={cal.spans[calDate.span].days}
                    onChange={e => handleSpanDayInput(e.target.value)}
                    title={`Day within ${spanLabel(cal, calDate.span)} (1–${cal.spans[calDate.span].days})`}
                    style={{ width: 46, padding: '3px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: day <= 0 && day !== 0 ? '#e88c3a' : 'var(--gold)', fontSize: 12, fontFamily: 'var(--font-ui)', textAlign: 'center' }}
                  />
                  <select
                    value={calDate.span}
                    onChange={e => handleSpanSelect(parseInt(e.target.value))}
                    title={cal.unitName}
                    style={{ maxWidth: 120, padding: '3px 4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-ui)', outline: 'none' }}
                  >
                    {cal.spans.map((_, i) => <option key={i} value={i}>{spanLabel(cal, i)}</option>)}
                  </select>
                </>
              )}
              {(day !== 0 || !plain) && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                  Year
                  <input
                    type="number" value={yearInput}
                    onChange={e => handleYearInput(e.target.value)}
                    onBlur={() => setYearInput(String(year))}
                    title="Edit the year — shifts the date by whole years"
                    style={{ width: 60, padding: '3px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-ui)', textAlign: 'center' }}
                  />
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
              <X size={13} />
            </button>
          </div>

          {/* Scrollable body: mini timeline + context */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <div style={{ padding: '8px 12px 4px' }}>
              {currentCampaign && (
                <MiniTimeline
                  campaignId={currentCampaign.id}
                  selectedDay={day}
                  cal={cal}
                  onPickDay={handlePickDay}
                />
              )}
            </div>

            {/* Context footer */}
            {day !== 0 && (
              <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <span style={{ color: day <= 0 ? '#e88c3a' : 'var(--gold)' }}>{formatCalendarDay(day, cal)}</span>
                {!plain && <span style={{ color: 'var(--text-muted)' }}> · day {day} of the campaign</span>}
                {day <= 0 && <span style={{ color: '#e88c3a88' }}> (before campaign start)</span>}
                {ctx && <span> — {ctx}</span>}
              </div>
            )}
          </div>

          {/* Clear */}
          {day !== 0 && (
            <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { setDay(0); onChange(''); setOpen(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', background: '#e0555518', border: '1px solid #e0555555', borderRadius: 'var(--radius-sm)', color: 'var(--danger-soft)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e0555530'; (e.currentTarget as HTMLElement).style.color = '#ff8888' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#e0555518'; (e.currentTarget as HTMLElement).style.color = 'var(--danger-soft)' }}
              >
                <Trash2 size={13} /> Clear date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}