// path: src/store/store.ts
import { create } from 'zustand'
import type { Campaign, Session, Arc, GameMap, POI, Article, ArticleSummary, ArticleType,
  Player, VisibilityGrant, VisibilityEntityType, Grantee, CreatePlayerInput } from '../types'
import { STARTER_MONSTERS as MONSTERS_2014 } from '../data/starter_monsters_2014'
import { STARTER_MONSTERS as MONSTERS_2024 } from '../data/starter_monsters_2024'
import { applyTheme, getStoredTheme, applyTextTheme, getStoredTextTheme } from '../constants/themes'
import type { ThemeKey, TextThemeKey } from '../constants/themes'

function getStarterMonsters(system: string) {
  if (system === 'D&D 5e 2014') return MONSTERS_2014
  if (system === 'D&D 5e 2024') return MONSTERS_2024
  return []
}

type View = 'campaigns' | 'campaign' | 'session' | 'wiki' | 'dm-notes' | 'loot-tables' | 'relations' | 'timeline' | 'soundboard'

export interface StatBlockOverlayEntry {
  id: string                    // dedup key: `${articleId}:${nameOverride ?? ''}`
  articleId: number
  statblockOverride?: string    // variant statblock JSON, if any
  nameOverride?: string         // variant name, if any
}


// ── Navigation History ────────────────────────────────────────────────────────

export type HistoryEntry =
  | { type: 'campaign'; label: string; campaign: Campaign }
  | { type: 'session';  label: string; campaign: Campaign; session: Session }
  | { type: 'article';  label: string; campaign: Campaign; articleId: number }
  | { type: 'wiki';     label: string; campaign: Campaign }
  // webId remembers the specific relation web the user was viewing (null = hub).
  | { type: 'relations'; label: string; campaign: Campaign; webId?: number | null }
  // pageId remembers the last DM notes page viewed, so returning reopens it.
  | { type: 'dm-notes'; label: string; campaign: Campaign; pageId?: number | null }
  | { type: 'loot-tables'; label: string; campaign: Campaign }
  | { type: 'timeline'; label: string; campaign: Campaign }
  | { type: 'soundboard'; label: string; campaign: Campaign }

interface AppStore {
  // Navigation
  view: View
  setView: (v: View) => void
  campaignSubView: 'hub' | 'sessions'
  setCampaignSubView: (v: 'hub' | 'sessions') => void
  navigationHistory: HistoryEntry[]
  navigateBack: () => Promise<void>
  navigateToSessionById: (sessionId: number) => Promise<void>
  navigateToHistoryEntry: (index: number) => Promise<void>
  _navigateToEntry: (entry: HistoryEntry) => Promise<void>
  // Update the most recent history entry (of a matching type) in place — lets a
  // page record its sub-location (open relation web, DM notes page) into Recent
  // without pushing a new entry per sub-navigation.
  patchLastHistoryEntry: (type: HistoryEntry['type'], patch: Record<string, unknown>) => void

  // Campaign state
  campaigns: Campaign[]
  currentCampaign: Campaign | null
  loadCampaigns: () => Promise<void>
  selectCampaign: (c: Campaign) => void
  createCampaign: (data: { name: string; description: string; system: string }, seedMonsters?: boolean) => Promise<void>
  updateCampaign: (id: number, data: Partial<Campaign>) => Promise<void>
  deleteCampaign: (id: number) => Promise<void>

  // Session state
  sessions: Session[]
  drafts: Session[]
  currentSession: Session | null
  loadSessions: (campaignId: number) => Promise<void>
  selectSession: (s: Session) => void
  createSession: (data: { name: string; session_number: number; session_sub?: string; arc_id?: number | null; date?: string; is_draft?: number }) => Promise<void>
  deleteSession: (id: number) => Promise<void>
  updateSession: (id: number, data: Partial<Session>) => Promise<void>
  patchSessionInMemory: (id: number, data: Partial<Session>) => void
  promoteSession: (id: number) => Promise<void>
  reorderDrafts: (orders: { id: number; sort_order: number }[]) => Promise<void>

  arcs: Arc[]
  lastUsedArcId: Record<number, number>
  loadArcs: (campaignId: number) => Promise<void>
  createArc: (data: { name: string; color?: string }) => Promise<void>
  updateArc: (id: number, data: { name?: string; color?: string }) => Promise<void>
  deleteArc: (id: number) => Promise<void>
  reorderArcs: (orders: { id: number; sort_order: number }[]) => Promise<void>
  setLastUsedArcId: (campaignId: number, arcId: number) => void

