// path: src/utils/timelineGeometry.ts
// The campaign calendar — days <-> calendar dates, shared by every timeline view
// and the date picker — plus the item types those views pass around. Screen
// geometry for the vertical timeline lives in utils/chronicleLayout.

export const DEFAULT_BASE_YEAR = 1507

const YEAR_LENGTH = 365

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

/**
 * The campaign's present: the end of its latest dated session, else campaign
 * day 1. What "now" means for bars that run to the present and for ages.
 */
export function campaignPresentDay(sessions: { in_world_day?: number | null; in_world_day_end?: number | null }[]): number {
  let latest: number | null = null
  for (const s of sessions) {
    if (!s.in_world_day) continue
    const d = s.in_world_day_end ?? s.in_world_day
    if (latest == null || d > latest) latest = d
  }
  return latest ?? 1
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
  /** The owning article's tags, for the tag filter. */
  tags: string[]
}

export interface ClusterItem {
  id: number; title: string; kind: 'session' | 'event' | 'death' | 'quest' | 'article'
  day: number; color: string; article_type?: string
  // session-specific
  session_number?: number; session_sub?: string | null; arc_id?: number | null
  in_world_day_end?: number | null
}

// Named historical period; colours the timeline's spine and gets a title plate.
export interface Era {
  id: string
  name: string
  startYear: number
  endYear: number
  color: string
}
