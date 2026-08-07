// path: src/utils/contextMenus.ts
// Context menus keyed by *entity*, not by screen. An NPC right-clicked on a wiki
// card, a relations node, a graph node or an autolinked span is the same NPC and
// gets the same menu — the surface only contributes what it can additionally do
// (delete it, unlink it from this web…).
//
// Builders are pure: they take the entity plus a `MenuCtx` and return items with
// plain click callbacks. `useContextMenu` assigns the ids, strips the callbacks
// for IPC, and runs whichever one comes back. Nothing here touches the store.
//
// Two conventions hold throughout:
//   • Every entity menu opens with Open / Open in new tab / Open in other pane.
//     That is the whole reason this stage landed after tabs and the split.
//   • Destructive items fire immediately. `useConfirmDelete`'s click-again
//     pattern needs a control that survives the first click, and a native menu
//     closes on it. The kebab menus keep their confirm step, so the deliberate
//     path stays deliberate; right-click is the fast path.
import type { Location } from '../store/location'
import type { ArticleType, Session } from '../types'

export interface MenuItem {
  label?: string
  type?: 'separator' | 'checkbox'
  enabled?: boolean
  checked?: boolean
  /** Shown next to the label; never registered, so it can't steal the chord. */
  accelerator?: string
  submenu?: MenuItem[]
  click?: () => void | Promise<void>
}

export const SEP: MenuItem = { type: 'separator' }

/** Drops falsy entries so builders can inline `cond && item`. */
export type MaybeItem = MenuItem | false | null | undefined
export const items = (...xs: MaybeItem[]): MenuItem[] => xs.filter(Boolean) as MenuItem[]

/**
 * What a builder needs from the app, resolved at right-click time so the hook
 * itself subscribes to nothing and costs a card zero re-renders.
 */
export interface MenuCtx {
  /** True when a second pane is already open — changes the third item's wording. */
  split: boolean
  /** Point the focused pane's active tab at a location. */
  go: (loc: Location) => void
  /** Open a location as a new tab in the focused pane. */
  goTab: (loc: Location, background?: boolean) => void
  /** Open a location in the other pane, splitting the view if there isn't one. */
  goPane: (loc: Location) => void
  copy: (text: string) => void
  /** Jump to the wiki graph centred on an article. */
  showInGraph: (articleId: number) => void
  /** Open a relation web with one article selected and centred. */
  showInWeb: (webId: number, articleId: number) => void
  /** Float an article's stat block above the app. */
  openStatBlock: (articleId: number) => void
  /** Webs this article appears in as a node. Queried lazily, per right-click. */
  websForArticle: (articleId: number) => Promise<{ id: number; name: string }[]>
}

// ── The trio every entity menu starts with ────────────────────────────────────

export function openItems(loc: Location, ctx: MenuCtx, label = 'Open'): MenuItem[] {
  return [
    { label, click: () => ctx.go(loc) },
    // Background, like a browser's "Open link in new tab" — you asked for it to
    // be *available*, not to be taken there.
    { label: 'Open in new tab', click: () => ctx.goTab(loc, true) },
    { label: ctx.split ? 'Open in other pane' : 'Open in split view', click: () => ctx.goPane(loc) },
  ]
}

// ── Articles ──────────────────────────────────────────────────────────────────

export interface ArticleRef {
  id: number
  title: string
  article_type?: ArticleType | string
}

export interface ArticleMenuOpts {
  /** Fires immediately — no confirm step. Omit where the surface can't delete. */
  onDelete?: () => void
  /** Surface-specific items, appended before the destructive section. */
  extra?: MaybeItem[]
  /** Suppress "Show in wiki graph" when you're already looking at the graph. */
  inGraph?: boolean
  /** The web being viewed, so "Show in relations" doesn't offer where you are. */
  inWebId?: number
}

