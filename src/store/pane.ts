// path: src/store/pane.ts
// Per-pane state: what *this* view of the campaign is currently showing. One
// instance per pane, so a second pane can hold a map open while the first edits
// an article.
//
// The dividing line with shared.ts: if two panes could legitimately disagree
// about a value, it belongs here. Actions that mutate campaign-wide data write
// straight into the shared store and fan out to sibling panes.
//
// Stage 1 runs a single pane, so this file is a move, not a rewrite — the bodies
// below are the originals from store.ts with their shared reads redirected.
import { createStore } from 'zustand/vanilla'
import type { Campaign, Session, GameMap, POI, Article, ArticleSummary, ArticleType } from '../types'
import { loadVisitView, saveVisitView, sessionScope } from '../utils/visitLayers'
import { sharedStore } from './shared'
import { forEachPane } from './paneRegistry'
import type { PaneStoreApi } from './paneRegistry'
import { newTabId, locationView, samePlace, type Location } from './location'
import { loadWorkspace } from './workspacePersist'
import { paneIdOf, getPane, type PaneId } from './paneRegistry'

export type View = 'campaigns' | 'campaign' | 'session' | 'wiki' | 'dm-notes' | 'loot-tables' | 'relations' | 'timeline' | 'soundboard'

// ── Tabs ──────────────────────────────────────────────────────────────────────

/**
 * View state a tab carries across a switch. Only one tab is materialised into
 * the pane at a time, so without this, leaving a filtered wiki tab and coming
 * back would silently reset the filter.
 */
export interface TabViewState {
  campaignSubView: 'hub' | 'sessions'
  wikiFilter: ArticleType | 'all'
  wikiSearch: string
  wikiTagFilter: string | null
  wikiShowTags: boolean
  wikiSearchFields: { title: boolean; tags: boolean }
  relationsOpenWebId: number | null
  dmNotesOpenPageId: number | null
}

export interface Tab {
  id: string
  location: Location
  back: Location[]
  forward: Location[]
  viewState?: TabViewState
}

const MAX_BACK = 25

function makeTab(location: Location): Tab {
  return { id: newTabId(), location, back: [], forward: [] }
}

export interface PaneSlice {
  // Navigation
  view: View
  setView: (v: View) => void
  campaignSubView: 'hub' | 'sessions'
  setCampaignSubView: (v: 'hub' | 'sessions') => void
  navigateToSessionById: (sessionId: number) => Promise<void>

  // Tabs. Only the active tab is materialised into the pane; the rest are
  // Locations plus their own back/forward stacks.
  tabs: Tab[]
  activeTabId: string | null
  /** `after` inserts beside a specific tab instead of beside the active one. */
  openTab: (loc: Location, opts?: { background?: boolean; after?: string }) => Promise<void>
  closeTab: (id: string) => Promise<void>
  /** Close every tab but this one. */
  closeOtherTabs: (id: string) => Promise<void>
  /** Close everything after this one in the strip. */
  closeTabsToRight: (id: string) => Promise<void>
  /** A second tab on the same location, with a fresh (empty) history. */
  duplicateTab: (id: string) => Promise<void>
  selectTab: (id: string) => Promise<void>
  moveTab: (fromIndex: number, toIndex: number) => void
  cycleTab: (delta: number) => Promise<void>
  selectTabByIndex: (index: number) => Promise<void>
  navigateBack: () => Promise<void>
  navigateForward: () => Promise<void>
  canGoBack: () => boolean
  canGoForward: () => boolean
  /** Where the active tab is pointed, for pages that own sub-position state. */
  activeLocation: () => Location | null
  /**
   * Point the active tab at a location, exactly as clicking through the UI
   * would. The public face of `_recordLocation`, for callers (context menus,
   * the command palette) that hold a Location rather than a specific action.
   */
  navigateTo: (loc: Location) => void
  /** Patch the active tab's sub-position without adding a history step. */
  patchLocation: (type: Location['type'], patch: Record<string, unknown>) => void
  /** Record a navigation into the active tab (creating one if needed). */
  _recordLocation: (loc: Location) => void
  /** Materialise a location into this pane's live state. */
  _goto: (loc: Location) => Promise<void>
  _captureViewState: () => TabViewState
  _persist: () => void

  // Session shown in this pane
  currentSession: Session | null
  selectSession: (s: Session) => void

