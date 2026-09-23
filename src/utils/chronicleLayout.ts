// path: src/utils/chronicleLayout.ts
// Geometry for the Timeline page's Chronicle view: time runs top to bottom, an
// era-coloured spine carries the sessions, and every dated article gets a lane
// either side of it. Pure functions only, so the view is just drawing.
//
// Three ideas carry the layout:
//
//   Tracks   — one per article, not one per date. A character's birth, death
//              and milestones sit on a single bar, so a read down the page
//              shows who was alive at the same time as what.
//   Gaps     — a campaign with a founding in year 12 and sessions in year 1307
//              is mostly empty time. Any empty stretch taller than MAX_GAP_PX is
//              collapsed to GAP_PX with a break marker, so zoom stays useful at
//              both ends instead of scrolling through centuries of nothing.
//   Sides    — agents (people, creatures, factions, faiths, cultures) pack to
//              the left of the spine, places, things and happenings to the
//              right. Keeps "who" and "what" in readable columns.

import type { CampaignCalendar, Era, SessionRenderItem, TimelineEventItem } from './timelineGeometry'
import { calendarDateToDay, dayToCalendarDate, spanLabel, yearLength } from './timelineGeometry'
import type { Lifespan } from '../constants/timelineDates'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'

export type MarkKind = 'event' | 'death' | 'quest' | 'article'

export interface ChronicleMark {
  day: number
  /** What happened on the day: "Founded", "Death", a milestone's own label. */
  label: string
  kind: MarkKind
}

export interface ChronicleTrack {
  key: string
  articleId: number
  title: string
  articleType: string
  color: string
  side: 'left' | 'right'
  startDay: number
  endDay: number
  /** A real start→end lifespan, rather than loose dates joined up. */
  solid: boolean
  marks: ChronicleMark[]
  /**
   * The article's own start/end-role dates (Born/Death, Founded/Destroyed…),
   * independent of filtering. Either can be missing: a birth with no death
   * still gives an age at every later date.
   */
  lifeStart?: number
  lifeEnd?: number
  /**
   * Still around (alive, active, standing) with no end date: the bar runs past the last date to the
   * campaign's present (`endDay`), capped with an arrow instead of a shield.
   */
  openEnd?: boolean
}

export interface SpineSession {
  key: string
  sessionId: number
  title: string
  badge: string
  arc?: string
  color: string
  startDay: number
  endDay: number
}

// ── Building ──────────────────────────────────────────────────────────────────

const LEFT_TYPES = new Set(['character', 'playerCharacter', 'creature', 'faction', 'culture', 'religion'])

/**
 * Group the page's flat marker list back into one track per article. Titles
 * come from the article list rather than the markers, which carry display
 * strings like "Tarsis — Founded".
 */
export function buildTracks(
  items: TimelineEventItem[],
  lifespans: Lifespan[],
  articles: Record<number, { title: string; article_type: string }>,
  bounds: Record<number, { start?: number; end?: number }> = {},
  standing: Record<number, true> = {},
  presentDay: number | null = null,
): ChronicleTrack[] {
  const byArticle = new Map<number, TimelineEventItem[]>()
  for (const i of items) {
    const id = i.articleId ?? i.id
    if (!byArticle.has(id)) byArticle.set(id, [])
    byArticle.get(id)!.push(i)
  }
  const spanById = new Map(lifespans.map(l => [l.id, l]))

  const tracks: ChronicleTrack[] = []
  for (const [id, list] of byArticle) {
    const info = articles[id]
    const type = info?.article_type ?? list[0].article_type
    const title = info?.title ?? spanById.get(id)?.title ?? list[0].title
    const marks = list
      .map(i => ({ day: i.day, kind: i.kind as MarkKind, label: markLabel(i, title) }))
      .sort((a, b) => a.day - b.day)
    const startDay = marks[0].day
    const lastDay = marks[marks.length - 1].day
    const openEnd = !!standing[id] && bounds[id]?.end == null && presentDay != null && presentDay > lastDay
    const endDay = openEnd ? presentDay! : lastDay
    const span = spanById.get(id)
    tracks.push({
      key: `a${id}`,
      articleId: id,
      title,
      articleType: type,
      color: ARTICLE_TYPE_COLORS[type] ?? list[0].color ?? '#8a8a8a',
      side: LEFT_TYPES.has(type) ? 'left' : 'right',
      startDay,
      endDay,
      // Solid only while both ends of the lifespan are actually on screen — a
      // filtered-out death shouldn't leave a bar running to nowhere.
      solid: openEnd || (!!span && span.startDay === startDay && span.endDay === endDay),
      marks,
      openEnd,
      lifeStart: bounds[id]?.start,
      lifeEnd: bounds[id]?.end,
    })
  }
  return tracks
}