export async function buildArticleMenu(
  a: ArticleRef, ctx: MenuCtx, opts: ArticleMenuOpts = {},
): Promise<MenuItem[]> {
  const loc: Location = { type: 'article', articleId: a.id }
  // One indexed lookup per right-click. Cheap enough to do eagerly, and doing it
  // here is what lets the item be a real submenu — or be absent when the article
  // isn't in any web, rather than a dead end.
  const webs = (await ctx.websForArticle(a.id)).filter(w => w.id !== opts.inWebId)

  return items(
    ...openItems(loc, ctx),
    SEP,
    { label: 'Copy title', click: () => ctx.copy(a.title) },
    // The paste-ready form: dropping this into any editor makes a live link.
    { label: 'Copy as wiki link', click: () => ctx.copy(`[[${a.title}]]`) },
    SEP,
    !opts.inGraph && { label: 'Show in wiki graph', click: () => ctx.showInGraph(a.id) },
    webs.length === 1
      ? { label: `Show in “${webs[0].name}”`, click: () => ctx.showInWeb(webs[0].id, a.id) }
      : webs.length > 1 && {
          label: 'Show in relations',
          submenu: webs.map(w => ({ label: w.name, click: () => ctx.showInWeb(w.id, a.id) })),
        },
    a.article_type === 'creature' && {
      label: 'Open stat block', click: () => ctx.openStatBlock(a.id),
    },
    ...(opts.extra?.length ? [SEP, ...opts.extra] : []),
    ...(opts.onDelete ? [SEP, { label: `Delete “${truncate(a.title)}”`, click: opts.onDelete }] : []),
  )
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionMenuOpts {
  onDelete?: () => void
  extra?: MaybeItem[]
}

export function buildSessionMenu(s: Session, ctx: MenuCtx, opts: SessionMenuOpts = {}): MenuItem[] {
  const loc: Location = { type: 'session', sessionId: s.id }
  return items(
    ...openItems(loc, ctx),
    SEP,
    { label: 'Copy name', click: () => ctx.copy(s.name) },
    ...(opts.extra?.length ? [SEP, ...opts.extra] : []),
    ...(opts.onDelete ? [SEP, { label: `Delete “${truncate(s.name)}”`, click: opts.onDelete }] : []),
  )
}

// ── Anything else that is simply a location ───────────────────────────────────

/** Relation webs, DM notes pages, loot tables, campaign cards, timeline events. */
export interface LocationMenuOpts {
  label?: string
  copy?: { label: string; text: string }
  onDelete?: () => void
  deleteLabel?: string
  extra?: MaybeItem[]
}

export function buildLocationMenu(loc: Location, ctx: MenuCtx, opts: LocationMenuOpts = {}): MenuItem[] {
  return items(
    ...openItems(loc, ctx, opts.label),
    ...(opts.copy ? [SEP, { label: opts.copy.label, click: () => ctx.copy(opts.copy!.text) }] : []),
    ...(opts.extra?.length ? [SEP, ...opts.extra] : []),
    ...(opts.onDelete ? [SEP, { label: opts.deleteLabel ?? 'Delete', click: opts.onDelete }] : []),
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

export interface TabMenuActions {
  close: () => void
  closeOthers: () => void
  closeToRight: () => void
  duplicate: () => void
  moveToOtherPane: () => void
  openInOtherPane: () => void
  newTab: () => void
}

export function buildTabMenu(
  state: { tabCount: number; isLast: boolean; split: boolean },
  a: TabMenuActions,
): MenuItem[] {
  return items(
    { label: 'Close tab', accelerator: 'Ctrl+W', click: a.close },
    { label: 'Close other tabs', enabled: state.tabCount > 1, click: a.closeOthers },
    { label: 'Close tabs to the right', enabled: !state.isLast, click: a.closeToRight },
    SEP,
    { label: 'Duplicate tab', click: a.duplicate },
    state.split
      // Moving the pane's only tab would collapse it out from under the move,
      // so hand-over needs a tab to leave behind.
      ? { label: 'Move to other pane', enabled: state.tabCount > 1, click: a.moveToOtherPane }
      : { label: 'Open in split view', click: a.openInOtherPane },
    SEP,
    { label: 'New tab', accelerator: 'Ctrl+T', click: a.newTab },
  )
}

// ── Sounds ────────────────────────────────────────────────────────────────────

export interface SoundMenuActions {
  edit?: () => void
  boards?: { id: number; name: string }[]
  onAddToBoard?: (boardId: number) => void
  onDelete?: () => void
  deleteLabel?: string
}

/**
 * A sound is the one entity with no Location, so this builder takes no MenuCtx —
 * there is nowhere to open it. Play is deliberately absent: the play button sits
 * in the row already, and duplicating it in a menu buys nothing.
 */
export function buildSoundMenu(sound: { name: string }, a: SoundMenuActions): MenuItem[] {
  return items(
    a.edit && { label: 'Edit…', click: a.edit },
    a.boards?.length && a.onAddToBoard
      ? {
          label: 'Add to board',
          submenu: a.boards.map(b => ({ label: b.name, click: () => a.onAddToBoard!(b.id) })),
        }
      : null,
    ...(a.onDelete ? [SEP, { label: a.deleteLabel ?? `Delete “${truncate(sound.name)}”`, click: a.onDelete }] : []),
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────────

/** Menu labels wrap badly and a 200-character article title is a real thing. */
export function truncate(s: string, max = 32): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}
