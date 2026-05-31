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
export const TIMELINE_DATE_FIELDS: Partial<Record<ArticleType, TimelineDateField[]>> = {
  location:        [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Sacked_Date', label: 'Sacked', role: 'point' }, { key: 'Destroyed_Date', label: 'Destroyed', role: 'end' }],
  faction:         [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Disbanded_Date', label: 'Disbanded', role: 'end' }],
  organization:    [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Disbanded_Date', label: 'Disbanded', role: 'end' }],
  character:        [{ key: 'Born_Date', label: 'Born', role: 'start' }, { key: 'Death_Date', label: 'Died', role: 'end' }],
  playerCharacter:  [{ key: 'Born_Date', label: 'Born', role: 'start' }, { key: 'Death_Date', label: 'Died', role: 'end' }],
  item:            [{ key: 'Created_Date', label: 'Created', role: 'start' }, { key: 'Lost_Date', label: 'Lost', role: 'end' }],
  religion:        [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Ended_Date', label: 'Ended', role: 'end' }],
  culture:         [{ key: 'Founded_Date', label: 'Founded', role: 'start' }, { key: 'Ended_Date', label: 'Ended', role: 'end' }],
  vendor:          [{ key: 'Opened_Date', label: 'Opened', role: 'start' }, { key: 'Closed_Date', label: 'Closed', role: 'end' }],
  quest:           [{ key: 'Started_Date', label: 'Started', role: 'start' }, { key: 'Completed_Date', label: 'Completed', role: 'end' }],
  creature:        [{ key: 'Discovered_Date', label: 'Discovered', role: 'point' }],
  lore:            [{ key: 'Occurred_Date', label: 'Occurred', role: 'point' }],
  note:            [{ key: 'Written_Date', label: 'Written', role: 'point' }],
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

  const lifespan = (startDay != null && endDay != null && endDay > startDay)
    ? { id: a.id, title: a.title, color, startDay, endDay }
    : undefined

  return { markers, lifespan }
}
