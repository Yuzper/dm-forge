// path: src/utils/timelineGeometry.ts
// Pure coordinate math: the campaign calendar (shared by every timeline view) and
// the axis geometry, which now only the InWorldDatePicker's mini timeline uses.

export const DEFAULT_BASE_YEAR = 1507

export type ZoomLevel = 'full' | 'decade' | 'year' | 'day'

export const ZOOM_LABEL: Record<ZoomLevel, string> = {
  full: 'Full', decade: '10yr', year: '1yr', day: 'Day',
}
export const ZOOM_BIN: Record<ZoomLevel, number> = {
  full: 50, decade: 10, year: 1, day: 1,
}
export const ZOOM_ORDER: ZoomLevel[] = ['full', 'decade', 'year', 'day']
export const YEAR_LENGTH = 365

export const isYearMode = (z: ZoomLevel) => z !== 'day'

// ── Campaign calendar ──────────────────────────────────────────────────────────
// A year is divided into "spans" — the user decides what one represents
// (months, seasons, tendays…) via `unitName`, and how many days each holds.
// Total days per year is derived from the spans. `start` is the calendar date
// of campaign day 1, so absolute day numbers (the stored representation
// everywhere) stay valid regardless of calendar edits.

export interface CalendarSpan { name: string; days: number }

export interface CampaignCalendar {
  unitName: string                                   // e.g. "Month", "Season"
  spans: CalendarSpan[]
  start: { year: number; span: number; day: number } // campaign day 1 falls here
}

export function defaultCalendar(baseYear: number = DEFAULT_BASE_YEAR): CampaignCalendar {
  return { unitName: 'Month', spans: [{ name: '', days: YEAR_LENGTH }], start: { year: baseYear, span: 0, day: 1 } }
}

// The fallback single-unnamed-span calendar keeps the legacy "Day N, Year Y" look.
export const isPlainCalendar = (cal: CampaignCalendar) => cal.spans.length === 1 && !cal.spans[0].name

export function getCampaignCalendar(campaign?: { timeline_calendar?: string | null; timeline_base_year?: number } | null): CampaignCalendar {
  const base = campaign?.timeline_base_year ?? DEFAULT_BASE_YEAR
  if (campaign?.timeline_calendar) {
    try {
      const cal = JSON.parse(campaign.timeline_calendar)
      if (Array.isArray(cal.spans) && cal.spans.length > 0) {
        const spans: CalendarSpan[] = cal.spans.map((s: any) => ({
          name: String(s.name ?? ''), days: Math.max(1, Math.round(Number(s.days) || 1)),
        }))
        const span = Math.min(Math.max(0, Math.round(cal.start?.span ?? 0)), spans.length - 1)
        return {
          unitName: String(cal.unitName || 'Month'),
          spans,
          start: {
            year: Math.round(cal.start?.year ?? base),
            span,
            day: Math.min(Math.max(1, Math.round(cal.start?.day ?? 1)), spans[span].days),
          },
        }
      }
    } catch {}
  }
  return defaultCalendar(base)
}

export const yearLength = (cal: CampaignCalendar) =>
  Math.max(1, cal.spans.reduce((sum, sp) => sum + sp.days, 0))

// 1-based day-of-year of campaign day 1 within its calendar year.
export function startDayOfYear(cal: CampaignCalendar): number {
  let before = 0
  for (let i = 0; i < cal.start.span; i++) before += cal.spans[i].days
  return before + cal.start.day
}

export interface CalendarDate { year: number; span: number; dayOfSpan: number; dayOfYear: number }

export function dayToCalendarDate(day: number, cal: CampaignCalendar): CalendarDate {
  const L = yearLength(cal)
  const t = day - 1 + startDayOfYear(cal) - 1          // days since start-of-start-year
  const yearOffset = Math.floor(t / L)
  const doy = ((t % L) + L) % L + 1
  let span = 0, rem = doy
  while (span < cal.spans.length - 1 && rem > cal.spans[span].days) { rem -= cal.spans[span].days; span++ }
  return { year: cal.start.year + yearOffset, span, dayOfSpan: rem, dayOfYear: doy }
}

export function calendarDateToDay(year: number, span: number, dayOfSpan: number, cal: CampaignCalendar): number {
  let before = 0
  for (let i = 0; i < Math.min(span, cal.spans.length); i++) before += cal.spans[i].days
  return (year - cal.start.year) * yearLength(cal) + before + dayOfSpan - (startDayOfYear(cal) - 1)
}

export const spanLabel = (cal: CampaignCalendar, span: number) =>
  cal.spans[span]?.name || `${cal.unitName} ${span + 1}`

export function formatCalendarDay(day: number, cal: CampaignCalendar): string {
  const d = dayToCalendarDate(day, cal)
  if (isPlainCalendar(cal)) return `Day ${day}, Year ${d.year}`
  return `${d.dayOfSpan} ${spanLabel(cal, d.span)} ${d.year}`
}

// Span boundaries within [minDay, maxDay] — for day-mode calendar markers.
export function spanStartsBetween(minDay: number, maxDay: number, cal: CampaignCalendar): { day: number; span: number; year: number }[] {
  const out: { day: number; span: number; year: number }[] = []
  const first = dayToCalendarDate(minDay, cal)
  let day = minDay - (first.dayOfSpan - 1)
  let span = first.span, year = first.year
  let guard = 0
  while (day <= maxDay && guard++ < 2000) {
    if (day >= minDay) out.push({ day, span, year })
    day += cal.spans[span].days
    span++
    if (span >= cal.spans.length) { span = 0; year++ }
  }
  return out
}

