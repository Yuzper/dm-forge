// path: src/utils/timelineDrilldown.ts
// Aggregation and layout for the drill-down timeline (decade → year → division).
// Pure functions over ClusterItem so the views stay presentational and the same
// maths can be reused by the hub embed later.

import {
  dayToCalendarDate, calendarDateToDay,
  type CampaignCalendar, type ClusterItem, type Era,
} from './timelineGeometry'

export const KIND_COLOR: Record<ClusterItem['kind'], string> = {
  session: '#c8a84b', event: '#e05555', death: '#9b7de8', quest: '#5b9fe8', article: '#8a8a8a',
}
export const KIND_GLYPH: Record<ClusterItem['kind'], string> = {
  session: '○', event: '◆', death: '☠', quest: '◈', article: '▪',
}
export const KIND_ORDER: ClusterItem['kind'][] = ['session', 'event', 'death', 'quest', 'article']

export const DECADE = 10

// ── Decade level ─────────────────────────────────────────────────────────────

export interface YearBucket { year: number; items: ClusterItem[] }
export interface DecadeRow { start: number; years: YearBucket[]; total: number }

// A decade with entries, or a run of decades without any. Empty years never get
// a card, and a run of empty decades collapses to one row — but it is still a
// row, because jumping from 1315 straight to 1461 with no marker reads as
// missing data rather than as a deliberately quiet stretch.
export type DecadeBand =
  | { kind: 'decade'; row: DecadeRow }
  | { kind: 'gap'; from: number; to: number }

export function buildDecadeBands(items: ClusterItem[], cal: CampaignCalendar): DecadeBand[] {
  if (!items.length) return []

  const byYear = new Map<number, ClusterItem[]>()
  for (const it of items) {
    const y = dayToCalendarDate(it.day, cal).year
    const bucket = byYear.get(y)
    if (bucket) bucket.push(it)
    else byYear.set(y, [it])
  }

  const years = [...byYear.keys()]
  const first = Math.floor(Math.min(...years) / DECADE) * DECADE
  const last = Math.floor(Math.max(...years) / DECADE) * DECADE

  const bands: DecadeBand[] = []
  let run: number | null = null   // start year of the current empty run

  const flushRun = (end: number) => {
    if (run != null) { bands.push({ kind: 'gap', from: run, to: end }); run = null }
  }

  for (let d = first; d <= last; d += DECADE) {
    const buckets: YearBucket[] = []
    let total = 0
    for (let y = d; y < d + DECADE; y++) {
      const hit = byYear.get(y)
      if (hit) { buckets.push({ year: y, items: hit }); total += hit.length }
    }
    if (total === 0) { if (run == null) run = d; continue }
    flushRun(d)
    bands.push({ kind: 'decade', row: { start: d, years: buckets, total } })
  }
  flushRun(last + DECADE)
  return bands
}

// ── Year level ───────────────────────────────────────────────────────────────

export interface SpanBucket { span: number; from: number; to: number; items: ClusterItem[] }

export const spanBounds = (year: number, span: number, cal: CampaignCalendar): [number, number] => [
  calendarDateToDay(year, span, 1, cal),
  calendarDateToDay(year, span, cal.spans[span].days, cal),
]

// One bucket per calendar division, always all of them — the year view is meant
// to lay the calendar out, so an empty division still occupies its slot.
export function buildSpanBuckets(items: ClusterItem[], year: number, cal: CampaignCalendar): SpanBucket[] {
  return cal.spans.map((_, span) => {
    const [from, to] = spanBounds(year, span, cal)
    return { span, from, to, items: items.filter(i => i.day >= from && i.day <= to) }
  })
}

// ── Division level (vertical rail) ───────────────────────────────────────────

export const V_DAY_PX = 15     // px per day when days are spaced proportionally
export const CARD_GAP = 8
export const QUIET_RUN_H = 40  // fixed height a collapsed run occupies
export const QUIET_RUN_DAYS = 6 // an empty run longer than this collapses

export const groupCardHeight = (n: number) => 14 + n * 30

export interface DayGroup { dayOfSpan: number; day: number; items: ClusterItem[]; y: number; h: number }
export interface QuietRun { y: number; days: number }

// Days that hold something are spaced proportionally; a long empty run collapses
// to a fixed labelled break. Same bargain the decade view strikes one level up.
// Entries sharing a day become one card, so a session and the quest it started
// read as one moment rather than two stacked rows.
export function layoutSpanRail(
  items: ClusterItem[], year: number, span: number, cal: CampaignCalendar,
): { groups: DayGroup[]; quiet: QuietRun[]; height: number } {
  const days = cal.spans[span].days
  const [from, to] = spanBounds(year, span, cal)

  const byDay = new Map<number, ClusterItem[]>()
  for (const it of items) {
    if (it.day < from || it.day > to) continue
    const d = dayToCalendarDate(it.day, cal).dayOfSpan
    const bucket = byDay.get(d)
    if (bucket) bucket.push(it)
    else byDay.set(d, [it])
  }

  const groups: DayGroup[] = []
  const quiet: QuietRun[] = []
  let y = 8
  let prevDay = 1

  const advanceTo = (day: number) => {
    const gap = day - prevDay
    if (gap > QUIET_RUN_DAYS) { quiet.push({ y, days: gap }); y += QUIET_RUN_H }
    else y += gap * V_DAY_PX
    prevDay = day
  }

  for (const d of [...byDay.keys()].sort((a, b) => a - b)) {
    advanceTo(d)
    const dayItems = byDay.get(d)!
    const h = groupCardHeight(dayItems.length)
    groups.push({ dayOfSpan: d, day: from + d - 1, items: dayItems, y, h })
    y += h + CARD_GAP
  }
  advanceTo(days)

  return { groups, quiet, height: y + 8 }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

export const eraForYear = (eras: Era[], year: number) =>
  eras.find(e => year >= e.startYear && year <= e.endYear)

// The era wholly contained by a quiet stretch — the only thing worth saying
// about a century in which nothing was recorded.
export const eraWithin = (eras: Era[], from: number, to: number) =>
  eras.find(e => e.startYear >= from && e.endYear <= to)

export interface LifespanBand { id: number; title: string; color: string; startDay: number; endDay: number }

// Lifespans overlapping a window, so a year or division can say what was still
// standing during it even when nothing discrete happened.
export const lifespansOverlapping = (spans: LifespanBand[], from: number, to: number) =>
  spans.filter(s => s.startDay <= to && s.endDay >= from)

export function countByKind(items: ClusterItem[]): [ClusterItem['kind'], number][] {
  const counts = new Map<ClusterItem['kind'], number>()
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1)
  return KIND_ORDER.filter(k => counts.has(k)).map(k => [k, counts.get(k)!])
}