function markLabel(i: TimelineEventItem, title: string): string {
  // Field dates and milestones carry their label as "Title — Label".
  const prefix = `${title} — `
  if (i.title.startsWith(prefix)) return i.title.slice(prefix.length)
  if (i.kind === 'death') return 'Death'
  // The loader's own event marker (no articleId) is the Happened date.
  if (i.kind === 'event' && i.articleId == null) return 'Happened'
  return ''
}

export function buildSpine(
  sessions: SessionRenderItem[],
  arcs: Record<number, { name: string; color: string }>,
): SpineSession[] {
  return sessions
    .map(s => ({
      key: `s${s.id}`,
      sessionId: s.id,
      title: s.name,
      badge: `${s.session_number}${s.session_sub ?? ''}`,
      arc: arcs[s.arc_id ?? 0]?.name,
      color: arcs[s.arc_id ?? 0]?.color ?? 'var(--gold)',
      startDay: s.in_world_day,
      endDay: Math.max(s.in_world_day, s.in_world_day_end ?? s.in_world_day),
    }))
    .sort((a, b) => a.startDay - b.startDay)
}

/** First and last day of an era (both years inclusive, as the eras editor means them). */
export function eraDays(era: Era, cal: CampaignCalendar): { startDay: number; endDay: number } {
  return {
    startDay: calendarDateToDay(era.startYear, 0, 1, cal),
    endDay: calendarDateToDay(era.endYear + 1, 0, 1, cal) - 1,
  }
}

// ── Slice: who and what exists on a given day ────────────────────────────────

/** How an entry's elapsed time reads: an age, how old a place is, or progress. */
export type AgeGroup = 'people' | 'places' | 'happenings'

const PEOPLE_TYPES = new Set(['character', 'playerCharacter', 'creature'])
const HAPPENING_TYPES = new Set(['event', 'quest', 'lore', 'note', 'other'])

export function ageGroup(type: string): AgeGroup {
  if (PEOPLE_TYPES.has(type)) return 'people'
  if (HAPPENING_TYPES.has(type)) return 'happenings'
  return 'places'
}

export interface SliceEntry {
  track: ChronicleTrack
  group: AgeGroup
  /** Days from its start to the slice. */
  elapsed: number
  /** Its full length, when an end is known. */
  total: number | null
}

/**
 * Everything that exists on `day`: begun on or before it and not yet ended.
 * A track's own start/end-role dates win (so a birth with no death counts as
 * alive for ever after); without them, loose dates spanning the day — an event
 * with milestones — count as ongoing between the first and last.
 */
export function sliceAt(tracks: ChronicleTrack[], day: number): SliceEntry[] {
  const out: SliceEntry[] = []
  for (const t of tracks) {
    let start: number | undefined
    let end: number | undefined
    if (t.lifeStart != null) { start = t.lifeStart; end = t.lifeEnd }
    else if (t.startDay < t.endDay) { start = t.startDay; end = t.endDay }
    if (start == null || day < start || (end != null && day > end)) continue
    out.push({ track: t, group: ageGroup(t.articleType), elapsed: day - start, total: end != null ? end - start : null })
  }
  return out.sort((a, b) => b.elapsed - a.elapsed)
}

/**
 * Evenly spaced anchors around the picked day, closer together than a gap can
 * collapse, so the picker always has real time to click around it — in a
 * campaign with nothing dated, or years away from anything that is.
 */
export function pickerWindow(center: number, pxPerDay: number, viewH: number): number[] {
  const step = Math.max(1, Math.floor((MAX_GAP_PX * 0.9) / pxPerDay))
  const reach = Math.min(200, Math.ceil((viewH * 1.5) / Math.max(1e-9, step * pxPerDay)) + 1)
  const out: number[] = []
  for (let i = -reach; i <= reach; i++) out.push(center + i * step)
  return out
}

/** How long something has existed at the slice, short (chip) and long (panel). */
export function sliceValue(e: SliceEntry, L: number): { short: string; long: string } {
  const years = Math.floor(e.elapsed / L)
  const span = (d: number) => {
    const y = Math.floor(d / L)
    return y >= 1 ? `${y} year${y === 1 ? '' : 's'}` : `${d} day${d === 1 ? '' : 's'}`
  }
  const shortSpan = years >= 1 ? `${years}y` : `${e.elapsed}d`
  if (e.group === 'people') {
    return years >= 1 ? { short: `${years}`, long: `age ${years}` } : { short: shortSpan, long: `${span(e.elapsed)} old` }
  }
  if (e.group === 'places') return { short: shortSpan, long: `${span(e.elapsed)} old` }
  if (e.total != null && e.total > 0) {
    if (e.total >= L) {
      const n = Math.ceil(e.total / L)
      const y = Math.min(n, years + 1)
      return { short: `${y}/${n}y`, long: `year ${y} of ${n}` }
    }
    return { short: `${e.elapsed + 1}/${e.total + 1}d`, long: `day ${e.elapsed + 1} of ${e.total + 1}` }
  }
  return { short: shortSpan, long: `${span(e.elapsed)} in` }
}

