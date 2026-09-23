// path: src/hooks/useTimelineData.ts
// Everything the vertical timeline draws that comes from articles: dated
// markers, lifespans, each article's start/end dates, and what couldn't be
// placed. Shared by the Timeline page and the date picker's preview, so the two
// can never disagree about what's on the timeline.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseInWorldDate } from '../utils/inWorldDate'
import { buildArticleTimeline, isStillStanding, type Lifespan } from '../constants/timelineDates'
import type { Era, TimelineEventItem } from '../utils/timelineGeometry'
import type { AuditArticle } from '../utils/chronologyAudit'

/** An article's start- and end-role dates, either of which may be missing. */
export interface TimelineBounds { start?: number; end?: number }

export function parseEras(raw: unknown): Era[] {
  try { const a = JSON.parse((raw as string) ?? '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

interface Loaded {
  items: TimelineEventItem[]
  lifespans: Lifespan[]
  bounds: Record<number, TimelineBounds>
  /** Articles marked as still around at the present (alive, active, standing). */
  standing: Record<number, true>
  undatedEvents: { id: number; title: string }[]
  /** Kept raw so the chronology audit can see dates the parser rejected. */
  rawArticles: AuditArticle[]
}

const EMPTY: Loaded = { items: [], lifespans: [], bounds: {}, standing: {}, undatedEvents: [], rawArticles: [] }

export function useTimelineData(campaignId: number | undefined) {
  const [data, setData] = useState<Loaded>(EMPTY)
  // A campaign switch mid-load must not land the old campaign's articles.
  const token = useRef(0)

  const reload = useCallback(async () => {
    if (!campaignId) { setData(EMPTY); return }
    const mine = ++token.current
    const list = await window.api.getArticlesList({ campaignId })
    if (mine !== token.current) return

    const items: TimelineEventItem[] = []
    const lifespans: Lifespan[] = []
    const bounds: Record<number, TimelineBounds> = {}
    const standing: Record<number, true> = {}
    const undatedEvents: { id: number; title: string }[] = []
    for (const a of list as any[]) {
      try {
        const t = JSON.parse(a.tracks ?? '{}')
        if (a.article_type === 'event') {
          const d = parseInWorldDate(t.In_World_Date)
          if (d) items.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'event', article_type: a.article_type, color: '#e05555' })
          else undatedEvents.push({ id: a.id, title: a.title })
        }
        if (a.article_type === 'character' || a.article_type === 'playerCharacter') {
          const d = parseInWorldDate(t.Death_Date)
          if (d) items.push({ id: a.id, title: a.title, day: d.day, year: d.year, kind: 'death', article_type: a.article_type, color: '#9b7de8', articleId: a.id })
        }
        // Semantic dates (founded/destroyed/born…), freeform milestones, and any
        // legacy Timeline_Date → point markers + an optional lifespan.
        const built = buildArticleTimeline(a, t, parseInWorldDate)
        items.push(...built.markers)
        if (built.lifespan) lifespans.push(built.lifespan)
        if (built.startDay != null || built.endDay != null) bounds[a.id] = { start: built.startDay, end: built.endDay }
        if (isStillStanding(a.article_type, t)) standing[a.id] = true
      } catch {}
    }
    setData({
      items, lifespans, bounds, standing, undatedEvents,
      rawArticles: (list as any[]).map(a => ({ id: a.id, title: a.title, article_type: a.article_type, tracks: a.tracks ?? null })),
    })
  }, [campaignId])

  useEffect(() => { reload() }, [reload])

  const articleInfo = useMemo(
    () => Object.fromEntries(data.rawArticles.map(a => [a.id, { title: a.title, article_type: a.article_type }])),
    [data.rawArticles],
  )

  return { ...data, articleInfo, reload }
}
