// path: src/store/store.ts
import { create } from 'zustand'
import type { Campaign, Session, Arc, GameMap, POI, Article, ArticleSummary, ArticleType } from '../types'
import { STARTER_MONSTERS as MONSTERS_2014 } from '../data/starter_monsters_2014'
import { STARTER_MONSTERS as MONSTERS_2024 } from '../data/starter_monsters_2024'

function getStarterMonsters(system: string) {
  if (system === 'D&D 5e 2014') return MONSTERS_2014
  if (system === 'D&D 5e 2024') return MONSTERS_2024
  return []
}

type View = 'campaigns' | 'campaign' | 'session' | 'wiki' | 'dm-notes' | 'loot-tables'

// ── Navigation History ────────────────────────────────────────────────────────

export type HistoryEntry =
  | { type: 'campaign'; label: string; campaign: Campaign }
  | { type: 'session';  label: string; campaign: Campaign; session: Session }
  | { type: 'article';  label: string; campaign: Campaign; articleId: number }
  | { type: 'wiki';     label: string; campaign: Campaign }

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
  currentSession: Session | null
  loadSessions: (campaignId: number) => Promise<void>
  selectSession: (s: Session) => void
  createSession: (data: { name: string; session_number: number; session_sub?: string; arc_id?: number | null; date?: string }) => Promise<void>
  deleteSession: (id: number) => Promise<void>
  updateSession: (id: number, data: Partial<Session>) => Promise<void>

  arcs: Arc[]
  lastUsedArcId: Record<number, number>
  loadArcs: (campaignId: number) => Promise<void>
  createArc: (data: { name: string; color?: string }) => Promise<void>
  updateArc: (id: number, data: { name?: string; color?: string }) => Promise<void>
  deleteArc: (id: number) => Promise<void>
  setLastUsedArcId: (campaignId: number, arcId: number) => void

  // Map state
  maps: GameMap[]
  currentMap: GameMap | null
  loadMaps: (sessionId: number) => Promise<void>
  selectMap: (m: GameMap) => void
  importMap: (sessionId: number) => Promise<void>
  deleteMap: (id: number) => Promise<void>
  updateMap: (id: number, data: { name: string }) => Promise<void>

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
  getArticleBacklinks: (title: string) => Promise<ArticleSummary[]>
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
  view: 'campaigns',
  setView: (view) => set({ view }),
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

  _navigateToEntry: async (entry: HistoryEntry) => {
    switch (entry.type) {
      case 'campaign':
        set({
          currentCampaign: entry.campaign, view: 'campaign',
          campaignSubView: 'hub',
          sessions: [], currentSession: null,
          arcs: [],
          maps: [], currentMap: null,
          pois: [], selectedPOI: null,
          articles: [], currentArticle: null,
        })
        get().loadSessions(entry.campaign.id)
        get().loadArcs(entry.campaign.id)
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
        break

      case 'wiki':
        set({
          currentCampaign: entry.campaign,
          view: 'wiki', currentArticle: null,
          wikiFilter: 'all', wikiSearch: '',
        })
        get().loadArticles()
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
        break
      }
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
      sessions: [], currentSession: null,
      arcs: [],
      maps: [], currentMap: null,
      pois: [], selectedPOI: null,
      articles: [], currentArticle: null,
      navigationHistory: pushEntry(s.navigationHistory, {
        type: 'campaign', label: campaign.name, campaign,
      }),
    }))
    get().loadSessions(campaign.id)
    get().loadArcs(campaign.id)
  },

  createCampaign: async (data, seedMonsters = true) => {
    const campaign = await window.api.createCampaign({ ...data, cover_image: null })
    if (seedMonsters) {
      const starters = getStarterMonsters(data.system)
      if (starters.length > 0) {
        // Seed the default loot tables and build a name → id map
        const lootTables = await window.api.resetDefaultTables(campaign.id)
        const lootTableByName = Object.fromEntries(lootTables.map(t => [t.name, t.id]))

        await Promise.all(
          starters.map(m =>
            window.api.createArticle({
              campaign_id: campaign.id,
              title: m.title,
              article_type: 'creature',
              tags: m.tags,
              tracks: JSON.stringify(m.tracks),
              statblock: JSON.stringify(m.statblock),
              loot_table_id: lootTableByName[m.loot_table_name] ?? null,
              content: m.content,
            })
          )
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
  currentSession: null,

  loadSessions: async (campaignId) => {
    const sessions = await window.api.getSessions(campaignId)
    set({ sessions })
  },

  selectSession: (session) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return
    set(s => ({
      currentSession: session, view: 'session',
      maps: [], currentMap: null,
      pois: [], selectedPOI: null, poiPanelOpen: false,
      sessionReadMode: true,
      navigationHistory: pushEntry(s.navigationHistory, {
        type: 'session',
        label: `Session ${session.session_number}${session.session_sub ?? ''}: ${session.name}`,
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
      currentSession: s.currentSession?.id === id ? { ...s.currentSession!, ...data } : s.currentSession,
      navigationHistory: s.navigationHistory.map(e =>
        e.type === 'session' && e.session.id === id
          ? { ...e, session: { ...e.session, ...data }, label: `Session ${(data as any).session_number ?? e.session.session_number}${(data as any).session_sub ?? e.session.session_sub ?? ''}: ${(data as any).name ?? e.session.name}` }
          : e
      ),
    }))
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
    set({ currentMap: map, pois: [], selectedPOI: null, poiPanelOpen: false })
    get().loadPOIs(map.id)
  },

  importMap: async (sessionId) => {
    const result = await window.api.importMapImage(sessionId)
    if (!result) return
    const map = await window.api.createMap({ session_id: sessionId, name: result.name, image_path: result.path })
    set(s => ({ maps: [...s.maps, map] }))
    get().selectMap(map)
  },

  updateMap: async (id, data) => {
    await window.api.updateMap(id, data)
    set(s => ({
      maps: s.maps.map(m => m.id === id ? { ...m, ...data } : m),
      currentMap: s.currentMap?.id === id ? { ...s.currentMap!, ...data } : s.currentMap,
    }))
  },

  deleteMap: async (id) => {
    await window.api.deleteMap(id)
    const { currentSession } = get()
    if (currentSession) await get().loadMaps(currentSession.id)
    if (get().maps.length === 0) set({ currentMap: null, pois: [], selectedPOI: null, poiPanelOpen: false })
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
    const poi = await window.api.createPOI({ map_id: currentMap.id, label: 'New Point of Interest', x, y })
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
    set({ articles })
    return article
  },

  updateArticle: async (id, data) => {
    const updated = await window.api.updateArticle(id, data)
    set(s => ({
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
}))