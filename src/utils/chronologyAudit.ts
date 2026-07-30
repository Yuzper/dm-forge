// path: src/utils/chronologyAudit.ts
// Canon checks over the campaign's dated data. The timeline canvas can only draw
// what parses — buildArticleTimeline silently skips a date it can't read, and a
// lifespan whose end precedes its start is dropped entirely. For canon work the
// dropped rows are the interesting ones, so this module reports them instead.
import { TIMELINE_DATE_FIELDS, parseMilestones } from '../constants/timelineDates'
import type { ArticleType } from '../types'

export type IssueKind =
  | 'impossible-span'   // end date precedes start date — the article's own span is inverted
  | 'unreadable'        // a date was written but the parser can't place it
  | 'session-order'     // in-world order disagrees with session numbering
  | 'undated'           // datable article type with nothing filled in

export type IssueSeverity = 'error' | 'warn' | 'info'

export const ISSUE_SEVERITY: Record<IssueKind, IssueSeverity> = {
  'impossible-span': 'error',
  'unreadable': 'warn',
  'session-order': 'warn',
  'undated': 'info',
}

export const ISSUE_LABEL: Record<IssueKind, string> = {
  'impossible-span': 'Impossible span',
  'unreadable': "Couldn't read the date",
  'session-order': 'Session order drift',
  'undated': 'Undated',
}

// Severity order drives section order in the panel: contradictions first,
// unreadable second, merely-incomplete last.
export const ISSUE_ORDER: IssueKind[] = [
  'impossible-span', 'unreadable', 'session-order', 'undated',
]

export interface ChronologyIssue {
  key: string
  kind: IssueKind
  severity: IssueSeverity
  title: string             // the article or session the issue belongs to
  detail: string            // one readable sentence, already formatted
  raw?: string              // the offending date string, for 'unreadable'
  articleId?: number
  articleType?: string
  sessionId?: number
  day?: number              // where to jump on the axis, when we have a position
}

export interface AuditArticle {
  id: number
  title: string
  article_type: string
  tracks: string | null
}

export interface AuditSession {
  id: number
  name: string
  session_number: number
  session_sub: string | null
  in_world_day: number | null
}

type ParsedDate = { day: number; year: number }
type ParseDate = (raw: string) => ParsedDate | null

const filled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

const parseTracks = (raw: string | null): Record<string, any> => {
  try { return JSON.parse(raw ?? '{}') ?? {} } catch { return {} }
}

/**
 * Every check runs over already-loaded renderer data, so this is cheap enough to
 * recompute on each render of the timeline page.
 *
 * `formatDay` renders a day number in the campaign's calendar — passed in so the
 * audit stays independent of calendar state.
 */
