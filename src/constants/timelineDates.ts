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
  /**
   * A start that, with no end set, is a single moment rather than something
   * still going on. A birth with no death means alive; an event that happened
   * with no end date just happened — it isn't ongoing for ever after.
   */
  momentWithoutEnd?: boolean
  /** Shown as "(Optional)" in the editor — a date most articles won't need. */
  optional?: boolean
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
  // Happened keeps the original In_World_Date key (it used to sit in Details) so
  // every existing event date, the loaders and "Add event" keep working. Ended is
  // optional: set it and a war or plague spans the timeline as a bar.
  event:           [
    { key: 'In_World_Date', label: 'Happened', role: 'start', momentWithoutEnd: true },
    { key: 'Ended_Date', label: 'Ended', role: 'end', optional: true },
  ],
  note:            [{ key: 'Written_Date', label: 'Written', role: 'point' }],
}

// Setting one of these implies a status track value — kept here so the rule lives
// next to the field definitions rather than in the editor's markup. Clearing the
// date takes the value back (while it still holds it): to `cleared` when given,
// otherwise to blank.
export const DATE_IMPLIES_TRACK: Record<string, { track: string; value: string; cleared?: string }> = {
  // No death date any more means alive — and lets the age count to the present.
  Death_Date:     { track: 'Vitality', value: 'Dead', cleared: 'Alive' },
  Extinct_Date:   { track: 'Vitality', value: 'Extinct', cleared: 'Living' },
  // Only locations carry Destroyed_Date and only factions Disbanded_Date, so
  // neither can touch another type. (Ended_Date is shared by events, religions
  // and cultures, whose Status values differ — so it gets no rule.)
  Destroyed_Date: { track: 'State', value: 'Destroyed' },
  Disbanded_Date: { track: 'Status', value: 'Disbanded', cleared: 'Active' },
}

// Whether an article is marked as still around at the campaign's present. One
// with no end date (death, disbanding, destruction…) then has its bar drawn up
// to the present rather than stopping at its last date. Each type says it with
// its own status field; a type missing here never runs on.
const LIVING = new Set(['Alive', 'Immortal', 'Retired', 'Living', 'Endangered'])
const FAITH_ACTIVE = new Set(['Active', 'Undercover'])
const STILL_STANDING: Partial<Record<ArticleType, (t: Record<string, string>) => boolean>> = {
  character:       t => LIVING.has(t.Vitality),
  playerCharacter: t => LIVING.has(t.Vitality),
  creature:        t => LIVING.has(t.Vitality),
  faction:         t => t.Status === 'Active',
  religion:        t => FAITH_ACTIVE.has(t.Status),
  culture:         t => FAITH_ACTIVE.has(t.Status),
  // A place's State has no "still standing" value — Discovered, Undiscovered
  // and Abandoned all describe a place that exists — so only Destroyed stops it.
  location:        t => t.State !== 'Destroyed',
}

export function isStillStanding(type: string, tracks: Record<string, string>): boolean {
  return STILL_STANDING[type as ArticleType]?.(tracks) ?? false
}

// Campaign day stored in a date track, or null when unset/unparseable.
export function trackDay(raw: string | undefined): number | null {
  if (!raw) return null
  try { const d = JSON.parse(raw); return typeof d.day === 'number' ? d.day : null } catch { return null }
}

// ── Age ────────────────────────────────────────────────────────────────────────
// Types carrying an Age track that reads off their dates. With no start date the
// number is yours to type. With one, it's derived: to the end date once there is
// one, otherwise to the campaign's present (see derivedAge).
export const AGE_TRACK_TYPES: ArticleType[] = ['character', 'playerCharacter', 'location']

// Ages also count up to the campaign's present while there's no end date — a
// character is N years old *now*, a city has stood N years.
const AGE_TO_PRESENT: ArticleType[] = ['character', 'playerCharacter', 'location']