export const dayToWorldYear = (day: number, cal: CampaignCalendar) =>
  cal.start.year + (day - 1 + startDayOfYear(cal) - 1) / yearLength(cal)
export const worldYearToDay = (wy: number, cal: CampaignCalendar) =>
  Math.round((wy - cal.start.year) * yearLength(cal)) + 1 - (startDayOfYear(cal) - 1)

// ── Bin chips ──────────────────────────────────────────────────────────────────

export interface BinItem {
  title: string
  kind: 'session' | 'event' | 'death'
}

export interface BinChip {
  startYear: number
  endYear: number
  syCount: number
  evCount: number
  items: BinItem[]
  zone: 'pre' | 'campaign'
}

export function computeBins(
  zoom: ZoomLevel,
  cal: CampaignCalendar,
  sessions: { in_world_day?: number | null; name?: string; session_number?: number; session_sub?: string | null }[],
  events: { day: number; title?: string; kind?: string }[],
): BinChip[] {
  if (zoom === 'day') return []
  const binSize = ZOOM_BIN[zoom]

  const allItems = [
    ...sessions
      .filter(s => s.in_world_day != null)
      .map(s => ({
        wy: dayToWorldYear(s.in_world_day!, cal),
        title: s.name ? `S${s.session_number}${s.session_sub ?? ''} ${s.name}` : `Session ${s.session_number}`,
        kind: 'session' as const,
      })),
    ...events.map(e => ({
      wy: dayToWorldYear(e.day, cal),
      title: e.title ?? 'Untitled',
      kind: (e.kind ?? 'event') as 'event' | 'death',
    })),
  ]

  if (!allItems.length) return []

  const minBin = Math.floor(Math.min(...allItems.map(i => i.wy)) / binSize) * binSize
  const maxBin = Math.ceil(Math.max(...allItems.map(i => i.wy)) / binSize) * binSize

  const chips: BinChip[] = []
  for (let by = minBin; by < maxBin; by += binSize) {
    const end = by + binSize
    const binItems = allItems.filter(i => i.wy >= by && i.wy < end)
    if (!binItems.length) continue
    chips.push({
      startYear: by,
      endYear: end,
      syCount: binItems.filter(i => i.kind === 'session').length,
      evCount: binItems.filter(i => i.kind !== 'session').length,
      items: binItems.map(i => ({ title: i.title, kind: i.kind })),
      zone: by + binSize <= cal.start.year ? 'pre' : 'campaign',
    })
  }
  return chips
}

// ── Shared item types ────────────────────────────────────────────────────────

export interface SessionRenderItem {
  id: number; name: string; session_number: number; session_sub: string | null
  arc_id: number | null; in_world_day: number; in_world_day_end?: number | null
}

export interface TimelineEventItem {
  id: number; title: string; day: number; year: number
  kind: 'event' | 'death' | 'quest' | 'article'; article_type: string; color: string
  articleId?: number
}

export interface ClusterItem {
  id: number; title: string; kind: 'session' | 'event' | 'death' | 'quest' | 'article'
  day: number; color: string; article_type?: string
  // session-specific
  session_number?: number; session_sub?: string | null; arc_id?: number | null
  in_world_day_end?: number | null
}

// Named historical period rendered as a background band on the timeline.
export interface Era {
  id: string
  name: string
  startYear: number
  endYear: number
  color: string
}

// ── Axis geometry ──────────────────────────────────────────────────────────────

export interface AxisGeo {
  dx: (day: number) => number
  xToDay: (x: number) => number
  worldYearToX: (wy: number) => number
  canvasWidth: (padR: number, maxDay: number) => number
  campaignOffX: number   // px of log-compressed pre-campaign zone at left
  pxPerYear: number
}

// px per world year in campaign zone, per zoom level
const PICK_PPY: Record<ZoomLevel, number> = { full: 14, decade: 22, year: 90, day: 0 }

function buildAxisGeo(
  zoom: ZoomLevel,
  padL: number, minDay: number, pxPerDay: number, cal: CampaignCalendar,
  campaignOffX: number, logK: number, pxPerYearMap: Record<ZoomLevel, number>,
): AxisGeo {
  const pxPerYear = pxPerYearMap[zoom]
  const baseYear = cal.start.year

  const worldYearToX = (wy: number): number => wy >= baseYear
    ? padL + campaignOffX + (wy - baseYear) * pxPerYear
    : padL + campaignOffX - logK * Math.log(1 + (baseYear - wy) / 2)

  const dx = isYearMode(zoom)
    ? (day: number) => worldYearToX(dayToWorldYear(day, cal))
    : (day: number) => padL + (day - minDay) * pxPerDay

  const xToDay = isYearMode(zoom)
    ? (x: number): number => {
        const wy = x >= padL + campaignOffX
          ? baseYear + (x - padL - campaignOffX) / pxPerYear
          : baseYear - 2 * (Math.exp((padL + campaignOffX - x) / logK) - 1)
        return worldYearToDay(Math.round(wy), cal)
      }
    : (x: number) => Math.round((x - padL) / pxPerDay) + minDay

  const canvasWidth = (padR: number, maxDay: number): number => isYearMode(zoom)
    ? padL + campaignOffX + (Math.ceil(dayToWorldYear(maxDay, cal)) + 1 - baseYear) * pxPerYear + padR
    : padL + (maxDay - minDay) * pxPerDay + padR

  return { dx, xToDay, worldYearToX, canvasWidth, campaignOffX, pxPerYear }
}

export const makePickerAxisGeo = (
  zoom: ZoomLevel, padL: number, minDay: number, pxPerDay: number, cal: CampaignCalendar,
): AxisGeo => buildAxisGeo(zoom, padL, minDay, pxPerDay, cal, 170, 55, PICK_PPY)