// ── Scale ─────────────────────────────────────────────────────────────────────

/** Pixels per year at each zoom step. The top step is ~45px per day on a 365-day year. */
export const ZOOM_PX_PER_YEAR = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384]

export const MAX_GAP_PX = 180
export const GAP_PX = 64
const PAD_PX = 90

export interface Segment { d0: number; d1: number; y0: number; y1: number; compressed: boolean }

export interface ChronicleScale {
  y: (day: number) => number
  dayAt: (y: number) => number
  height: number
  /** In day order (d0 < d1). y0 < y1 always holds, whichever way time runs. */
  segments: Segment[]
  /** The collapsed segments, sorted top to bottom on screen. */
  gaps: Segment[]
  pxPerDay: number
  /** Time runs upward: the oldest date sits at the bottom. */
  reversed: boolean
}

/** A day range's top and bottom on screen, in whichever direction time runs. */
export function screenSpan(scale: ChronicleScale, a: number, b: number): [number, number] {
  const ya = scale.y(a), yb = scale.y(b)
  return ya <= yb ? [ya, yb] : [yb, ya]
}

/**
 * Piecewise-linear day → y. `anchors` are every day something happens on; the
 * stretch between two neighbours is drawn to scale unless it would be taller
 * than MAX_GAP_PX, in which case it collapses to GAP_PX.
 *
 * `reversed` mirrors the whole thing top to bottom, so every consumer that goes
 * through y()/dayAt()/segments gets bottom-up for free.
 */
export function buildScale(anchors: number[], pxPerDay: number, reversed = false): ChronicleScale {
  const forward = buildForwardScale(anchors, pxPerDay)
  if (!reversed) return forward
  const H = forward.height
  const flip = (sg: Segment): Segment => ({ ...sg, y0: H - sg.y1, y1: H - sg.y0 })
  const segments = forward.segments.map(flip)
  return {
    y: day => H - forward.y(day),
    dayAt: yy => forward.dayAt(H - yy),
    height: H,
    segments,
    gaps: segments.filter(sg => sg.compressed).sort((a, b) => a.y0 - b.y0),
    pxPerDay,
    reversed: true,
  }
}

function buildForwardScale(anchors: number[], pxPerDay: number): ChronicleScale {
  const days = [...new Set(anchors)].sort((a, b) => a - b)
  if (days.length === 0) {
    return { y: () => PAD_PX, dayAt: () => 0, height: PAD_PX * 2, segments: [], gaps: [], pxPerDay, reversed: false }
  }

  const segments: Segment[] = []
  let y = PAD_PX
  for (let i = 1; i < days.length; i++) {
    const d0 = days[i - 1], d1 = days[i]
    const raw = (d1 - d0) * pxPerDay
    const compressed = raw > MAX_GAP_PX
    const h = compressed ? GAP_PX : raw
    segments.push({ d0, d1, y0: y, y1: y + h, compressed })
    y += h
  }

  const first = days[0], last = days[days.length - 1]
  const lastY = y

  const yOf = (day: number): number => {
    if (day <= first) return PAD_PX - (first - day) * pxPerDay
    if (day >= last) return lastY + (day - last) * pxPerDay
    let lo = 0, hi = segments.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (segments[mid].d1 < day) lo = mid + 1
      else hi = mid
    }
    const s = segments[lo]
    return s.y0 + (day - s.d0) / (s.d1 - s.d0) * (s.y1 - s.y0)
  }

  const dayAt = (yy: number): number => {
    if (segments.length === 0 || yy <= PAD_PX) return first - (PAD_PX - yy) / pxPerDay
    if (yy >= lastY) return last + (yy - lastY) / pxPerDay
    const s = segments.find(sg => yy <= sg.y1) ?? segments[segments.length - 1]
    return s.d0 + (yy - s.y0) / Math.max(1e-9, s.y1 - s.y0) * (s.d1 - s.d0)
  }

  return {
    y: yOf,
    dayAt,
    height: lastY + PAD_PX,
    segments,
    gaps: segments.filter(s => s.compressed),
    pxPerDay,
    reversed: false,
  }
}

/** "1,240 years", "3 years", "40 days" — for the break marker in a collapsed gap. */
export function gapLabel(days: number, cal: CampaignCalendar): string {
  const L = yearLength(cal)
  if (days >= L) {
    const years = Math.round(days / L)
    return `${years.toLocaleString()} year${years === 1 ? '' : 's'}`
  }
  const d = Math.round(days)
  return `${d} day${d === 1 ? '' : 's'}`
}

// ── Lanes ─────────────────────────────────────────────────────────────────────

export const BADGE_HALF = 15

