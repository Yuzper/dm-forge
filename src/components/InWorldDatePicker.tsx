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
  onPickDay: (day: number) => void
}

function MiniTimeline({ campaignId, selectedDay, baseYear, onPickDay }: MiniTimelineProps) {
  const { sessions, arcs } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const PX_PER_DAY = 6
  const PAD_L = 20
  const PAD_R = 24
  const H = 52
  const AXIS_Y = 32
  const ARC_H = 8
  const ARC_Y = AXIS_Y - ARC_H - 4

  const allDays = [
    ...sessions.map(s => (s as any).in_world_day).filter(Boolean),
    selectedDay || 1,
    1,
  ]
  const MIN_DAY = Math.min(...allDays, 1) - 5
  const MAX_DAY = Math.max(...allDays, 60) + 10
  const TOTAL_DAYS = MAX_DAY - MIN_DAY
  const W = PAD_L + TOTAL_DAYS * PX_PER_DAY + PAD_R

  const dx = useCallback((day: number) => PAD_L + (day - MIN_DAY) * PX_PER_DAY, [MIN_DAY])
  const xToDay = useCallback((x: number) => Math.round((x - PAD_L) / PX_PER_DAY) + MIN_DAY, [MIN_DAY])

  // Scroll selected day into view when opening
  useEffect(() => {
    if (!scrollRef.current || !selectedDay) return
    const targetX = dx(selectedDay)
    const containerW = scrollRef.current.clientWidth
    scrollRef.current.scrollLeft = targetX - containerW / 2
  }, [])

  // Arc spans
  const arcMap = Object.fromEntries(arcs.map(a => [a.id, a]))
  const arcSpans = arcs.map(arc => {
    const days = sessions.filter(s => s.arc_id === arc.id)
      .map(s => (s as any).in_world_day ?? 0).filter(d => d > 0)
    if (!days.length) return null
    return { arc, start: Math.min(...days), end: Math.max(...days) + 8 }
  }).filter(Boolean) as { arc: typeof arcs[0]; start: number; end: number }[]

  // Session dots
  const sessionDots = sessions
    .filter(s => (s as any).in_world_day)
    .map(s => ({ day: (s as any).in_world_day as number, color: arcMap[s.arc_id ?? 0]?.color ?? '#555' }))

  const dayFromEvent = (e: MouseEvent | React.MouseEvent) => {
    if (!svgRef.current) return null
    const scrollX = scrollRef.current?.scrollLeft ?? 0
    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollX
    return Math.max(MIN_DAY, Math.min(MAX_DAY, xToDay(x)))
  }

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragging.current) return
    const d = dayFromEvent(e)
    if (d !== null) onPickDay(d)
  }

  const handleHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    dragging.current = true
    const onMove = (ev: MouseEvent) => {
      const d = dayFromEvent(ev)
      if (d !== null) onPickDay(d)
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const hasMarker = selectedDay !== 0
  const sx = hasMarker ? dx(selectedDay) : null

  return (
    <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        style={{ display: 'block', cursor: 'crosshair', overflow: 'visible' }}
        onClick={handleSvgClick}
      >
        {/* Axis */}
        <line x1={PAD_L} y1={AXIS_Y} x2={W - PAD_R + 8} y2={AXIS_Y} stroke="#3a3828" strokeWidth="1.5" />
        <polygon points={`${W - PAD_R + 8},${AXIS_Y} ${W - PAD_R + 2},${AXIS_Y - 3} ${W - PAD_R + 2},${AXIS_Y + 3}`} fill="#3a3828" />

        {/* Ticks */}
        {Array.from({ length: Math.ceil(TOTAL_DAYS / 10) + 2 }, (_, i) => {
          const day = Math.ceil(MIN_DAY / 10) * 10 + i * 10
          if (day > MAX_DAY) return null
          const x = dx(day)
          return (
            <g key={day}>
              <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 4} stroke="#2a2820" strokeWidth="1" />
              <text x={x} y={AXIS_Y + 13} textAnchor="middle" fill={day <= 0 ? '#6b5050' : '#3a3628'} fontSize="7" fontFamily="sans-serif">{`D${day}`}</text>
            </g>
          )
        })}

        {/* Day 1 reference */}
        {MIN_DAY < 1 && (
          <line x1={dx(1)} y1={0} x2={dx(1)} y2={AXIS_Y + 4} stroke="#c8a84b22" strokeWidth="1" strokeDasharray="2 2" />
        )}

        {/* Arc tubes */}
        {arcSpans.map(({ arc, start, end }) => {
          const x1 = dx(start), x2 = dx(end), w = Math.max(x2 - x1, 6)
          return (
            <g key={arc.id}>
              <rect x={x1} y={ARC_Y} width={w} height={ARC_H} rx="4"
                fill={arc.color + '28'} stroke={arc.color + '55'} strokeWidth="1" />
              {w > 30 && (
                <text x={x1 + w / 2} y={ARC_Y + ARC_H / 2 + 3}
                  textAnchor="middle" fill={arc.color} fontSize="6" fontFamily="sans-serif" fontWeight="600">
                  {arc.name}
                </text>
              )}
            </g>
          )
        })}

        {/* Session dots on axis */}
        {sessionDots.map((s, i) => (
          <circle key={i} cx={dx(s.day)} cy={AXIS_Y} r="3" fill={s.color} opacity={0.7} />
        ))}

        {/* Draggable selected day handle */}
        {hasMarker && sx !== null && (
          <g
            onMouseDown={handleHandleMouseDown}
            style={{ cursor: 'ew-resize' }}
          >
            <line x1={sx} y1={0} x2={sx} y2={AXIS_Y + 4} stroke="#c8a84b" strokeWidth="1.5" />
            {/* Grip pill */}
            <rect x={sx - 14} y={1} width={28} height={13} rx="3" fill="#c8a84b" />
            <text x={sx} y={10} textAnchor="middle" fill="#131210" fontSize="7" fontFamily="sans-serif" fontWeight="700">
              D{selectedDay}
            </text>
            {/* Invisible wider hit area */}
            <rect x={sx - 10} y={0} width={20} height={H} fill="transparent" />
          </g>
        )}
      </svg>
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

export function InWorldDatePicker({ value, onChange, baseYear = 1507, label = 'In-world date' }: InWorldDatePickerProps) {
  const { currentCampaign, sessions, arcs } = useStore()
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [dropLeft, setDropLeft] = useState(false)
  const [day, setDay] = useState<number>(() => parseInWorldDate(value)?.day ?? 0)
  const [year, setYear] = useState<number>(() => parseInWorldDate(value)?.year ?? baseYear)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync inbound value
  useEffect(() => {
    const d = parseInWorldDate(value)
    if (d) { setDay(d.day); setYear(d.year) }
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

  const commit = (d: number, y: number) => {
    const date: InWorldDate = { day: d, year: y, label: `Day ${d}, Year ${y}` }
    onChange(serializeInWorldDate(date))
  }

  const handlePickDay = (d: number) => {
    setDay(d)
    commit(d, year)
  }

  const handleDayInput = (v: string) => {
    const n = parseInt(v)
    if (isNaN(n)) return
    setDay(n)
    commit(n, year)
  }

  const handleYearInput = (v: string) => {
    const n = parseInt(v) || baseYear
    setYear(n)
    if (day > 0) commit(day, n)
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
          {/* Header with manual inputs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Day</span>
              <input
                type="number" value={day || ''}
                placeholder="—"
                onChange={e => handleDayInput(e.target.value)}
                style={{ width: 56, padding: '3px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: day <= 0 ? '#e88c3a' : 'var(--gold)', fontSize: 12, fontFamily: 'var(--font-ui)', textAlign: 'center' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Year</span>
              <input
                type="number" value={year}
                onChange={e => handleYearInput(e.target.value)}
                style={{ width: 64, padding: '3px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-ui)', textAlign: 'center' }}
              />
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
              <X size={13} />
            </button>
          </div>

          {/* Hint */}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 12px 2px' }}>
            Click the timeline to set a day — sessions and arcs shown as reference
          </div>

          {/* Mini timeline */}
          <div style={{ padding: '8px 12px 4px' }}>
            {currentCampaign && (
              <MiniTimeline
                campaignId={currentCampaign.id}
                selectedDay={day}
                baseYear={year}
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