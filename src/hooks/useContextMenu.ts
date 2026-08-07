// path: src/hooks/useContextMenu.ts
// The dispatch half of the context-menu system: turns the declarative items from
// contextMenus.ts into a native popup and runs whatever the user picked.
//
// Ids are assigned here rather than by the builders, so two menus can't collide
// and a builder never has to invent a namespace. The click callbacks stay in the
// renderer — only labels and flags cross the IPC boundary.
//
// Nothing in this file subscribes to the store. Everything is read at click time
// through `getState`, so putting a menu on a list of 300 article cards costs
// exactly zero extra re-renders.
import { useCallback, useMemo } from 'react'
import type { MenuTemplateItem } from '../types'
import { sharedStore } from '../store/shared'
import { usePaneStoreApi, paneStoreFor } from '../context/PaneContext'
import { paneIdOf, type PaneStoreApi } from '../store/paneRegistry'
import type { Location } from '../store/location'
import { copyText } from '../utils/clipboard'
import { buildArticleMenu } from '../utils/contextMenus'
import type { MenuItem, MenuCtx, ArticleRef, ArticleMenuOpts } from '../utils/contextMenus'

// ── Template flattening ───────────────────────────────────────────────────────

/**
 * Drop separators that would render as a doubled or dangling rule.
 *
 * Builders compose optional sections — a menu with no relation webs, no stat
 * block and no delete leaves its separators behind with nothing between them.
 * Cleaning up here means no builder has to reason about which of its neighbours
 * actually made it in.
 */
function tidy(list: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const item of list) {
    const isSep = item.type === 'separator'
    if (isSep && (out.length === 0 || out[out.length - 1].type === 'separator')) continue
    out.push(item)
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop()
  return out
}

function toTemplate(list: MenuItem[], prefix: string, sinks: Map<string, () => void | Promise<void>>): MenuTemplateItem[] {
  return tidy(list).map((item, i) => {
    const id = `${prefix}${i}`
    if (item.submenu?.length) {
      return { id, label: item.label, enabled: item.enabled, submenu: toTemplate(item.submenu, `${id}.`, sinks) }
    }
    if (item.click) sinks.set(id, item.click)
    return {
      id: item.type === 'separator' ? undefined : id,
      label: item.label,
      type: item.type,
      enabled: item.enabled,
      checked: item.checked,
      accelerator: item.accelerator,
    }
  })
}

/**
 * Pop a native menu and run the chosen item. Usable outside React (DOM
 * listeners, Tiptap plugins) — the hook below is just this plus preventDefault.
 */
export async function showContextMenu(list: MenuItem[]) {
  if (!list.length) return
  const sinks = new Map<string, () => void | Promise<void>>()
  const template = toTemplate(list, 'm', sinks)
  const picked = await window.api.popupMenu(template)
  if (picked) await sinks.get(picked)?.()
}

// ── Marking what the menu is about ────────────────────────────────────────────

/**
 * A native menu floats above the app with nothing tying it back to the thing it
 * acts on. On a 200-node graph or a wall of wiki cards that leaves you trusting
 * your aim, so the target wears a ring for exactly as long as the menu is up.
 *
 * This is the honest reading of "right-click should select first": what was
 * wanted is *the menu says what it is about*, not selection. Actually selecting
 * would drag this app's selection side effects along with it — `selectPOI` opens
 * the POI panel, a relations node opens the 240px detail sidebar, a shape opens
 * its popup — so right-clicking a pin to copy a title would fling a panel open.
 *
 * A data attribute rather than a class: `className` is a React-controlled prop
 * on most of these elements, and a re-render mid-menu would take a class with it.
 * Nothing sets `data-menu-target`, so React leaves it alone.
 */
const MARK = 'data-menu-target'

function mark(el: Element | null) { el?.setAttribute(MARK, '') }
function unmark(el: Element | null) { el?.removeAttribute(MARK) }

export interface ShowMenuOptions {
  /**
   * What to ring while the menu is open. Defaults to the event's
   * `currentTarget`; pass an element to ring something more precise (a link
   * inside the editor), or `null` to ring nothing (the bare map canvas, where
   * outlining the whole viewport would be absurd).
   */
  target?: Element | null
}

// ── The hook ──────────────────────────────────────────────────────────────────