/**
 * First-fit interval packing in *pixel* space (what collides depends on zoom).
 * Lane 0 hugs the spine; a track takes the nearest lane it fits in. Sorting by
 * start then by length puts long-lived things close to the spine.
 */
export function packLanes<T extends { key: string; y0: number; y1: number }>(items: T[], gap = 6): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.y0 - b.y0 || (b.y1 - b.y0) - (a.y1 - a.y0))
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()
  for (const it of sorted) {
    let lane = laneEnds.findIndex(end => end + gap <= it.y0)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.y1) }
    else laneEnds[lane] = it.y1
    lanes.set(it.key, lane)
  }
  return lanes
}

/**
 * Sessions closer than a badge on the spine merge into one cluster badge. Walks
 * in screen order (so it works bottom-up too); each group's sessions stay in
 * day order, and `y` is where the group's badge sits — its topmost member.
 */
export function clusterSpine(
  sessions: SpineSession[], y: (day: number) => number, minGap = BADGE_HALF * 2 + 2,
): { y: number; sessions: SpineSession[] }[] {
  const out: { y: number; sessions: SpineSession[] }[] = []
  const onScreen = sessions.map(s => ({ s, sy: y(s.startDay) })).sort((a, b) => a.sy - b.sy)
  for (const { s, sy } of onScreen) {
    const open = out[out.length - 1]
    if (open && sy - open.y < minGap) open.sessions.push(s)
    else out.push({ y: sy, sessions: [s] })
  }
  for (const g of out) g.sessions.sort((a, b) => a.startDay - b.startDay)
  return out
}

// ── Ruler ─────────────────────────────────────────────────────────────────────

const YEAR_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
const MIN_TICK_PX = 56

export interface Tick { y: number; label: string; major: boolean }

/**
 * Year ticks at a step that keeps labels apart, or the calendar's own divisions
 * once a year is tall enough to hold them. Only the visible stretch [fromY, toY]
 * is ticked, and never inside a collapsed gap: the break marker already says
 * how much time it holds, and walking it at a fine step would be thousands of
 * invisible ticks.
 */
export function rulerTicks(
  scale: ChronicleScale, cal: CampaignCalendar, pxPerYear: number, fromY: number, toY: number,
): Tick[] {
  const ticks: Tick[] = []
  const L = yearLength(cal)

  // Day ranges drawn to scale that intersect the viewport, including the
  // linear run-out before the first anchor and after the last. Worked out in
  // day space so it doesn't care which way time runs down the screen.
  const dA = scale.dayAt(fromY), dB = scale.dayAt(toY)
  const dMin = Math.min(dA, dB), dMax = Math.max(dA, dB)
  const ranges: [number, number][] = []
  if (scale.segments.length === 0) ranges.push([dMin, dMax])
  else {
    const first = scale.segments[0], last = scale.segments[scale.segments.length - 1]
    if (dMin < first.d0) ranges.push([dMin, first.d0])
    for (const s of scale.segments) {
      if (!s.compressed && s.d1 >= dMin && s.d0 <= dMax) ranges.push([Math.max(s.d0, dMin), Math.min(s.d1, dMax)])
    }
    if (dMax > last.d1) ranges.push([last.d1, dMax])
  }

  const seen = new Set<number>()
  const push = (day: number, label: string, major: boolean) => {
    if (seen.has(day)) return
    seen.add(day)
    ticks.push({ y: scale.y(day), label, major })
  }

  const spanPx = pxPerYear / Math.max(1, cal.spans.length)
  const bySpan = cal.spans.length > 1 && spanPx >= MIN_TICK_PX
  const step = YEAR_STEPS.find(st => st * pxPerYear >= MIN_TICK_PX) ?? YEAR_STEPS[YEAR_STEPS.length - 1]

  for (const [d0, d1] of ranges) {
    if (d1 < d0) continue
    if (bySpan) {
      const start = dayToCalendarDate(Math.floor(d0), cal)
      let year = start.year, span = start.span
      for (let guard = 0; guard < 2000; guard++) {
        const day = calendarDateToDay(year, span, 1, cal)
        if (day > d1) break
        if (day >= d0) push(day, span === 0 ? `${year}` : spanLabel(cal, span), span === 0)
        span++
        if (span >= cal.spans.length) { span = 0; year++ }
      }
    } else {
      const y0 = dayToCalendarDate(Math.floor(d0), cal).year
      const y1 = dayToCalendarDate(Math.ceil(d1), cal).year
      for (let year = Math.ceil(y0 / step) * step, guard = 0; year <= y1 && guard < 2000; year += step, guard++) {
        const day = calendarDateToDay(year, 0, 1, cal)
        if (day < d0 - L || day > d1) continue
        push(day, `${year}`, year % (step * 5) === 0)
      }
    }
  }
  return ticks
}
