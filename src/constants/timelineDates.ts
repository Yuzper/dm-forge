// path: src/constants/timelineDates.ts
// Per-type semantic timeline dates (founding, destruction, birth, death…) plus
// freeform milestones. Shared by the article editor and the timeline views.

import type { ArticleType } from '../types'
import type { TimelineEventItem } from '../utils/timelineGeometry'
import { ARTICLE_TYPE_COLORS } from './articleTypes'

export interface TimelineDateField {
  key: string                       // tracks key, e.g. 'Founded_Date'
  label: string                     // display label, e.g. 'Founded'
  role: 'start' | 'end' | 'point'   // start/end form a lifespan; point is standalone
}

// A "start" + "end" pair forms a lifespan band. Mid-life moments use 'point'.
// The pair is order-enforced when edited (see TimelineDatesSection): an end can't
// be set before its start, nor a start after its end.
export const TIMELINE_DATE_FIELDS: Partial<Record<ArticleType, TimelineDateField[]>> = {
  location:        [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Destroyed_Date', label: 'Destroyed', role: 'end' }],
  faction:         [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Disbanded_Date', label: 'Disbanded', role: 'end' }],
  character:        [{ key: 'Born_Date', label: 'Born', role: 'start' }, { key: 'Death_Date', label: 'Death', role: 'end' }],
  playerCharacter:  [{ key: 'Born_Date', label: 'Born', role: 'start' }, { key: 'Death_Date', label: 'Death', role: 'end' }],
  item:            [{ key: 'Created_Date', label: 'Created', role: 'start' }, { key: 'Lost_Date', label: 'Lost', role: 'end' }],
  religion:        [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Ended_Date', label: 'Ended', role: 'end' }],
  culture:         [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Ended_Date', label: 'Ended', role: 'end' }],
  quest:           [{ key: 'Started_Date', label: 'Started', role: 'start' }, { key: 'Completed_Date', label: 'Completed', role: 'end' }],
  // Keeps the original Discovered_Date key so existing creature dates survive.
  creature:        [{ key: 'Discovered_Date', label: 'Found', role: 'start' }, { key: 'Extinct_Date', label: 'Extinct', role: 'end' }],
  lore:            [{ key: 'Occurred_Date', label: 'Occurred', role: 'point' }],
  note:            [{ key: 'Written_Date', label: 'Written', role: 'point' }],
}

// Setting one of these implies a status track value — kept here so the rule lives
// next to the field definitions rather than in the editor's markup.
export const DATE_IMPLIES_TRACK: Record<string, { track: string; value: string }> = {
  Death_Date:   { track: 'Vitality', value: 'Dead' },
  Extinct_Date: { track: 'Vitality', value: 'Extinct' },
}

// Campaign day stored in a date track, or null when unset/unparseable.
export function trackDay(raw: string | undefined): number | null {
  if (!raw) return null
  try { const d = JSON.parse(raw); return typeof d.day === 'number' ? d.day : null } catch { return null }
}

// ── Age ────────────────────────────────────────────────────────────────────────
// Types carrying an Age track that reads off their lifespan. While the end date
// is unset the number is yours to type — there's no reliable "today" in world, so
// a living character's age can't be computed — but once the end date exists the
// span is a settled fact and the field is derived from it instead.
export const AGE_TRACK_TYPES: ArticleType[] = ['character', 'playerCharacter', 'location']

// Whole years between the start and end date, or null when the pair is
// incomplete (which is what leaves the field hand-filled). `yearLen` is the
// campaign calendar's year length, so custom calendars count their own years.
export function derivedAge(
  type: ArticleType,
  tracks: Record<string, string>,
  yearLen: number,
): number | null {
  if (!AGE_TRACK_TYPES.includes(type)) return null
  const fields = TIMELINE_DATE_FIELDS[type] ?? []
  const startKey = fields.find(f => f.role === 'start')?.key
  const endKey   = fields.find(f => f.role === 'end')?.key
  if (!startKey || !endKey) return null
  const start = trackDay(tracks[startKey])
  const end   = trackDay(tracks[endKey])
  if (start == null || end == null) return null
  return Math.max(0, Math.floor((end - start) / Math.max(1, yearLen)))
}

// The two dates an Age is read from, for labelling the derived field.
export function ageSourceLabels(type: ArticleType): { start: string; end: string } | null {
  const fields = TIMELINE_DATE_FIELDS[type] ?? []
  const start = fields.find(f => f.role === 'start')
  const end   = fields.find(f => f.role === 'end')
  return start && end ? { start: start.label, end: end.label } : null
}

export interface Milestone { id: string; label: string; date: string }

export function parseMilestones(raw: any): Milestone[] {
  try { const a = JSON.parse(raw ?? '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

export interface Lifespan { id: number; title: string; color: string; startDay: number; endDay: number }

type ParseDate = (raw: string) => { day: number; year: number } | null

// Build all point markers + an optional lifespan for one article. Death_Date is
// rendered elsewhere as a dedicated 'death' marker, so it's used only for the
// lifespan end here, never emitted as a duplicate point.
export function buildArticleTimeline(
  a: { id: number; title: string; article_type: string },
  tracks: Record<string, string>,
  parse: ParseDate,
): { markers: TimelineEventItem[]; lifespan?: Lifespan } {
  const type = a.article_type as ArticleType
  const fields = TIMELINE_DATE_FIELDS[type] ?? []
  const color = ARTICLE_TYPE_COLORS[type] ?? '#8a8a8a'
  const kind: 'quest' | 'article' = type === 'quest' ? 'quest' : 'article'
  const markers: TimelineEventItem[] = []
  let startDay: number | undefined
  let endDay: number | undefined

  for (const f of fields) {
    const d = parse(tracks[f.key])
    if (!d) continue
    if (f.role === 'start') startDay = d.day
    if (f.role === 'end') endDay = d.day
    if (f.key === 'Death_Date') continue   // emitted as a 'death' marker elsewhere
    markers.push({ id: a.id, title: `${a.title} — ${f.label}`, day: d.day, year: d.year, kind, article_type: type, color, articleId: a.id })
  }

  for (const m of parseMilestones(tracks.Timeline_Milestones)) {
    const d = parse(m.date)
    if (!d) continue
    markers.push({ id: a.id, title: m.label ? `${a.title} — ${m.label}` : a.title, day: d.day, year: d.year, kind, article_type: type, color, articleId: a.id })
  }

  // Legacy single "appears on timeline" date
  const legacy = parse(tracks.Timeline_Date)
  if (legacy) markers.push({ id: a.id, title: a.title, day: legacy.day, year: legacy.year, kind, article_type: type, color, articleId: a.id })

  // A thing that began and ended on the same day is real (a city sacked the day
  // it was founded), so zero-width spans are kept — the canvas draws them as a
  // tick rather than dropping them.
  const lifespan = (startDay != null && endDay != null && endDay >= startDay)
    ? { id: a.id, title: a.title, color, startDay, endDay }
    : undefined

  return { markers, lifespan }
}