  // Map state
  maps: GameMap[]
  currentMap: GameMap | null
  loadMaps: (sessionId: number) => Promise<void>
  selectMap: (m: GameMap) => void
  importMap: (sessionId: number) => Promise<void>
  createScene: (sessionId: number) => Promise<void>
  deleteMap: (id: number) => Promise<void>
  updateMap: (id: number, data: { name?: string; content?: string }) => Promise<void>
  reorderMaps: (orders: { id: number; sort_order: number }[]) => Promise<void>
  // Persist the full session tab order (owned + attached maps interleaved).
  reorderSessionTabs: (orderedMaps: GameMap[]) => Promise<void>
  moveMapToSession: (mapId: number, sessionId: number) => Promise<void>
  // Visit layers: attach an article map to the current session (layerId null =
  // start a new visit), detach it again, and toggle ghosted extra layers.
  attachMapToSession: (mapId: number, layerId: number | null) => Promise<void>
  detachMapFromSession: (mapId: number) => Promise<void>
  ghostLayerIds: number[]
  toggleGhostLayer: (layerId: number) => void
  // On attached maps the place's base POIs start hidden — tonight's view stays
  // clean; the Layers control toggles them in.
  showBaseLayer: boolean
  toggleBaseLayer: () => void

  // POI state
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

  // Wiki state
  articles: ArticleSummary[]
  // Unfiltered list of every article in the current campaign, regardless of
  // wikiFilter. Used by editor features (wiki-link autocomplete, item hover
  // cards) that must be able to reference any article type.
  allArticles: ArticleSummary[]
  currentArticle: Article | null
  wikiFilter: ArticleType | 'all'
  wikiSearch: string
  wikiTagFilter: string | null
  wikiShowTags: boolean
  wikiSearchFields: { title: boolean; tags: boolean }
  loadArticles: () => Promise<void>
  loadAllArticles: () => Promise<void>
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
  relationsOpenWebId: number | null // Relations navigation — used to deep-link from article sidebar into a specific web
  setRelationsOpenWebId: (id: number | null) => void
  relationsFocusArticleId: number | null // Deep-link: select + center the node linked to this article when the web opens
  setRelationsFocusArticleId: (id: number | null) => void
  getArticleBacklinks: (title: string) => Promise<ArticleSummary[]>

  // Players & visibility (player-facing pages)
  players: Player[]
  grants: VisibilityGrant[]
  playersManagerOpen: boolean
  setPlayersManagerOpen: (v: boolean) => void
  loadPlayers: () => Promise<void>
  loadGrants: () => Promise<void>
  createPlayer: (data: Omit<CreatePlayerInput, 'campaign_id'>) => Promise<void>
  updatePlayer: (id: number, data: Partial<CreatePlayerInput>) => Promise<void>
  deletePlayer: (id: number) => Promise<void>
  setEntityAudience: (entityType: VisibilityEntityType, entityId: number, grantees: Grantee[]) => Promise<void>

  // Soundboard widget
  soundboardOpen: boolean
  setSoundboardOpen: (v: boolean) => void
  soundboardMinimized: boolean
  setSoundboardMinimized: (v: boolean) => void

  // Stat block overlays
  statBlockOverlays: StatBlockOverlayEntry[]
  openStatBlockOverlay: (articleId: number, overrides?: { statblock?: string; name?: string }) => void
  closeStatBlockOverlay: (id: string) => void

  // UI Preferences
  bgStyle: 'none' | 'parchment' | 'vignette' | 'stone' | 'wood'
  setBgStyle: (s: 'none' | 'parchment' | 'vignette' | 'stone' | 'wood') => void
  colorTheme: ThemeKey
  setColorTheme: (key: ThemeKey) => void
  textTheme: TextThemeKey
  setTextTheme: (key: TextThemeKey) => void

  // Feature hints — a floating widget shows the hint for the current context.
  showHints: boolean
  setShowHints: (v: boolean) => void
  dismissedHints: string[]
  dismissHint: (key: string) => void
  hintContext: string | null            // which hint the floating widget should show
  setHintContext: (key: string | null) => void
  hintMinimized: boolean
  setHintMinimized: (v: boolean) => void

  // Deep-link hand-off: global search asks DMNotesPage to open a specific page.
  dmNotesOpenPageId: number | null
  setDMNotesOpenPageId: (id: number | null) => void

  // Deep-link hand-off: global search (Ctrl+Enter) asks WikiPage to open the
  // graph view focused on a specific article. Cleared once consumed.
  wikiGraphFocusId: number | null
  setWikiGraphFocusId: (id: number | null) => void

  // Global search palette open state — lifted to the store so a visible
  // sidebar button can open the same palette that Ctrl+S toggles.
  searchOpen: boolean
  setSearchOpen: (v: boolean) => void
}

function pushEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const last = history[history.length - 1]
  if (last) {
    if (
      last.type === entry.type &&
      (entry.type !== 'article' || (last as any).articleId === (entry as any).articleId) &&
      (entry.type !== 'session' || (last as any).session.id === (entry as any).session.id)
    ) {
      return [...history.slice(0, -1), entry]
    }
  }
  return [...history.slice(-4), entry]
}