// Marked as ended but with no end date: the age it ended at is unknown, so the
// field stays yours to type rather than counting on to the present.
const endedWithoutDate = (type: ArticleType, t: Record<string, string>) =>
  type === 'location' ? t.State === 'Destroyed' : t.Vitality === 'Dead'

export interface DerivedAge {
  years: number
  /** Measured to the end date, or to the campaign's present. */
  to: 'end' | 'present'
}

// Whole years from the start date to the end date — or, with no end date, to
// `presentDay`. Null leaves the field hand-filled: no start date, or marked as
// ended without an end date (a Dead character, a Destroyed place).
// `yearLen` is the campaign calendar's year length, so custom calendars count
// their own years.
export function derivedAge(
  type: ArticleType,
  tracks: Record<string, string>,
  yearLen: number,
  presentDay: number | null = null,
): DerivedAge | null {
  if (!AGE_TRACK_TYPES.includes(type)) return null
  const fields = TIMELINE_DATE_FIELDS[type] ?? []
  const startKey = fields.find(f => f.role === 'start')?.key
  const endKey   = fields.find(f => f.role === 'end')?.key
  if (!startKey || !endKey) return null
  const start = trackDay(tracks[startKey])
  const end   = trackDay(tracks[endKey])
  if (start == null) return null
  const years = (to: number) => Math.max(0, Math.floor((to - start) / Math.max(1, yearLen)))
  if (end != null) return { years: years(end), to: 'end' }
  if (presentDay == null || !AGE_TO_PRESENT.includes(type)) return null
  if (endedWithoutDate(type, tracks)) return null
  if (presentDay < start) return null   // not yet born/founded at the present
  return { years: years(presentDay), to: 'present' }
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

// Dates the timeline loader already draws as their own marker kind — a death
// marker, an event marker — so they're never emitted again as a generic point.
const DRAWN_ELSEWHERE = new Set(['Death_Date', 'In_World_Date'])

// Build all point markers + an optional lifespan for one article. Death_Date is
// used only for the lifespan end here; it and an event's In_World_Date are
// emitted elsewhere (see DRAWN_ELSEWHERE), never as duplicate points.
//
// `startDay`/`endDay` are the start- and end-role dates on their own, set even
// when the other half is missing — a character with a birth date and no death
// has an age at any later moment, even though there's no lifespan to draw.
export function buildArticleTimeline(
  a: { id: number; title: string; article_type: string },
  tracks: Record<string, string>,
  parse: ParseDate,
): { markers: TimelineEventItem[]; lifespan?: Lifespan; startDay?: number; endDay?: number } {
  const type = a.article_type as ArticleType
  const fields = TIMELINE_DATE_FIELDS[type] ?? []
  const color = ARTICLE_TYPE_COLORS[type] ?? '#8a8a8a'
  // An event's own dates count as events, so the Events filter shows or hides
  // the whole thing (Happened, Ended and milestones) together.
  const kind: 'quest' | 'event' | 'article' = type === 'quest' ? 'quest' : type === 'event' ? 'event' : 'article'
  const markers: TimelineEventItem[] = []
  let startDay: number | undefined
  let endDay: number | undefined

  for (const f of fields) {
    const d = parse(tracks[f.key])
    if (!d) continue
    if (f.role === 'start') startDay = d.day
    if (f.role === 'end') endDay = d.day
    if (DRAWN_ELSEWHERE.has(f.key)) continue
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

  // Without its end, a moment-type start is just a moment: don't report it as an
  // open-ended start, or an event would read as ongoing at every later date.
  const startField = fields.find(f => f.role === 'start')
  if (startField?.momentWithoutEnd && endDay == null) startDay = undefined

  // A thing that began and ended on the same day is real (a city sacked the day
  // it was founded), so zero-width spans are kept — the canvas draws them as a
  // tick rather than dropping them.
  const lifespan = (startDay != null && endDay != null && endDay >= startDay)
    ? { id: a.id, title: a.title, color, startDay, endDay }
    : undefined

  return { markers, lifespan, startDay, endDay }
}