  // Maps
  maps: GameMap[]
  currentMap: GameMap | null
  loadMaps: (sessionId: number) => Promise<void>
  selectMap: (m: GameMap) => void
  importMap: (sessionId: number) => Promise<void>
  createScene: (sessionId: number) => Promise<void>
  deleteMap: (id: number) => Promise<void>
  updateMap: (id: number, data: { name?: string; content?: string }) => Promise<void>
  reorderMaps: (orders: { id: number; sort_order: number }[]) => Promise<void>
  reorderSessionTabs: (orderedMaps: GameMap[]) => Promise<void>
  moveMapToSession: (mapId: number, sessionId: number) => Promise<void>
  attachMapToSession: (mapId: number, layerId: number | null) => Promise<void>
  detachMapFromSession: (mapId: number) => Promise<void>
  ghostLayerIds: number[]
  toggleGhostLayer: (layerId: number) => void
  rememberVisitView: () => void
  showBaseLayer: boolean
  toggleBaseLayer: () => void

  // POIs
  pois: POI[]
  selectedPOI: POI | null
  poiPanelOpen: boolean
  editMode: boolean
  sessionReadMode: boolean
  loadPOIs: (mapId: number) => Promise<void>
  selectPOI: (p: POI | null) => void
  createPOI: (x: number, y: number) => Promise<void>
  updatePOI: (id: number, data: Partial<POI>) => Promise<void>
  deletePOI: (id: number) => Promise<void>
  setEditMode: (v: boolean) => void
  setSessionReadMode: (v: boolean) => void

  // Wiki — `articles` is the filtered list, i.e. view state. The unfiltered
  // index lives in the shared store as `allArticles`.
  articles: ArticleSummary[]
  currentArticle: Article | null
  wikiFilter: ArticleType | 'all'
  wikiSearch: string
  wikiTagFilter: string | null
  wikiShowTags: boolean
  wikiSearchFields: { title: boolean; tags: boolean }
  loadArticles: () => Promise<void>
  openArticle: (id: number) => Promise<void>
  selectArticle: (a: Article | null) => void
  navigateToArticleByTitle: (title: string) => Promise<void>
  createArticle: (data: { title: string; article_type: ArticleType }) => Promise<Article>
  updateArticle: (id: number, data: Partial<Article>) => Promise<void>
  deleteArticle: (id: number) => Promise<void>
  setWikiFilter: (f: ArticleType | 'all') => void
  setWikiSearch: (s: string) => void
  setWikiTagFilter: (tag: string | null) => void
  setWikiSearchFields: (fields: { title: boolean; tags: boolean }) => void
  setWikiShowTags: (v: boolean) => void

  // Deep-link hand-offs, all scoped to the pane that will consume them
  relationsOpenWebId: number | null
  setRelationsOpenWebId: (id: number | null) => void
  relationsFocusArticleId: number | null
  setRelationsFocusArticleId: (id: number | null) => void
  dmNotesOpenPageId: number | null
  setDMNotesOpenPageId: (id: number | null) => void
  wikiGraphFocusId: number | null
  setWikiGraphFocusId: (id: number | null) => void

  // Feature hints follow the pane whose context they describe.
  hintContext: string | null
  setHintContext: (key: string | null) => void
  hintMinimized: boolean
  setHintMinimized: (v: boolean) => void

  /** Hand a tab to the other pane (Stage 3 split view). */
  moveTabToPane: (tabId: string, targetPaneId: PaneId) => Promise<void>
  /** Adopt a tab handed over from the other pane. */
  adoptTab: (tab: Tab) => Promise<void>

  // ── Fan-out receivers (called by shared.ts, never by components) ───────────
  _enterCampaign: (c: Campaign) => void
  _initTabs: (tabs: Tab[] | null, activeTabId: string | null, seed: Location) => void
  _onCampaignDeleted: (id: number) => void
  _onSessionUpdated: (id: number, data: Partial<Session>) => void
  _patchCurrentSession: (id: number, data: Partial<Session>) => void
  _onSessionDeleted: (id: number) => void
  _onSoundBoardDeleted: (id: number) => void
  _onArticleUpdated: (id: number, updated: Article) => void
  _onArticleDeleted: (id: number) => void
  _dropTabsMatching: (pred: (loc: Location) => boolean) => void
}

/** Query args shared by every wiki list refresh. */
function articleQuery(s: PaneSlice, campaignId: number) {
  return {
    campaignId,
    type: s.wikiFilter === 'all' ? undefined : s.wikiFilter,
    search: s.wikiSearch || undefined,
    searchTitle: s.wikiSearchFields.title,
    searchTags: s.wikiSearchFields.tags,
    tag: s.wikiTagFilter || undefined,
  }
}

