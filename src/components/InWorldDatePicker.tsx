// path: src/components/InWorldDatePicker.tsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store/store'
import { Calendar, X, Trash2 } from 'lucide-react'
import type { Campaign } from '../types'
import {
  DEFAULT_BASE_YEAR,
  type CampaignCalendar, type SessionRenderItem, getCampaignCalendar, defaultCalendar,
  dayToCalendarDate, calendarDateToDay,
  formatCalendarDay, isPlainCalendar, spanLabel,
} from '../utils/timelineGeometry'
import { TimelineChronicle } from './TimelineChronicle'
import { useTimelineData, parseEras } from '../hooks/useTimelineData'

// Re-exported so the many existing `from '../components/InWorldDatePicker'`
// imports keep working; the definitions live in utils/inWorldDate.
import { parseInWorldDate, type InWorldDate } from '../utils/inWorldDate'
export { parseInWorldDate, type InWorldDate }

// ── Timeline preview ────────────────────────────────────────────────────────
// The real vertical timeline in its compact picker variant: the same spine,
// eras, lanes and shields as the Timeline page, so a date is picked against the
// canon it lands in. Clicking anywhere picks a day, clicking a shield picks its
// date, and the gold line through the picked day shows everyone's age there.

function TimelinePreview({ campaign, cal, selectedDay, onPickDay }: {
  campaign: Campaign
  cal: CampaignCalendar
  selectedDay: number
  onPickDay: (day: number) => void
}) {
  const { sessions, arcs } = useStore()
  const data = useTimelineData(campaign.id)
  const eras = useMemo(() => parseEras(campaign.timeline_eras), [campaign.timeline_eras])
  const arcMap = useMemo(() => Object.fromEntries(arcs.map(a => [a.id, a])), [arcs])
  const sessionItems = useMemo<SessionRenderItem[]>(() => sessions
    .filter(s => s.in_world_day)
    .map(s => ({
      id: s.id, name: s.name, session_number: s.session_number, session_sub: s.session_sub,
      arc_id: s.arc_id, in_world_day: s.in_world_day!, in_world_day_end: s.in_world_day_end,
    })), [sessions])

  return (
    <TimelineChronicle
      variant="picker" height={290}
      campaignId={campaign.id} eras={eras} cal={cal} sessions={sessionItems} arcMap={arcMap}
      items={data.items} lifespans={data.lifespans} bounds={data.bounds} standing={data.standing} articles={data.articleInfo}
      selectedDay={selectedDay} onPickDay={onPickDay}
    />
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

  const cal = useMemo(
    () => currentCampaign ? getCampaignCalendar(currentCampaign) : defaultCalendar(baseYear),
    [currentCampaign, baseYear],
  )
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
      setDropUp(window.innerHeight - rect.bottom < 470 && rect.top > window.innerHeight - rect.bottom)
      setDropLeft(window.innerWidth - rect.left < 430)
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
          zIndex: 200, width: 420, maxHeight: 470, display: 'flex', flexDirection: 'column',
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

          {/* Body: the timeline preview + context */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <div style={{ padding: '8px 10px 6px' }}>
              {currentCampaign && (
                <TimelinePreview
                  campaign={currentCampaign}
                  cal={cal}
                  selectedDay={day}
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
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', background: '#e0555518', border: '1px solid #e0555555', borderRadius: 'var(--radius-sm)', color: 'var(--danger-soft)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition)', '--hover-accent': 'var(--danger-hover)' } as React.CSSProperties}
                className="hover-accent"
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