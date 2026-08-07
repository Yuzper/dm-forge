// path: src/components/TimelineOutline.tsx
// Outline mode for the Timeline page: the same dated data read as a document —
// era chapters, year subheads, entries in day order. Unlike the axis view this
// can also show entries that have no position at all (undated / unreadable),
// which is the half of canon work the canvas structurally can't display.
import { useMemo } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import type { Arc } from '../types'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'
import {
  dayToCalendarDate, formatCalendarDay,
  type CampaignCalendar, type Era, type SessionRenderItem, type TimelineEventItem,
} from '../utils/timelineGeometry'
import type { ChronologyIssue } from '../utils/chronologyAudit'

export interface OutlineEntry {
  key: string
  day: number
  year: number
  title: string
  color: string
  sessionId?: number
  articleId?: number
  badge?: string        // session number chip
  trailing?: string     // arc name / formatted day
  kind: 'session' | 'event' | 'death' | 'quest' | 'article'
}

const KIND_COLOR: Record<string, string> = {
  event: '#e05555', death: '#9b7de8', quest: '#5b9fe8', article: '#8a8a8a',
}

export function TimelineOutline({
  eras, cal, sessions, arcMap, items, issues, undatedSessions,
  onOpenSession, onOpenArticle, onSelectIssue, onRowMenu,
}: {
  eras: Era[]
  cal: CampaignCalendar
  sessions: SessionRenderItem[]
  arcMap: Record<number, Arc>
  items: TimelineEventItem[]
  issues: ChronologyIssue[]
  undatedSessions: { id: number; name: string; session_number: number; session_sub: string | null }[]
  onOpenSession: (id: number) => void
  onOpenArticle: (id: number) => void
  onSelectIssue: (issue: ChronologyIssue) => void
  onRowMenu?: (entry: OutlineEntry, e: React.MouseEvent) => void
}) {
  // Errors are pinned to the row they contradict so a read-through surfaces them
  // in place; the rest live in the "not placed" tail. Keyed by day as well as id
  // so the flag lands on the offending moment, not on every row of that article.
  const flags = useMemo(() => {
    const map = new Map<string, ChronologyIssue>()
    for (const i of issues) {
      if (i.severity !== 'error') continue
      const k = i.sessionId != null ? `s${i.sessionId}` : `a${i.articleId}@${i.day}`
      if (!map.has(k)) map.set(k, i)
    }
    return map
  }, [issues])

  const groups = useMemo(() => {
    const entries: OutlineEntry[] = [
      ...sessions.map(s => ({
        key: `s-${s.id}`,
        day: s.in_world_day,
        year: dayToCalendarDate(s.in_world_day, cal).year,
        title: s.name,
        color: arcMap[s.arc_id ?? 0]?.color ?? 'var(--gold)',
        sessionId: s.id,
        badge: `S${s.session_number}${s.session_sub ?? ''}`,
        trailing: arcMap[s.arc_id ?? 0]?.name,
        kind: 'session' as const,
      })),
      ...items.map(i => ({
        key: `i-${i.kind}-${i.id}-${i.day}-${i.title}`,
        day: i.day,
        year: dayToCalendarDate(i.day, cal).year,
        title: i.title,
        color: i.color || ARTICLE_TYPE_COLORS[i.article_type] || KIND_COLOR[i.kind] || '#8a8a8a',
        articleId: i.articleId ?? i.id,
        kind: i.kind,
      })),
    ].sort((a, b) => a.day - b.day)

    const sortedEras = [...eras].sort((a, b) => a.startYear - b.startYear)
    const buckets: { era: Era | null; entries: OutlineEntry[] }[] = sortedEras.map(era => ({ era, entries: [] }))
    const loose: OutlineEntry[] = []

    for (const e of entries) {
      const era = sortedEras.find(x => e.year >= x.startYear && e.year <= x.endYear)
      if (era) buckets.find(b => b.era?.id === era.id)!.entries.push(e)
      else loose.push(e)
    }
    if (loose.length) buckets.push({ era: null, entries: loose })

    return buckets
      .filter(b => b.entries.length > 0)
      .map(b => {
        const byYear = new Map<number, OutlineEntry[]>()
        for (const e of b.entries) {
          if (!byYear.has(e.year)) byYear.set(e.year, [])
          byYear.get(e.year)!.push(e)
        }
        return {
          era: b.era,
          years: [...byYear.entries()].sort((x, y) => x[0] - y[0]).map(([year, list]) => ({ year, list })),
          count: b.entries.length,
        }
      })
  }, [sessions, items, eras, cal, arcMap])

  const unplaced = useMemo(
    () => issues.filter(i => i.kind === 'unreadable' || i.kind === 'undated'),
    [issues],
  )

  const rowStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'baseline', gap: 10,
    padding: '6px 8px', background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
    cursor: 'pointer', textAlign: 'left', transition: 'background 80ms',
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 32px 40px', background: 'var(--bg-base)' }}>
      {groups.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          Nothing dated yet — add a date to a session or an article and it will appear here.
        </div>
      )}

      {groups.map((g, gi) => (
        <div key={g.era?.id ?? `loose-${gi}`} style={{ marginBottom: 26 }}>
          <div style={{ borderLeft: `3px solid ${g.era?.color ?? 'var(--border-light)'}`, paddingLeft: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
              {g.era?.name ?? 'Outside any era'}
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                {g.era ? `${g.era.startYear}–${g.era.endYear} · ` : ''}{g.count} {g.count === 1 ? 'entry' : 'entries'}
              </span>
            </div>
          </div>

          <div style={{ paddingLeft: 15 }}>
            {g.years.map(({ year, list }) => (
              <div key={year} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 0 4px 8px' }}>
                  {year}
                </div>
                {list.map(e => {
                  const flag = flags.get(e.sessionId != null ? `s${e.sessionId}` : `a${e.articleId}@${e.day}`)
                  return (
                    <div key={e.key} style={{ borderTop: '1px solid var(--border)' }}>
                      <button className="hover-bg" style={rowStyle}
                        onClick={() => e.sessionId != null ? onOpenSession(e.sessionId) : onOpenArticle(e.articleId!)}
                        onContextMenu={ev => onRowMenu?.(e, ev)}>
                        {e.badge ? (
                          <span style={{ fontSize: 10, color: 'var(--gold)', border: '1px solid var(--border-gold)', background: 'var(--gold-glow)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', flexShrink: 0 }}>
                            {e.badge}
                          </span>
                        ) : (
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.color, flexShrink: 0, alignSelf: 'center' }} />
                        )}
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.title}
                        </span>
                        {flag && (
                          <span onClick={ev => { ev.stopPropagation(); onSelectIssue(flag) }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', flexShrink: 0 }}>
                            <AlertTriangle size={9} /> {flag.detail}
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, paddingLeft: 8 }}>
                          {e.trailing ? `${e.trailing} · ` : ''}{formatCalendarDay(e.day, cal)}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ))}

      {(unplaced.length > 0 || undatedSessions.length > 0) && (
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Not placed
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
              · {unplaced.length + undatedSessions.length}
            </span>
          </div>

          {undatedSessions.map(s => (
            <button key={`us-${s.id}`} className="hover-bg" style={rowStyle} onClick={() => onOpenSession(s.id)}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', flexShrink: 0 }}>
                S{s.session_number}{s.session_sub ?? ''}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{s.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>no in-world date</span>
            </button>
          ))}

          {unplaced.map(i => (
            <button key={i.key} className="hover-bg" style={rowStyle} onClick={() => onSelectIssue(i)}>
              {i.kind === 'unreadable'
                ? <HelpCircle size={11} color="var(--warning)" style={{ flexShrink: 0, alignSelf: 'center' }} />
                : <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0, alignSelf: 'center' }} />}
              <span style={{ fontSize: 13, color: 'var(--text-primary)', flexShrink: 0 }}>{i.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.raw ? `${i.detail} — “${i.raw}”` : i.detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