export function createPaneStore() {
  const store: PaneStoreApi = createStore<PaneSlice>()((set, get) => ({

    // ── Navigation ────────────────────────────────────────────────────────────

    view: 'campaigns',
    setView: (view) => {
      // 'campaigns' leaves the campaign entirely — no tab owns that.
      if (view === 'campaigns') { set({ view }); return }
      if (view === 'campaign') { get()._recordLocation({ type: 'campaign', subView: get().campaignSubView }); return }
      get()._recordLocation({ type: view } as Location)
    },
    campaignSubView: 'hub',
    setCampaignSubView: (campaignSubView) => {
      set({ campaignSubView })
      // Hub vs Sessions is a sub-position, not a new history step.
      get().patchLocation('campaign', { subView: campaignSubView })
    },

    // ── Tabs ──────────────────────────────────────────────────────────────────

    tabs: [],
    activeTabId: null,

    _captureViewState: (): TabViewState => {
      const s = get()
      return {
        campaignSubView: s.campaignSubView,
        wikiFilter: s.wikiFilter,
        wikiSearch: s.wikiSearch,
        wikiTagFilter: s.wikiTagFilter,
        wikiShowTags: s.wikiShowTags,
        wikiSearchFields: s.wikiSearchFields,
        relationsOpenWebId: s.relationsOpenWebId,
        dmNotesOpenPageId: s.dmNotesOpenPageId,
      }
    },

    // Persistence is workspace-wide (both panes plus the splitter), so a pane
    // just asks the shared slice to snapshot everything from the registry.
    _persist: () => sharedStore.getState().persistWorkspace(),

    _recordLocation: (loc) => {
      set(s => {
        const active = s.tabs.find(t => t.id === s.activeTabId)
        if (!active) {
          const tab = makeTab(loc)
          return { tabs: [...s.tabs, tab], activeTabId: tab.id }
        }
        // Refinement of where we already are: replace, don't stack.
        if (samePlace(active.location, loc)) {
          return { tabs: s.tabs.map(t => t.id === active.id ? { ...t, location: loc } : t) }
        }
        return {
          tabs: s.tabs.map(t => t.id === active.id ? {
            ...t,
            location: loc,
            back: [...t.back, active.location].slice(-MAX_BACK),
            forward: [],
          } : t),
        }
      })
      void get()._goto(loc)
      get()._persist()
    },

    activeLocation: () => {
      const { tabs, activeTabId } = get()
      return tabs.find(t => t.id === activeTabId)?.location ?? null
    },

    navigateTo: (loc) => get()._recordLocation(loc),

    patchLocation: (type, patch) => {
      set(s => {
        const active = s.tabs.find(t => t.id === s.activeTabId)
        if (!active || active.location.type !== type) return {}
        // Values can be objects (the timeline's drill level), which are rebuilt
        // on every render — compare by value or this never sees a no-op and
        // re-persists on every tick.
        const same = (a: unknown, b: unknown) =>
          a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b))
        if (Object.entries(patch).every(([k, v]) => same((active.location as any)[k], v))) return {}
        const location = { ...active.location, ...patch } as Location
        return { tabs: s.tabs.map(t => t.id === active.id ? { ...t, location } : t) }
      })
      get()._persist()
    },

    _goto: async (loc) => {
      const shared = sharedStore.getState()
      set({ view: locationView(loc) })
      switch (loc.type) {
        case 'campaign':
          set({ campaignSubView: loc.subView ?? 'hub' })
          break

        case 'session': {
          const s = [...shared.sessions, ...shared.drafts].find(x => x.id === loc.sessionId)
          if (!s) return                        // dead tab; strip renders it as unavailable
          set({
            currentSession: s,
            maps: [], currentMap: null,
            pois: [], selectedPOI: null, poiPanelOpen: false,
            sessionReadMode: true,
          })
          get().loadMaps(s.id)
          get().loadArticles()
          break
        }

        case 'wiki':
          set({ currentArticle: null })
          get().loadArticles()
          break

        case 'article': {
          const article = await window.api.getArticle(loc.articleId)
          if (!article) return
          set({ currentArticle: article })
          if (get().articles.length === 0) await get().loadArticles()
          break
        }

        case 'relations':
          set({ relationsOpenWebId: loc.webId ?? null, relationsFocusArticleId: null })
          break

        case 'dm-notes':
          set({ dmNotesOpenPageId: loc.pageId ?? null })
          break

        // loot-tables / timeline / soundboard load their own data on mount.
      }
    },

    openTab: async (loc, opts) => {
      const tab = makeTab(loc)
      set(s => ({
        // A new tab lands directly right of the active one, like a browser.
        tabs: (() => {
          const i = s.tabs.findIndex(t => t.id === (opts?.after ?? s.activeTabId))
          if (i === -1) return [...s.tabs, tab]
          return [...s.tabs.slice(0, i + 1), tab, ...s.tabs.slice(i + 1)]
        })(),
      }))
      if (!opts?.background) await get().selectTab(tab.id)
      else get()._persist()
    },

    selectTab: async (id) => {
      const s = get()
      if (s.activeTabId === id) return
      const next = s.tabs.find(t => t.id === id)
      if (!next) return
      const viewState = s._captureViewState()
      set(st => ({
        // Park the outgoing tab's filters so returning finds them intact.
        tabs: st.tabs.map(t => t.id === st.activeTabId ? { ...t, viewState } : t),
        activeTabId: id,
        ...(next.viewState ?? {}),
      }))
      await get()._goto(next.location)
      get()._persist()
    },

    closeTab: async (id) => {
      const s = get()
      const index = s.tabs.findIndex(t => t.id === id)
      if (index === -1) return
      const remaining = s.tabs.filter(t => t.id !== id)
      if (!remaining.length) {
        // Closing a split pane's last tab collapses the pane, like an editor.
        const myId = paneIdOf(store)
        if (myId && sharedStore.getState().paneIds.length > 1) {
          set({ tabs: [], activeTabId: null })
          sharedStore.getState().closePane(myId)
          return
        }
        // Otherwise never leave an empty strip — fall back to the campaign hub.
        const tab = makeTab({ type: 'campaign', subView: 'hub' })
        set({ tabs: [tab], activeTabId: tab.id })
        await get()._goto(tab.location)
        get()._persist()
        return
      }
      const wasActive = s.activeTabId === id
      set({ tabs: remaining })
      if (wasActive) {
        // Chrome's rule: focus the tab that slid into this slot, else the last.
        const neighbour = remaining[Math.min(index, remaining.length - 1)]
        set({ activeTabId: null })
        await get().selectTab(neighbour.id)
      }
      get()._persist()
    },

    closeOtherTabs: async (id) => {
      const s = get()
      const keep = s.tabs.find(t => t.id === id)
      if (!keep || s.tabs.length < 2) return
      set({ tabs: [keep] })
      // Selecting is a no-op when it was already active, so materialise
      // explicitly — the kept tab's own view state must survive either way.
      if (s.activeTabId !== id) {
        set({ activeTabId: null })
        await get().selectTab(id)
      }
      get()._persist()
    },

    closeTabsToRight: async (id) => {
      const s = get()
      const index = s.tabs.findIndex(t => t.id === id)
      if (index === -1 || index === s.tabs.length - 1) return
      const kept = s.tabs.slice(0, index + 1)
      const closingActive = !kept.some(t => t.id === s.activeTabId)
      set({ tabs: kept })
      if (closingActive) {
        set({ activeTabId: null })
        await get().selectTab(id)
      }
      get()._persist()
    },

    duplicateTab: async (id) => {
      const source = get().tabs.find(t => t.id === id)
      if (!source) return
      // Its history belongs to the original — a duplicate is a fresh start at
      // the same place, matching a browser's "Duplicate tab" minus the history.
      await get().openTab(source.location, { after: id })
    },

    moveTab: (fromIndex, toIndex) => {
      set(s => {
        if (fromIndex === toIndex) return {}
        const tabs = [...s.tabs]
        const [moved] = tabs.splice(fromIndex, 1)
        if (!moved) return {}
        tabs.splice(toIndex, 0, moved)
        return { tabs }
      })
      get()._persist()
    },

    cycleTab: async (delta) => {
      const { tabs, activeTabId } = get()
      if (tabs.length < 2) return
      const i = tabs.findIndex(t => t.id === activeTabId)
      const next = (i + delta + tabs.length) % tabs.length
      await get().selectTab(tabs[next].id)
    },

    selectTabByIndex: async (index) => {
      const { tabs } = get()
      // Ctrl+9 means "last tab", matching browsers.
      const tab = index >= tabs.length ? tabs[tabs.length - 1] : tabs[index]
      if (tab) await get().selectTab(tab.id)
    },

    moveTabToPane: async (tabId, targetPaneId) => {
      const target = getPane(targetPaneId)
      if (!target || target === store) return
      const tab = get().tabs.find(t => t.id === tabId)
      if (!tab) return
      // Park the live view state first, so the tab arrives with its filters.
      const withState = tab.id === get().activeTabId
        ? { ...tab, viewState: get()._captureViewState() }
        : tab
      await get().closeTab(tabId)
      await target.getState().adoptTab(withState)
      sharedStore.getState().focusPane(targetPaneId)
    },

    adoptTab: async (tab) => {
      set(s => ({ tabs: [...s.tabs, tab], activeTabId: null }))
      await get().selectTab(tab.id)
    },

    canGoBack: () => {
      const { tabs, activeTabId } = get()
      return !!tabs.find(t => t.id === activeTabId)?.back.length
    },

    canGoForward: () => {
      const { tabs, activeTabId } = get()
      return !!tabs.find(t => t.id === activeTabId)?.forward.length
    },

    navigateBack: async () => {
      const s = get()
      const active = s.tabs.find(t => t.id === s.activeTabId)
      if (!active?.back.length) return
      const target = active.back[active.back.length - 1]
      set(st => ({
        tabs: st.tabs.map(t => t.id === active.id ? {
          ...t,
          location: target,
          back: t.back.slice(0, -1),
          forward: [...t.forward, active.location],
        } : t),
      }))
      await get()._goto(target)
      get()._persist()
    },

    navigateForward: async () => {
      const s = get()
      const active = s.tabs.find(t => t.id === s.activeTabId)
      if (!active?.forward.length) return
      const target = active.forward[active.forward.length - 1]
      set(st => ({
        tabs: st.tabs.map(t => t.id === active.id ? {
          ...t,
          location: target,
          back: [...t.back, active.location].slice(-MAX_BACK),
          forward: t.forward.slice(0, -1),
        } : t),
      }))
      await get()._goto(target)
      get()._persist()
    },

    navigateToSessionById: async (sessionId: number) => {
      const shared = sharedStore.getState()
      if (!shared.currentCampaign) return
      let session = shared.sessions.find(s => s.id === sessionId)
      if (!session) {
        const sessions = await window.api.getSessions(shared.currentCampaign.id)
        sharedStore.setState({ sessions })
        session = sessions.find(s => s.id === sessionId)
      }
      if (!session) return
      get().selectSession(session)
    },

    // ── Session ───────────────────────────────────────────────────────────────

    currentSession: null,

    selectSession: (session) => {
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign) return
      // The soundboard widget is app-level, so opening a session raises it there.
      sharedStore.setState({ soundboardOpen: true, soundboardMinimized: false })
      // _goto does the rest of the hydration (maps, POIs, articles).
      get()._recordLocation({ type: 'session', sessionId: session.id })
    },

    // ── Maps ──────────────────────────────────────────────────────────────────

    maps: [],
    currentMap: null,

    loadMaps: async (sessionId) => {
      const maps = await window.api.getMaps(sessionId)
      // Without this the first tab would inherit whatever layers the previously
      // viewed map had showing.
      const view = maps[0]
        ? loadVisitView(sessionScope(sessionId), maps[0].id)
        : { ghostLayerIds: [], showBaseLayer: false }
      set({ maps, currentMap: maps[0] || null, ...view })
      if (maps[0]) get().loadPOIs(maps[0].id)
    },

    selectMap: (map) => {
      set({
        currentMap: map, pois: [], selectedPOI: null, poiPanelOpen: false,
        // Restore the layers this map was last left showing in this session.
        ...loadVisitView(sessionScope(get().currentSession?.id), map.id),
      })
      get().loadPOIs(map.id)
    },

    importMap: async (sessionId) => {
      const result = await window.api.importMapImage(sessionId)
      if (!result) return
      const map = await window.api.createMap({ session_id: sessionId, name: result.name, image_path: result.path })
      set(s => ({ maps: [...s.maps, map] }))
      get().selectMap(map)
      const { currentCampaign, loadSessions } = sharedStore.getState()
      if (currentCampaign) loadSessions(currentCampaign.id)
    },

    // A mapless scene: a tab with no image, just a rich-text page (image_path '').
    createScene: async (sessionId) => {
      const map = await window.api.createMap({ session_id: sessionId, name: 'New Scene', image_path: '' })
      set(s => ({ maps: [...s.maps, map] }))
      get().selectMap(map)
      const { currentCampaign, loadSessions } = sharedStore.getState()
      if (currentCampaign) loadSessions(currentCampaign.id)
    },

    updateMap: async (id, data) => {
      await window.api.updateMap(id, data)
      set(s => ({
        maps: s.maps.map(m => m.id === id ? { ...m, ...data } : m),
        currentMap: s.currentMap?.id === id ? { ...s.currentMap!, ...data } : s.currentMap,
      }))
    },

    reorderMaps: async (orders) => {
      // Optimistic: apply new sort_order locally and re-sort the tab array.
      set(s => ({
        maps: s.maps
          .map(m => {
            const o = orders.find(x => x.id === m.id)
            return o ? { ...m, sort_order: o.sort_order } : m
          })
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      await window.api.reorderMaps(orders)
    },

    reorderSessionTabs: async (orderedMaps) => {
      const { currentSession } = get()
      if (!currentSession) return
      // Optimistic: adopt the given order (with fresh unified indices) so tabs
      // don't jump back before the write lands.
      set({ maps: orderedMaps.map((m, i) => ({ ...m, sort_order: i })) })
      await window.api.reorderSessionTabs(
        currentSession.id,
        orderedMaps.map((m, i) => ({ map_id: m.id, attached: !!m.attached, sort_order: i })),
      )
    },

    moveMapToSession: async (mapId, sessionId) => {
      await window.api.updateMap(mapId, { session_id: sessionId })
      // Map (and its POIs) now belong to another session: drop it from the
      // current session's tabs and refresh map counts in the session list.
      const { currentSession } = get()
      if (currentSession) await get().loadMaps(currentSession.id)
      else set(s => ({ maps: s.maps.filter(m => m.id !== mapId) }))
      if (get().maps.length === 0) set({ currentMap: null, pois: [], selectedPOI: null, poiPanelOpen: false })
      const { currentCampaign, loadSessions } = sharedStore.getState()
      if (currentCampaign) loadSessions(currentCampaign.id)
    },

    deleteMap: async (id) => {
      await window.api.deleteMap(id)
      const { currentSession } = get()
      if (currentSession) await get().loadMaps(currentSession.id)
      if (get().maps.length === 0) set({ currentMap: null, pois: [], selectedPOI: null, poiPanelOpen: false })
      const { currentCampaign, loadSessions } = sharedStore.getState()
      if (currentCampaign) loadSessions(currentCampaign.id)
    },

    // ── Visit layers ──────────────────────────────────────────────────────────

    ghostLayerIds: [],
    showBaseLayer: false,

    // Both toggles persist the resulting view, so returning to this map tab —
    // or to this session tomorrow — finds the same layers showing.
    rememberVisitView: () => {
      const { currentMap, currentSession, ghostLayerIds, showBaseLayer } = get()
      if (!currentMap) return
      saveVisitView(sessionScope(currentSession?.id), currentMap.id, { ghostLayerIds, showBaseLayer })
    },

    toggleGhostLayer: (layerId) => {
      set(s => ({
        ghostLayerIds: s.ghostLayerIds.includes(layerId)
          ? s.ghostLayerIds.filter(id => id !== layerId)
          : [...s.ghostLayerIds, layerId],
      }))
      get().rememberVisitView()
    },

    toggleBaseLayer: () => {
      set(s => {
        const showing = !s.showBaseLayer
        // Hiding the base layer while one of its POIs is open would leave the
        // panel editing an invisible pin — deselect instead.
        const hidingSelected = !showing && s.selectedPOI?.layer_id == null && s.currentMap?.attached
        return {
          showBaseLayer: showing,
          ...(hidingSelected ? { selectedPOI: null, poiPanelOpen: false } : {}),
        }
      })
      get().rememberVisitView()
    },

    attachMapToSession: async (mapId, layerId) => {
      const { currentSession } = get()
      if (!currentSession) return
      const map = await window.api.attachMapToSession(currentSession.id, mapId, layerId)
      // Replace if re-attaching an already-attached map (layer switch), else append.
      set(s => ({
        maps: s.maps.some(m => m.id === map.id && m.attached)
          ? s.maps.map(m => (m.id === map.id && m.attached ? map : m))
          : [...s.maps, map],
      }))
      get().selectMap(map)
      const { currentCampaign, loadSessions } = sharedStore.getState()
      if (currentCampaign) loadSessions(currentCampaign.id)
    },

    detachMapFromSession: async (mapId) => {
      const { currentSession } = get()
      if (!currentSession) return
      await window.api.detachMapFromSession(currentSession.id, mapId)
      await get().loadMaps(currentSession.id)
      if (get().maps.length === 0) set({ currentMap: null, pois: [], selectedPOI: null, poiPanelOpen: false })
      const { currentCampaign, loadSessions } = sharedStore.getState()
      if (currentCampaign) loadSessions(currentCampaign.id)
    },

    // ── POIs ──────────────────────────────────────────────────────────────────

    pois: [],
    selectedPOI: null,
    poiPanelOpen: false,
    editMode: false,
    sessionReadMode: true,

    loadPOIs: async (mapId) => {
      const pois = await window.api.getPOIs(mapId)
      set({ pois })
    },

    selectPOI: (poi) => set({ selectedPOI: poi, poiPanelOpen: poi !== null }),

    createPOI: async (x, y) => {
      const { currentMap } = get()
      if (!currentMap) return
      // On an attached article map, new POIs belong to this session's visit
      // layer; on session-owned maps layer_id stays null.
      const layer_id = currentMap.attached ? currentMap.layer_id ?? null : null
      const poi = await window.api.createPOI({ map_id: currentMap.id, label: 'New Point of Interest', x, y, layer_id })
      set(s => ({ pois: [...s.pois, poi], selectedPOI: poi, poiPanelOpen: true }))
    },

    updatePOI: async (id, data) => {
      const updated = await window.api.updatePOI(id, data)
      set(s => ({
        pois: s.pois.map(p => p.id === id ? updated : p),
        selectedPOI: s.selectedPOI?.id === id ? updated : s.selectedPOI,
      }))
    },

    deletePOI: async (id) => {
      await window.api.deletePOI(id)
      set(s => ({ pois: s.pois.filter(p => p.id !== id), selectedPOI: null, poiPanelOpen: false }))
    },

    setEditMode: (editMode) => set({ editMode }),
    setSessionReadMode: (sessionReadMode) => set({ sessionReadMode }),

    // ── Wiki ──────────────────────────────────────────────────────────────────

    articles: [],
    currentArticle: null,
    wikiFilter: 'all',
    wikiSearch: '',
    wikiTagFilter: null,
    wikiShowTags: false,
    wikiSearchFields: { title: true, tags: true },

    loadArticles: async () => {
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign) { set({ articles: [] }); return }
      const articles = await window.api.getArticlesList(articleQuery(get(), currentCampaign.id))
      set({ articles })
    },

    openArticle: async (id) => {
      const article = await window.api.getArticle(id)
      if (!article) return
      // Set eagerly so the editor paints before _goto's own fetch settles.
      set({ currentArticle: article })
      get()._recordLocation({ type: 'article', articleId: id })
    },

    selectArticle: (article) => set({ currentArticle: article }),

    navigateToArticleByTitle: async (title) => {
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign) return
      const article = await window.api.getArticleByTitle(title, currentCampaign.id)
      if (!article) return
      set({ currentArticle: article, wikiFilter: 'all', wikiSearch: '' })
      get()._recordLocation({ type: 'article', articleId: article.id })
      if (get().articles.length === 0) await get().loadArticles()
    },

    createArticle: async (data) => {
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign) throw new Error('No campaign selected')
      const article = await window.api.createArticle({ campaign_id: currentCampaign.id, ...data })
      set({ wikiFilter: 'all', wikiSearch: '', currentArticle: article })
      const articles = await window.api.getArticlesList({ campaignId: currentCampaign.id })
      set({ articles })
      sharedStore.setState({ allArticles: articles })
      // Sibling panes keep their own filters; just refresh their lists.
      forEachPane(p => p.loadArticles(), store)
      return article
    },

    updateArticle: async (id, data) => {
      const updated = await window.api.updateArticle(id, data)
      const patch = (a: ArticleSummary) => a.id === id ? {
        ...a,
        title:          updated.title,
        article_type:   updated.article_type,
        tags:           updated.tags,
        cover_image:    updated.cover_image,
        tracks:         updated.tracks,
        loot_table:     updated.loot_table,
        loot_table_id:  updated.loot_table_id,
        updated_at:     updated.updated_at,
      } : a
      sharedStore.setState(s => ({ allArticles: s.allArticles.map(patch) }))
      get()._onArticleUpdated(id, updated)
      forEachPane(p => p._onArticleUpdated(id, updated), store)
    },

    deleteArticle: async (id) => {
      await window.api.deleteArticle(id)
      sharedStore.setState(s => ({ allArticles: s.allArticles.filter(a => a.id !== id) }))
      // The initiating pane clears currentArticle unconditionally, matching the
      // pre-split behaviour (delete is always issued from the open article).
      // Sibling panes only clear it if they were showing the deleted one.
      set(s => ({
        articles: s.articles.filter(a => a.id !== id),
        currentArticle: null,
      }))
      get()._dropTabsMatching(l => l.type === 'article' && l.articleId === id)
      forEachPane(p => p._onArticleDeleted(id), store)
    },

    setWikiFilter: async (wikiFilter) => {
      set({ wikiFilter })
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign) return
      const articles = await window.api.getArticlesList(articleQuery(get(), currentCampaign.id))
      if (get().wikiFilter === wikiFilter) set({ articles })
    },

    setWikiSearch: async (wikiSearch) => {
      set({ wikiSearch })
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign) return
      const articles = await window.api.getArticlesList(articleQuery(get(), currentCampaign.id))
      if (get().wikiSearch === wikiSearch) set({ articles })
    },

    setWikiTagFilter: async (wikiTagFilter) => {
      set({ wikiTagFilter })
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign) return
      const articles = await window.api.getArticlesList(articleQuery(get(), currentCampaign.id))
      if (get().wikiTagFilter === wikiTagFilter) set({ articles })
    },

    setWikiSearchFields: async (wikiSearchFields) => {
      set({ wikiSearchFields })
      const { currentCampaign } = sharedStore.getState()
      if (!currentCampaign || !get().wikiSearch) return
      const articles = await window.api.getArticlesList(articleQuery(get(), currentCampaign.id))
      set({ articles })
    },

    setWikiShowTags: (wikiShowTags) => set({ wikiShowTags }),

    // ── Deep-link hand-offs ───────────────────────────────────────────────────

    relationsOpenWebId: null,
    setRelationsOpenWebId: (relationsOpenWebId) => set({ relationsOpenWebId }),
    relationsFocusArticleId: null,
    setRelationsFocusArticleId: (relationsFocusArticleId) => set({ relationsFocusArticleId }),
    dmNotesOpenPageId: null,
    setDMNotesOpenPageId: (dmNotesOpenPageId) => set({ dmNotesOpenPageId }),
    wikiGraphFocusId: null,
    setWikiGraphFocusId: (wikiGraphFocusId) => set({ wikiGraphFocusId }),

    hintContext: null,
    setHintContext: (hintContext) => set({ hintContext }),
    hintMinimized: false,
    setHintMinimized: (hintMinimized) => set({ hintMinimized }),

    // ── Fan-out receivers ─────────────────────────────────────────────────────

    _enterCampaign: (campaign) => {
      // Each campaign keeps its own workspace; restore this pane's slice of it,
      // or start at the hub.
      const myId = paneIdOf(store)
      const saved = myId ? loadWorkspace(campaign.id)?.panes[myId] : null
      get()._initTabs(saved?.tabs ?? null, saved?.activeTabId ?? null, { type: 'campaign', subView: 'hub' })
    },

    /** Fill this pane with a tab set (restored, or a single seeded tab). */
    _initTabs: (restoredTabs, restoredActiveId, seed) => {
      const tabs = restoredTabs?.length ? restoredTabs : [makeTab(seed)]
      const active = tabs.find(t => t.id === restoredActiveId) ?? tabs[0]
      set({
        currentSession: null,
        maps: [], currentMap: null,
        pois: [], selectedPOI: null,
        articles: [], currentArticle: null,
        tabs, activeTabId: active.id,
        ...(active.viewState ?? { campaignSubView: 'hub' as const }),
      })
      void get()._goto(active.location)
    },

    _onCampaignDeleted: () => set({ view: 'campaigns', tabs: [], activeTabId: null }),

    _onSessionUpdated: (id, data) => set(s => ({
      currentSession: s.currentSession?.id === id ? { ...s.currentSession!, ...data } : s.currentSession,
    })),

    _patchCurrentSession: (id, data) => set(s => ({
      currentSession: s.currentSession?.id === id ? { ...s.currentSession!, ...data } : s.currentSession,
    })),

    _onSessionDeleted: (id) => {
      get()._dropTabsMatching(l => l.type === 'session' && l.sessionId === id)
      set(s => (s.currentSession?.id === id ? { currentSession: null } : {}))
    },

    _onSoundBoardDeleted: (id) => set(s => ({
      currentSession: s.currentSession?.soundboard_id === id
        ? { ...s.currentSession, soundboard_id: null }
        : s.currentSession,
    })),

    _onArticleUpdated: (id, updated) => set(s => ({
      articles: s.articles.map(a => a.id === id ? {
        ...a,
        title:          updated.title,
        article_type:   updated.article_type,
        tags:           updated.tags,
        cover_image:    updated.cover_image,
        tracks:         updated.tracks,
        loot_table:     updated.loot_table,
        loot_table_id:  updated.loot_table_id,
        updated_at:     updated.updated_at,
      } : a),
      // Tab titles are derived from allArticles at render time, so a rename
      // needs no tab bookkeeping at all.
      currentArticle: s.currentArticle?.id === id ? updated : s.currentArticle,
    })),

    _onArticleDeleted: (id) => {
      get()._dropTabsMatching(l => l.type === 'article' && l.articleId === id)
      set(s => ({
        articles: s.articles.filter(a => a.id !== id),
        currentArticle: s.currentArticle?.id === id ? null : s.currentArticle,
      }))
    },

    /**
     * Remove every tab pointed at a now-deleted row, and scrub it from the
     * surviving tabs' back/forward stacks so Back can't resurrect a ghost.
     */
    _dropTabsMatching: (pred) => {
      const s = get()
      if (!s.tabs.length) return
      const doomed = s.tabs.filter(t => pred(t.location))
      const kept = s.tabs
        .filter(t => !pred(t.location))
        .map(t => ({ ...t, back: t.back.filter(l => !pred(l)), forward: t.forward.filter(l => !pred(l)) }))
      if (!doomed.length && kept.every((t, i) => t.back === s.tabs[i]?.back)) return

      if (!kept.length) {
        const tab = makeTab({ type: 'campaign', subView: 'hub' })
        set({ tabs: [tab], activeTabId: tab.id })
        void get()._goto(tab.location)
      } else if (doomed.some(t => t.id === s.activeTabId)) {
        const index = s.tabs.findIndex(t => t.id === s.activeTabId)
        const neighbour = kept[Math.min(index, kept.length - 1)]
        set({ tabs: kept, activeTabId: null })
        void get().selectTab(neighbour.id)
      } else {
        set({ tabs: kept })
      }
      get()._persist()
    },
  }))

  return store
}