export function auditChronology(
  articles: AuditArticle[],
  sessions: AuditSession[],
  parse: ParseDate,
  formatDay: (day: number) => string,
): ChronologyIssue[] {
  const issues: ChronologyIssue[] = []

  for (const a of articles) {
    const tracks = parseTracks(a.tracks)
    const type = a.article_type as ArticleType
    const fields = TIMELINE_DATE_FIELDS[type] ?? []

    let start: ParsedDate | undefined
    let end: ParsedDate | undefined
    let startLabel = 'start'
    let endLabel = 'end'
    // "Undated" means nothing was written at all — an unreadable date is already
    // reported on its own and shouldn't also be counted as missing.
    let anyWritten = false

    for (const f of fields) {
      const raw = tracks[f.key]
      if (filled(raw)) anyWritten = true
      const d = filled(raw) ? parse(raw) : null
      if (filled(raw) && !d) {
        issues.push({
          key: `unreadable-${a.id}-${f.key}`,
          kind: 'unreadable', severity: 'warn',
          title: a.title,
          detail: `${f.label.toLowerCase()} — couldn't read this date`,
          raw, articleId: a.id, articleType: a.article_type,
        })
        continue
      }
      if (!d) continue
      if (f.role === 'start') { start = d; startLabel = f.label.toLowerCase() }
      if (f.role === 'end') { end = d; endLabel = f.label.toLowerCase() }
    }

    // Events carry their date on In_World_Date rather than a typed field.
    if (a.article_type === 'event') {
      const raw = tracks.In_World_Date
      if (filled(raw)) {
        anyWritten = true
        const d = parse(raw)
        if (!d) {
          issues.push({
            key: `unreadable-${a.id}-In_World_Date`,
            kind: 'unreadable', severity: 'warn',
            title: a.title, detail: "couldn't read this date",
            raw, articleId: a.id, articleType: a.article_type,
          })
        }
      } else {
        issues.push({
          key: `undated-${a.id}`,
          kind: 'undated', severity: 'info',
          title: a.title, detail: 'no date set',
          articleId: a.id, articleType: a.article_type,
        })
      }
    }

    const legacyRaw = tracks.Timeline_Date
    if (filled(legacyRaw)) {
      anyWritten = true
      if (!parse(legacyRaw)) {
        issues.push({
          key: `unreadable-${a.id}-Timeline_Date`,
          kind: 'unreadable', severity: 'warn',
          title: a.title, detail: "timeline date — couldn't read this date",
          raw: legacyRaw, articleId: a.id, articleType: a.article_type,
        })
      }
    }

    // A span that ends before it begins renders as nothing at all today, so it
    // can sit wrong indefinitely without ever looking wrong.
    if (start && end && end.day < start.day) {
      issues.push({
        key: `span-${a.id}`,
        kind: 'impossible-span', severity: 'error',
        title: a.title,
        detail: `${endLabel} ${formatDay(end.day)}, but ${startLabel} ${formatDay(start.day)}`,
        articleId: a.id, articleType: a.article_type, day: start.day,
      })
    }

    // Milestones are freeform — a body found centuries later, a ruin rebuilt long
    // after it fell — so they get no ordering rule, only a readability check.
    for (const m of parseMilestones(tracks.Timeline_Milestones)) {
      if (!filled(m.date)) continue
      anyWritten = true
      if (!parse(m.date)) {
        issues.push({
          key: `unreadable-${a.id}-ms-${m.id}`,
          kind: 'unreadable', severity: 'warn',
          title: a.title,
          detail: `${m.label || 'milestone'} — couldn't read this date`,
          raw: m.date, articleId: a.id, articleType: a.article_type,
        })
      }
    }

    // Only nag about types that actually have somewhere to put a date.
    if (!anyWritten && fields.length > 0 && a.article_type !== 'event') {
      issues.push({
        key: `undated-${a.id}`,
        kind: 'undated', severity: 'info',
        title: a.title,
        detail: fields.map(f => f.label.toLowerCase()).join(' / ') + ' — not set',
        articleId: a.id, articleType: a.article_type,
      })
    }
  }

  // Flashbacks are legitimate, so this is a smell rather than an error: it only
  // fires when a later-numbered session is dated earlier in world time.
  const dated = sessions
    .filter(s => s.in_world_day != null)
    .sort((a, b) => a.session_number - b.session_number)

  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1]
    const cur = dated[i]
    if (cur.in_world_day! < prev.in_world_day!) {
      issues.push({
        key: `order-${cur.id}`,
        kind: 'session-order', severity: 'warn',
        title: `Session ${cur.session_number}${cur.session_sub ?? ''} · ${cur.name}`,
        detail: `${formatDay(cur.in_world_day!)} precedes session ${prev.session_number}${prev.session_sub ?? ''} (${formatDay(prev.in_world_day!)})`,
        sessionId: cur.id, day: cur.in_world_day!,
      })
    }
  }

  return issues
}

export const groupIssues = (issues: ChronologyIssue[]): Record<IssueKind, ChronologyIssue[]> => {
  const out = {} as Record<IssueKind, ChronologyIssue[]>
  for (const k of ISSUE_ORDER) out[k] = []
  for (const i of issues) out[i.kind].push(i)
  return out
}

export const countBySeverity = (issues: ChronologyIssue[]) => ({
  error: issues.filter(i => i.severity === 'error').length,
  warn: issues.filter(i => i.severity === 'warn').length,
  info: issues.filter(i => i.severity === 'info').length,
})