/**
 * Claims a right-click for a renderer menu. `preventDefault` also suppresses
 * Electron's own `context-menu` event (verified on Electron 29), so the native
 * text fallback in electron/main/contextMenu.ts cannot double-fire — the two
 * layers need no coordination.
 *
 * `items` may be a thunk, so a menu that needs a lookup (which relation webs is
 * this article in?) can await before the menu appears.
 */
export function useContextMenu() {
  return useCallback((
    e: React.MouseEvent | MouseEvent,
    list: MenuItem[] | (() => MenuItem[] | Promise<MenuItem[]>),
    opts?: ShowMenuOptions,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    // React nulls `currentTarget` the moment the handler returns, so it has to
    // be read here and not inside the promise chain below — reading it late
    // silently yields null and the ring never appears.
    const target = opts && 'target' in opts ? opts.target ?? null : (e.currentTarget as Element | null)
    // Marked synchronously: a menu whose items need a database lookup is still
    // a few milliseconds out, and the ring should answer "this one?" instantly.
    mark(target)
    void Promise.resolve(typeof list === 'function' ? list() : list)
      .then(showContextMenu)
      .finally(() => unmark(target))
  }, [])
}

// ── The context builders close over ───────────────────────────────────────────

function makeCtx(pane: PaneStoreApi): MenuCtx {
  const shared = () => sharedStore.getState()

  const goPane = (loc: Location) => {
    const s = shared()
    // "Other" relative to the pane this menu is bound to, not to whichever pane
    // has focus. Right-click claims focus first so the two normally agree — but
    // the bound pane is the one that cannot be wrong.
    const mine = paneIdOf(pane) ?? s.activePaneId
    const other = s.paneIds.find(id => id !== mine)
    // No second pane yet: splitting *is* opening in the other pane, and
    // splitPane already accepts an explicit seed for exactly this.
    if (!other) { s.splitPane(loc); return }
    // Resolved through the store cache, not the registry — same reason
    // ActivePaneProvider does: a pane is cached synchronously but registered
    // only once its provider's effect has run.
    void paneStoreFor(other).getState().openTab(loc)
    s.focusPane(other)
  }

  return {
    get split() { return shared().paneIds.length > 1 },
    go: (loc) => pane.getState().navigateTo(loc),
    goTab: (loc, background) => { void pane.getState().openTab(loc, { background }) },
    goPane,
    copy: copyText,
    showInGraph: (articleId) => {
      // WikiPage consumes the focus id on mount and flips itself to graph mode,
      // the same hand-off Ctrl+Enter in the search palette uses.
      const p = pane.getState()
      p.selectArticle(null)
      p.setWikiGraphFocusId(articleId)
      p.setView('wiki')
    },
    showInWeb: (webId, articleId) => {
      const p = pane.getState()
      // Order matters: _goto's relations branch clears relationsFocusArticleId,
      // so the focus has to be planted after the navigation, not before.
      p.navigateTo({ type: 'relations', webId })
      p.setRelationsFocusArticleId(articleId)
    },
    openStatBlock: (articleId) => shared().openStatBlockOverlay(articleId),
    websForArticle: async (articleId) => {
      try { return await window.api.listRelationWebsForMember(articleId) } catch { return [] }
    },
  }
}

/**
 * The menu context bound to *this* component's pane. Deliberately not the active
 * pane: a card in the unfocused pane must still open into its own pane if the
 * user right-clicks it. (Right-click does claim focus via PaneView's
 * pointer-down capture, so in practice these agree — but the pane store handle
 * is the honest source.)
 */
export function useMenuCtx(): MenuCtx {
  const pane = usePaneStoreApi()
  return useMemo(() => makeCtx(pane), [pane])
}

/**
 * The common case, in one line: `onContextMenu={articleMenu(a)}`. Articles turn
 * up as chips, backlinks, affiliations and breadcrumbs all over the app, and
 * every one of them should give the same menu.
 */
export function useArticleContextMenu() {
  const showMenu = useContextMenu()
  const ctx = useMenuCtx()
  return useCallback(
    (a: ArticleRef, opts?: ArticleMenuOpts) => (e: React.MouseEvent) =>
      showMenu(e, () => buildArticleMenu(a, ctx, opts)),
    [showMenu, ctx],
  )
}