export const useStore = create<AppStore>((set, get) => ({
  soundboardOpen: false,
  setSoundboardOpen: (soundboardOpen) => set({ soundboardOpen }),
  soundboardMinimized: false,
  setSoundboardMinimized: (soundboardMinimized) => set({ soundboardMinimized }),

  statBlockOverlays: [],
  openStatBlockOverlay: (articleId, overrides) => {
    const id = `${articleId}:${overrides?.name ?? ''}`
    set(s => {
      // Already open — don't duplicate (same dedup logic as the old BrowserWindow)
      if (s.statBlockOverlays.some(o => o.id === id)) return s
      return { statBlockOverlays: [...s.statBlockOverlays, { id, articleId, statblockOverride: overrides?.statblock, nameOverride: overrides?.name }] }
    })
  },
  closeStatBlockOverlay: (id) => set(s => ({ statBlockOverlays: s.statBlockOverlays.filter(o => o.id !== id) })),

  bgStyle: (localStorage.getItem('bgStyle') as AppStore['bgStyle']) || 'none',
  setBgStyle: (bgStyle) => { localStorage.setItem('bgStyle', bgStyle); set({ bgStyle }) },
  colorTheme: getStoredTheme(),
  setColorTheme: (key) => {
    localStorage.setItem('dmforge:color-theme', key)
    applyTheme(key)
    // applyTheme resets the text vars to the theme's defaults — re-apply the
    // independent text-colour override on top so it survives a theme switch.
    applyTextTheme(get().textTheme)
    set({ colorTheme: key })
  },
  textTheme: getStoredTextTheme(),
  setTextTheme: (key) => {
    localStorage.setItem('dmforge:text-theme', key)
    applyTextTheme(key)
    set({ textTheme: key })
  },

  showHints: localStorage.getItem('dmforge:show-hints') !== 'false',
  setShowHints: (v) => {
    localStorage.setItem('dmforge:show-hints', String(v))
    // Re-enabling hints brings back any that were individually dismissed.
    if (v) { localStorage.removeItem('dmforge:dismissed-hints'); set({ showHints: v, dismissedHints: [] }) }
    else set({ showHints: v })
  },
  dismissedHints: (() => {
    try { return JSON.parse(localStorage.getItem('dmforge:dismissed-hints') ?? '[]') } catch { return [] }
  })(),
  dismissHint: (key) => set(s => {
    if (s.dismissedHints.includes(key)) return s
    const next = [...s.dismissedHints, key]
    localStorage.setItem('dmforge:dismissed-hints', JSON.stringify(next))
    return { dismissedHints: next }
  }),
  hintContext: null,
  setHintContext: (hintContext) => set({ hintContext }),
  hintMinimized: false,
  setHintMinimized: (hintMinimized) => set({ hintMinimized }),

  dmNotesOpenPageId: null,
  setDMNotesOpenPageId: (dmNotesOpenPageId) => set({ dmNotesOpenPageId }),

  wikiGraphFocusId: null,
  setWikiGraphFocusId: (wikiGraphFocusId) => set({ wikiGraphFocusId }),

  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  view: 'campaigns',
  setView: (view) => set(s => {
    // Track the campaign-context pages in nav history so they appear under
    // "Recent" and can be revisited. (campaign/session/article are tracked by
    // their own select/open actions.)
    const PAGE_LABELS: Partial<Record<View, string>> = {
      wiki: 'Wiki', relations: 'Relations', 'dm-notes': 'DM Notes',
      'loot-tables': 'Loot Tables', timeline: 'Timeline', soundboard: 'Soundboard',
    }
    const label = PAGE_LABELS[view]
    if (label && s.currentCampaign) {
      return {
        view,
        navigationHistory: pushEntry(s.navigationHistory, {
          type: view as any, label, campaign: s.currentCampaign,
        }),
      }
    }
    return { view }
  }),
  campaignSubView: 'hub',
  setCampaignSubView: (campaignSubView) => set({ campaignSubView }),
  navigationHistory: [],

  navigateBack: async () => {
    const { navigationHistory } = get()
    if (navigationHistory.length < 2) return
    const prev = navigationHistory[navigationHistory.length - 2]
    set({ navigationHistory: navigationHistory.slice(0, -1) })
    await get()._navigateToEntry(prev)
  },

  navigateToHistoryEntry: async (index: number) => {
    const { navigationHistory } = get()
    const entry = navigationHistory[index]
    if (!entry) return
    const without = navigationHistory.filter((_, i) => i !== index)
    set({ navigationHistory: [...without.slice(-4), entry] })
    await get()._navigateToEntry(entry)
  },

  patchLastHistoryEntry: (type, patch) => set(s => {
    const h = s.navigationHistory
    const last = h[h.length - 1]
    if (!last || last.type !== type) return {}
    // No-op if nothing actually changed, to avoid needless history churn.
    if (Object.entries(patch).every(([k, v]) => (last as any)[k] === v)) return {}
    return { navigationHistory: [...h.slice(0, -1), { ...last, ...patch } as HistoryEntry] }
  }),

  _navigateToEntry: async (entry: HistoryEntry) => {
    switch (entry.type) {
      case 'campaign':
        set({
          currentCampaign: entry.campaign, view: 'campaign',
          campaignSubView: 'hub',
          sessions: [], drafts: [], currentSession: null,
          arcs: [],
          maps: [], currentMap: null,
          pois: [], selectedPOI: null,
          articles: [], allArticles: [], currentArticle: null,
          players: [], grants: [],
        })
        get().loadSessions(entry.campaign.id)
        get().loadArcs(entry.campaign.id)
        get().loadAllArticles()
        get().loadPlayers()
        get().loadGrants()
        break

      case 'session':
        set({
          currentCampaign: entry.campaign,
          currentSession: entry.session, view: 'session',
          maps: [], currentMap: null,
          pois: [], selectedPOI: null, poiPanelOpen: false,
          sessionReadMode: true,
        })
        get().loadMaps(entry.session.id)
        get().loadArticles()
        get().loadAllArticles()
        break

      case 'wiki':
        set({
          currentCampaign: entry.campaign,
          view: 'wiki', currentArticle: null,
          wikiFilter: 'all', wikiSearch: '',
        })
        get().loadArticles()
        get().loadAllArticles()
        break

      case 'article': {
        const article = await window.api.getArticle(entry.articleId)
        if (!article) break
        set({
          currentCampaign: entry.campaign,
          currentArticle: article, view: 'wiki',
          wikiFilter: 'all', wikiSearch: '',
        })
        if (get().articles.length === 0) await get().loadArticles()
        get().loadAllArticles()
        break
      }

      case 'relations':
        // Restore the specific web the user was viewing (null = relations hub).
        set({
          currentCampaign: entry.campaign, view: 'relations',
          relationsOpenWebId: entry.webId ?? null, relationsFocusArticleId: null,
        })
        break

      case 'dm-notes':
        // Reopen the page the user last had open (null = page's own default).
        set({
          currentCampaign: entry.campaign, view: 'dm-notes',
          dmNotesOpenPageId: entry.pageId ?? null,
        })
        break

      case 'loot-tables':
      case 'timeline':
      case 'soundboard':
        // These pages load their own data on mount; just restore campaign + view.
        set({ currentCampaign: entry.campaign, view: entry.type })
        break
    }
  },

  navigateToSessionById: async (sessionId: number) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    let session = get().sessions.find(s => s.id === sessionId)
    if (!session) {
      const sessions = await window.api.getSessions(currentCampaign.id)
      set({ sessions })
      session = sessions.find(s => s.id === sessionId)
    }
    if (!session) return
    get().selectSession(session)
  },

  // ── Campaigns ───────────────────────────────────────────────────────────────

  campaigns: [],
  currentCampaign: null,

  loadCampaigns: async () => {
    const campaigns = await window.api.getCampaigns()
    set({ campaigns })
  },

  selectCampaign: (campaign) => {
    set(s => ({
      currentCampaign: campaign, view: 'campaign',
      campaignSubView: 'hub',
      sessions: [], drafts: [], currentSession: null,
      arcs: [],
      maps: [], currentMap: null,
      pois: [], selectedPOI: null,
      articles: [], allArticles: [], currentArticle: null,
      players: [], grants: [],
      navigationHistory: pushEntry(s.navigationHistory, {
        type: 'campaign', label: campaign.name, campaign,
      }),
    }))
    get().loadSessions(campaign.id)
    get().loadArcs(campaign.id)
    get().loadAllArticles()
    get().loadPlayers()
    get().loadGrants()
  },

  createCampaign: async (data, seedMonsters = true) => {
    const campaign = await window.api.createCampaign({ ...data, cover_image: null })
    if (seedMonsters) {
      const starters = getStarterMonsters(data.system)
      if (starters.length > 0) {
        // Seed the default loot tables and build a name → id map
        const lootTables = await window.api.resetDefaultTables(campaign.id)
        const lootTableByName = Object.fromEntries(lootTables.map(t => [t.name, t.id]))

        // Build a map of bundled creature portrait images keyed by lowercased-hyphenated title
        const creatureImages = await window.api.listCreatureImages()

        await Promise.all(
          starters.map(m => {
            const imageKey = m.title.toLowerCase().replace(/\s+/g, '-')
            const portrait_image = creatureImages[imageKey] ?? null

            // Build a merged, deduplicated tags array:
            //  • explicit tags from the data (comma-separated string)
            //  • tags derived from every plain-text track value (mirroring WikiPage's getTrackTags logic)
            const NON_TAG_TRACKS = new Set(['In_World_Date', 'Death_Date', 'Timeline_Milestones'])
            const explicitTags = m.tags
              ? m.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
              : []
            const trackTags = Object.entries(m.tracks)
              .filter(([k, v]) =>
                !NON_TAG_TRACKS.has(k) && !k.endsWith('_Date') &&
                v && !v.startsWith('{') && !v.startsWith('[')
              )
              .map(([, v]) => v.toLowerCase().replace(/\s+/g, '-'))
            const tags = JSON.stringify(Array.from(new Set([...explicitTags, ...trackTags])))

            return window.api.createArticle({
              campaign_id: campaign.id,
              title: m.title,
              article_type: 'creature',
              tags,
              tracks: JSON.stringify(m.tracks),
              // Store variants array as statblock JSON for creature articles
              statblock: JSON.stringify(m.variants.map((v, i) => ({
                id: `variant_${Date.now()}_${i}`,
                name: v.name,
                cr: v.cr,
                statblock: v.statblock,
                loot_table_id: lootTableByName[v.loot_table_name] ?? null,
                loot_table: JSON.stringify({ name: v.name, items: v.loot_items ?? [] }),
              }))),
              content: m.content,
              portrait_image,
            })
          })
        )
      }
    }
    await get().loadCampaigns()
  },

  updateCampaign: async (id, data) => {
    const updated = await window.api.updateCampaign(id, data)
    set(s => ({
      campaigns: s.campaigns.map(c => c.id === id ? updated : c),
      currentCampaign: s.currentCampaign?.id === id ? updated : s.currentCampaign,
    }))
  },

  deleteCampaign: async (id) => {
    await window.api.deleteCampaign(id)
    set(s => ({
      campaigns: s.campaigns.filter(c => c.id !== id),
      currentCampaign: null, view: 'campaigns',
      navigationHistory: s.navigationHistory.filter(e => e.campaign.id !== id),
    }))
  },

  // ── Sessions ────────────────────────────────────────────────────────────────

  sessions: [],
  drafts: [],
  currentSession: null,

  loadSessions: async (campaignId) => {
    const all = await window.api.getSessions(campaignId)
    // Drafts ("future sessions") are kept in a separate bucket so they stay out
    // of the sequenced list, the timeline, and the hub until promoted.
    set({
      sessions: all.filter(s => !s.is_draft),
      drafts: all.filter(s => s.is_draft),
    })
  },

  selectSession: (session) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    set(s => ({
      currentSession: session, view: 'session',
      maps: [], currentMap: null,
      pois: [], selectedPOI: null, poiPanelOpen: false,
      sessionReadMode: true,
      soundboardOpen: true,
      soundboardMinimized: false,
      navigationHistory: pushEntry(s.navigationHistory, {
        type: 'session',
        label: session.is_draft
          ? `Future Session: ${session.name}`
          : `Session ${session.session_number}${session.session_sub ?? ''}: ${session.name}`,
        campaign: currentCampaign,
        session,
      }),
    }))
    get().loadMaps(session.id)
    get().loadArticles()
  },

  createSession: async (data) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    await window.api.createSession({ campaign_id: currentCampaign.id, notes: '', ...data })
    await get().loadSessions(currentCampaign.id)
    await get().loadCampaigns()
  },

  updateSession: async (id, data) => {
    await window.api.updateSession(id, data)
    set(s => ({
      sessions: s.sessions.map(s2 => s2.id === id ? { ...s2, ...data } : s2),
      drafts: s.drafts.map(d => d.id === id ? { ...d, ...data } : d),
      currentSession: s.currentSession?.id === id ? { ...s.currentSession!, ...data } : s.currentSession,
      navigationHistory: s.navigationHistory.map(e =>
        e.type === 'session' && e.session.id === id
          ? { ...e, session: { ...e.session, ...data }, label: `Session ${(data as any).session_number ?? e.session.session_number}${(data as any).session_sub ?? e.session.session_sub ?? ''}: ${(data as any).name ?? e.session.name}` }
          : e
      ),
    }))
  },

  patchSessionInMemory: (id, data) => {
    set(s => ({
      sessions: s.sessions.map(s2 => s2.id === id ? { ...s2, ...data } : s2),
      drafts: s.drafts.map(d => d.id === id ? { ...d, ...data } : d),
      currentSession: s.currentSession?.id === id ? { ...s.currentSession!, ...data } : s.currentSession,
    }))
  },

  promoteSession: async (id) => {
    await window.api.promoteSession(id)
    const { currentCampaign } = get()
    if (currentCampaign) await get().loadSessions(currentCampaign.id)
    await get().loadCampaigns()
  },

  reorderDrafts: async (orders) => {
    // Optimistic: apply new sort_order locally and re-sort the prep list.
    set(s => ({
      drafts: s.drafts
        .map(d => {
          const o = orders.find(x => x.id === d.id)
          return o ? { ...d, sort_order: o.sort_order } : d
        })
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))
    await window.api.reorderDrafts(orders)
  },

  deleteSession: async (id) => {
    await window.api.deleteSession(id)
    const { currentCampaign, currentSession } = get()
    if (currentCampaign) await get().loadSessions(currentCampaign.id)
    if (currentSession?.id === id) set({ currentSession: null, view: 'campaign' })
    await get().loadCampaigns()
    set(s => ({ navigationHistory: s.navigationHistory.filter(e => !(e.type === 'session' && e.session.id === id)) }))
  },

  // ── Arcs ─────────────────────────────────────────────────────────────────────

  arcs: [],

  lastUsedArcId: (() => {
    try { return JSON.parse(localStorage.getItem('dmforge:last-arc-id') ?? '{}') } catch { return {} }
  })(),

  loadArcs: async (campaignId) => {
    const arcs = await window.api.getArcs(campaignId)
    set({ arcs })
  },

  createArc: async (data) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    await window.api.createArc({ campaign_id: currentCampaign.id, ...data })
    await get().loadArcs(currentCampaign.id)
  },

  updateArc: async (id, data) => {
    await window.api.updateArc(id, data)
    set(s => ({ arcs: s.arcs.map(a => a.id === id ? { ...a, ...data } : a) }))
  },

  reorderArcs: async (orders) => {
    // Optimistic: apply new sort_order locally, then persist.
    set(s => ({
      arcs: s.arcs.map(a => {
        const o = orders.find(x => x.id === a.id)
        return o ? { ...a, sort_order: o.sort_order } : a
      }),
    }))
    await window.api.reorderArcs(orders)
  },

  deleteArc: async (id) => {
    const result = await window.api.deleteArc(id)
    if (result.success) {
      const { currentCampaign } = get()
      if (currentCampaign) {
        await get().loadArcs(currentCampaign.id)
        await get().loadSessions(currentCampaign.id)
      }
    }
  },

  setLastUsedArcId: (campaignId, arcId) => {
    set(s => {
      const updated = { ...s.lastUsedArcId, [campaignId]: arcId }
      try { localStorage.setItem('dmforge:last-arc-id', JSON.stringify(updated)) } catch {}
      return { lastUsedArcId: updated }
    })
  },

  // ── Maps ────────────────────────────────────────────────────────────────────

  maps: [],
  currentMap: null,

  loadMaps: async (sessionId) => {
    const maps = await window.api.getMaps(sessionId)
    set({ maps, currentMap: maps[0] || null })
    if (maps[0]) get().loadPOIs(maps[0].id)
  },

  selectMap: (map) => {
    set({ currentMap: map, pois: [], selectedPOI: null, poiPanelOpen: false, ghostLayerIds: [], showBaseLayer: false })
    get().loadPOIs(map.id)
  },

  importMap: async (sessionId) => {
    const result = await window.api.importMapImage(sessionId)
    if (!result) return
    const map = await window.api.createMap({ session_id: sessionId, name: result.name, image_path: result.path })
    set(s => ({ maps: [...s.maps, map] }))
    get().selectMap(map)
    const { currentCampaign } = get()
    if (currentCampaign) get().loadSessions(currentCampaign.id)
  },

  // A mapless scene: a tab with no image, just a rich-text page (image_path '').
  createScene: async (sessionId) => {
    const map = await window.api.createMap({ session_id: sessionId, name: 'New Scene', image_path: '' })
    set(s => ({ maps: [...s.maps, map] }))
    get().selectMap(map)
    const { currentCampaign } = get()
    if (currentCampaign) get().loadSessions(currentCampaign.id)
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
    const { currentSession, currentCampaign } = get()
    if (currentSession) await get().loadMaps(currentSession.id)
    else set(s => ({ maps: s.maps.filter(m => m.id !== mapId) }))
    if (get().maps.length === 0) set({ currentMap: null, pois: [], selectedPOI: null, poiPanelOpen: false })
    if (currentCampaign) get().loadSessions(currentCampaign.id)
  },

  deleteMap: async (id) => {
    await window.api.deleteMap(id)
    const { currentSession, currentCampaign } = get()
    if (currentSession) await get().loadMaps(currentSession.id)
    if (get().maps.length === 0) set({ currentMap: null, pois: [], selectedPOI: null, poiPanelOpen: false })
    if (currentCampaign) get().loadSessions(currentCampaign.id)
  },

  // ── Visit layers ────────────────────────────────────────────────────────────

  ghostLayerIds: [],
  showBaseLayer: false,

  toggleGhostLayer: (layerId) => set(s => ({
    ghostLayerIds: s.ghostLayerIds.includes(layerId)
      ? s.ghostLayerIds.filter(id => id !== layerId)
      : [...s.ghostLayerIds, layerId],
  })),

  toggleBaseLayer: () => set(s => {
    const showing = !s.showBaseLayer
    // Hiding the base layer while one of its POIs is open would leave the
    // panel editing an invisible pin — deselect instead.
    const hidingSelected = !showing && s.selectedPOI?.layer_id == null && s.currentMap?.attached
    return {
      showBaseLayer: showing,
      ...(hidingSelected ? { selectedPOI: null, poiPanelOpen: false } : {}),
    }
  }),

  attachMapToSession: async (mapId, layerId) => {
    const { currentSession, currentCampaign } = get()
    if (!currentSession) return
    const map = await window.api.attachMapToSession(currentSession.id, mapId, layerId)
    // Replace if re-attaching an already-attached map (layer switch), else append.
    set(s => ({
      maps: s.maps.some(m => m.id === map.id && m.attached)
        ? s.maps.map(m => (m.id === map.id && m.attached ? map : m))
        : [...s.maps, map],
    }))
    get().selectMap(map)
    if (currentCampaign) get().loadSessions(currentCampaign.id)
  },

  detachMapFromSession: async (mapId) => {
    const { currentSession, currentCampaign } = get()
    if (!currentSession) return
    await window.api.detachMapFromSession(currentSession.id, mapId)
    await get().loadMaps(currentSession.id)
    if (get().maps.length === 0) set({ currentMap: null, pois: [], selectedPOI: null, poiPanelOpen: false })
    if (currentCampaign) get().loadSessions(currentCampaign.id)
  },

  // ── POIs ────────────────────────────────────────────────────────────────────

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

  // ── Wiki ────────────────────────────────────────────────────────────────────

  articles: [],
  allArticles: [],
  currentArticle: null,
  wikiFilter: 'all',
  wikiSearch: '',
  wikiTagFilter: null,
  wikiShowTags: false,
  wikiSearchFields: { title: true, tags: true },

  loadArticles: async () => {
    const { wikiFilter, wikiSearch, wikiTagFilter, wikiSearchFields, currentCampaign } = get()
    if (!currentCampaign) { set({ articles: [] }); return }
    const articles = await window.api.getArticlesList({
      campaignId: currentCampaign.id,
      type: wikiFilter === 'all' ? undefined : wikiFilter,
      search: wikiSearch || undefined,
      searchTitle: wikiSearchFields.title,
      searchTags: wikiSearchFields.tags,
      tag: wikiTagFilter || undefined,
    })
    set({ articles })
  },

  loadAllArticles: async () => {
    const { currentCampaign } = get()
    if (!currentCampaign) { set({ allArticles: [] }); return }
    const allArticles = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    set({ allArticles })
  },

  openArticle: async (id) => {
    const { currentCampaign } = get()
    const article = await window.api.getArticle(id)
    if (!article) return
    set(s => ({
      currentArticle: article,
      navigationHistory: currentCampaign ? pushEntry(s.navigationHistory, {
        type: 'article',
        label: article.title,
        campaign: currentCampaign,
        articleId: id,
      }) : s.navigationHistory,
    }))
  },

  selectArticle: (article) => set({ currentArticle: article }),

  navigateToArticleByTitle: async (title) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    const article = await window.api.getArticleByTitle(title, currentCampaign.id)
    if (!article) return
    set(s => ({
      currentArticle: article, view: 'wiki',
      wikiFilter: 'all', wikiSearch: '',
      navigationHistory: pushEntry(s.navigationHistory, {
        type: 'article',
        label: article.title,
        campaign: currentCampaign,
        articleId: article.id,
      }),
    }))
    if (get().articles.length === 0) await get().loadArticles()
  },

  createArticle: async (data) => {
    const { currentCampaign } = get()
    if (!currentCampaign) throw new Error('No campaign selected')
    const article = await window.api.createArticle({ campaign_id: currentCampaign.id, ...data })
    set({ wikiFilter: 'all', wikiSearch: '', currentArticle: article })
    const articles = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    set({ articles, allArticles: articles })
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
    set(s => ({
      articles: s.articles.map(patch),
      allArticles: s.allArticles.map(patch),
      currentArticle: s.currentArticle?.id === id ? updated : s.currentArticle,
      navigationHistory: s.navigationHistory.map(e =>
        e.type === 'article' && e.articleId === id
          ? { ...e, label: updated.title }
          : e
      ),
    }))
  },

  deleteArticle: async (id) => {
    await window.api.deleteArticle(id)
    set(s => ({
      articles: s.articles.filter(a => a.id !== id),
      allArticles: s.allArticles.filter(a => a.id !== id),
      currentArticle: null,
      navigationHistory: s.navigationHistory.filter(e => !(e.type === 'article' && e.articleId === id)),
    }))
  },

  getArticleBacklinks: async (title) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return []
    return window.api.getArticleBacklinks(title, currentCampaign.id)
  },

  setWikiFilter: async (wikiFilter) => {
    set({ wikiFilter })
    const { wikiSearch, wikiTagFilter, wikiSearchFields, currentCampaign } = get()
    if (!currentCampaign) return
    const articles = await window.api.getArticlesList({
      campaignId: currentCampaign.id,
      type: wikiFilter === 'all' ? undefined : wikiFilter,
      search: wikiSearch || undefined,
      searchTitle: wikiSearchFields.title,
      searchTags: wikiSearchFields.tags,
      tag: wikiTagFilter || undefined,
    })
    if (get().wikiFilter === wikiFilter) set({ articles })
  },

  setWikiSearch: async (wikiSearch) => {
    set({ wikiSearch })
    const { wikiFilter, wikiTagFilter, wikiSearchFields, currentCampaign } = get()
    if (!currentCampaign) return
    const articles = await window.api.getArticlesList({
      campaignId: currentCampaign.id,
      type: wikiFilter === 'all' ? undefined : wikiFilter,
      search: wikiSearch || undefined,
      searchTitle: wikiSearchFields.title,
      searchTags: wikiSearchFields.tags,
      tag: wikiTagFilter || undefined,
    })
    if (get().wikiSearch === wikiSearch) set({ articles })
  },

  setWikiTagFilter: async (wikiTagFilter) => {
    set({ wikiTagFilter })
    const { wikiFilter, wikiSearch, wikiSearchFields, currentCampaign } = get()
    if (!currentCampaign) return
    const articles = await window.api.getArticlesList({
      campaignId: currentCampaign.id,
      type: wikiFilter === 'all' ? undefined : wikiFilter,
      search: wikiSearch || undefined,
      searchTitle: wikiSearchFields.title,
      searchTags: wikiSearchFields.tags,
      tag: wikiTagFilter || undefined,
    })
    if (get().wikiTagFilter === wikiTagFilter) set({ articles })
  },

  setWikiSearchFields: async (wikiSearchFields) => {
    set({ wikiSearchFields })
    const { wikiFilter, wikiSearch, wikiTagFilter, currentCampaign } = get()
    if (!currentCampaign || !wikiSearch) return
    const articles = await window.api.getArticlesList({
      campaignId: currentCampaign.id,
      type: wikiFilter === 'all' ? undefined : wikiFilter,
      search: wikiSearch || undefined,
      searchTitle: wikiSearchFields.title,
      searchTags: wikiSearchFields.tags,
      tag: wikiTagFilter || undefined,
    })
    set({ articles })
  },

  setWikiShowTags: (wikiShowTags) => set({ wikiShowTags }),
  relationsOpenWebId: null,
  setRelationsOpenWebId: (relationsOpenWebId) => set({ relationsOpenWebId }),
  relationsFocusArticleId: null,
  setRelationsFocusArticleId: (relationsFocusArticleId) => set({ relationsFocusArticleId }),

  // ── Players & visibility ──────────────────────────────────────────────────────

  players: [],
  grants: [],
  playersManagerOpen: false,
  setPlayersManagerOpen: (playersManagerOpen) => set({ playersManagerOpen }),

  loadPlayers: async () => {
    const { currentCampaign } = get()
    if (!currentCampaign) { set({ players: [] }); return }
    const players = await window.api.getPlayers(currentCampaign.id)
    set({ players })
  },

  loadGrants: async () => {
    const { currentCampaign } = get()
    if (!currentCampaign) { set({ grants: [] }); return }
    const grants = await window.api.getVisibilityGrants(currentCampaign.id)
    set({ grants })
  },

  createPlayer: async (data) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    await window.api.createPlayer({ campaign_id: currentCampaign.id, ...data })
    await get().loadPlayers()
  },

  updatePlayer: async (id, data) => {
    await window.api.updatePlayer(id, data)
    await get().loadPlayers()
  },

  deletePlayer: async (id) => {
    await window.api.deletePlayer(id)
    // Deleting a player cascades their grants in the DB — refresh both caches.
    await get().loadPlayers()
    await get().loadGrants()
  },

  setEntityAudience: async (entityType, entityId, grantees) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    await window.api.setEntityAudience(currentCampaign.id, entityType, entityId, grantees)
    const grants = await window.api.getVisibilityGrants(currentCampaign.id)
    set({ grants })
  },
}))