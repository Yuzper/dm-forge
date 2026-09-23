// path: src/store/location.ts
// A Location is *where a tab is pointed*, stored by id rather than by embedded
// row. The pre-tabs HistoryEntry carried whole Campaign/Session objects, which
// was fine for an in-memory Recent list and wrong for something written to disk:
// the rows go stale, and a deleted session leaves a tab holding a ghost.
//
// Labels and icons are therefore derived at render time from the shared caches.
// A location whose row is gone resolves to null and renders as a dead tab the
// user can close, rather than crashing the strip.
import type { Session, ArticleSummary } from '../types'
import type { View } from './pane'

export type Location =
  | { type: 'campaign'; subView?: 'hub' | 'sessions' }
  | { type: 'session'; sessionId: number }
  | { type: 'article'; articleId: number }
  | { type: 'wiki' }
  | { type: 'relations'; webId?: number | null }
  | { type: 'dm-notes'; pageId?: number | null }
  | { type: 'loot-tables' }
  // Tabs saved before the vertical timeline may still carry the old drill-down
  // `level`/`orient` fields; they're ignored now.
  | { type: 'timeline' }
  | { type: 'soundboard' }

/** Which pane `view` this location renders as. */
export function locationView(loc: Location): View {
  switch (loc.type) {
    case 'campaign': return 'campaign'
    case 'session':  return 'session'
    case 'article':  return 'wiki'
    default:         return loc.type
  }
}

/**
 * Same *place*, ignoring sub-position. Used to decide whether a navigation is a
 * new history step or a refinement of the current one — switching DM notes pages
 * shouldn't stack up back-entries, matching the old patchLastHistoryEntry.
 */
export function samePlace(a: Location, b: Location): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'session')  return a.sessionId === (b as typeof a).sessionId
  if (a.type === 'article')  return a.articleId === (b as typeof a).articleId
  return true
}

/** Exact equality including sub-position, for dedupe in the Recent list. */
export function sameLocation(a: Location, b: Location): boolean {
  if (!samePlace(a, b)) return false
  if (a.type === 'campaign')  return (a.subView ?? 'hub') === ((b as typeof a).subView ?? 'hub')
  if (a.type === 'relations') return (a.webId ?? null) === ((b as typeof a).webId ?? null)
  if (a.type === 'dm-notes')  return (a.pageId ?? null) === ((b as typeof a).pageId ?? null)
  return true
}

export interface LocationCtx {
  campaignName?: string
  sessions: Session[]
  drafts: Session[]
  allArticles: ArticleSummary[]
  // id → display name for relation webs and DM notes pages, so two tabs of the
  // same kind are tellable apart. Absent names fall back to the generic label
  // rather than reading as a dead tab — the row exists, we just don't know it yet.
  locationNames?: { relations: Record<number, string>; 'dm-notes': Record<number, string> }
}

export function sessionLabel(s: Session): string {
  return s.is_draft
    ? `Future Session: ${s.name}`
    : `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`
}

/**
 * Display text for a tab or Recent row. Returns null when the referenced row no
 * longer exists — the caller renders that as a dead tab.
 */
export function locationLabel(loc: Location, ctx: LocationCtx): string | null {
  switch (loc.type) {
    case 'campaign':    return ctx.campaignName ?? 'Campaign'
    case 'wiki':        return 'Wiki'
    case 'relations':
      return (loc.webId != null && ctx.locationNames?.relations[loc.webId]) || 'Webs'
    case 'dm-notes':
      return (loc.pageId != null && ctx.locationNames?.['dm-notes'][loc.pageId]) || 'DM Notes'
    case 'loot-tables': return 'Loot Tables'
    case 'timeline':    return 'Timeline'
    case 'soundboard':  return 'Soundboard'
    case 'session': {
      const s = [...ctx.sessions, ...ctx.drafts].find(x => x.id === loc.sessionId)
      return s ? sessionLabel(s) : null
    }
    case 'article': {
      const a = ctx.allArticles.find(x => x.id === loc.articleId)
      return a ? a.title : null
    }
  }
}

let seq = 0
export function newTabId(): string {
  return `t${Date.now().toString(36)}${(seq++).toString(36)}`
}
