// path: src/store/shared.ts
// Campaign-wide state: one copy for the whole app, regardless of how many panes
// are open. A pane is a *view* into a campaign, so everything that describes the
// campaign itself — its sessions, arcs, article index, players, sound boards —
// plus every global UI preference lives here.
//
// The dividing line with pane.ts: if two panes showing different things would
// still agree on a value, it belongs here.
import { createStore } from 'zustand/vanilla'
import type { Campaign, Session, Arc, ArticleSummary,
  Player, VisibilityGrant, VisibilityEntityType, Grantee, CreatePlayerInput, SoundBoard } from '../types'
import { STARTER_MONSTERS as MONSTERS_2014 } from '../data/starter_monsters_2014'
import { STARTER_MONSTERS as MONSTERS_2024 } from '../data/starter_monsters_2024'
import {
  applyAppearance, loadAppearance, saveAppearance, resolveSections, DEFAULT_APPEARANCE,
  hasCampaignAppearance, clearCampaignAppearance,
} from '../constants/themes'
import type { Appearance } from '../constants/themes'
import { applySectionAccents, type SectionView } from '../constants/sections'
import { forEachPane, setActivePaneId, ALL_PANE_IDS, type PaneId } from './paneRegistry'
import { sameLocation, type Location } from './location'
import { saveWorkspace, loadWorkspace, clampRatio, savePins, loadPins } from './workspacePersist'

const RECENT_ACCENTS_KEY = 'dmforge:recent-accents'

function getStarterMonsters(system: string) {
  if (system === 'D&D 5e 2014') return MONSTERS_2014
  if (system === 'D&D 5e 2024') return MONSTERS_2024
  return []
}

export interface StatBlockOverlayEntry {
  id: string                    // dedup key: `${articleId}:${nameOverride ?? ''}`
  articleId: number
  statblockOverride?: string    // variant statblock JSON, if any
  nameOverride?: string         // variant name, if any
}

export interface SharedSlice {
  // Campaigns
  campaigns: Campaign[]
  currentCampaign: Campaign | null
  loadCampaigns: () => Promise<void>
  selectCampaign: (c: Campaign) => void
  createCampaign: (data: { name: string; description: string; system: string }, seedMonsters?: boolean) => Promise<void>
  updateCampaign: (id: number, data: Partial<Campaign>) => Promise<void>
  deleteCampaign: (id: number) => Promise<void>

  // Sessions
  sessions: Session[]
  drafts: Session[]
  loadSessions: (campaignId: number) => Promise<void>
  createSession: (data: { name: string; session_number: number; session_sub?: string; arc_id?: number | null; date?: string; is_draft?: number }) => Promise<void>
  deleteSession: (id: number) => Promise<void>
  updateSession: (id: number, data: Partial<Session>) => Promise<void>
  patchSessionInMemory: (id: number, data: Partial<Session>) => void
  promoteSession: (id: number) => Promise<void>
  reorderDrafts: (orders: { id: number; sort_order: number }[]) => Promise<void>

  // Arcs
  arcs: Arc[]
  lastUsedArcId: Record<number, number>
  loadArcs: (campaignId: number) => Promise<void>
  createArc: (data: { name: string; color?: string }) => Promise<void>
  updateArc: (id: number, data: { name?: string; color?: string }) => Promise<void>
  deleteArc: (id: number) => Promise<void>
  reorderArcs: (orders: { id: number; sort_order: number }[]) => Promise<void>
  setLastUsedArcId: (campaignId: number, arcId: number) => void

  // The unfiltered article index. The *filtered* list is view state and lives on
  // the pane; this one backs wiki-link autocomplete and item hover cards, which
  // must be able to reference any article regardless of a pane's filter.
  allArticles: ArticleSummary[]
  loadAllArticles: () => Promise<void>
  getArticleBacklinks: (title: string) => Promise<ArticleSummary[]>

  // Players & visibility
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

  // Soundboard — the widget persists across the campaign, not per pane.
  soundboardOpen: boolean
  setSoundboardOpen: (v: boolean) => void
  soundboardMinimized: boolean
  setSoundboardMinimized: (v: boolean) => void
  soundBoards: SoundBoard[]
  soundsVersion: number
  bumpSoundsVersion: () => void
  loadSoundBoards: (campaignId: number) => Promise<void>
  createSoundBoard: (name: string) => Promise<SoundBoard | null>
  updateSoundBoard: (id: number, data: Partial<SoundBoard>) => Promise<void>
  deleteSoundBoard: (id: number) => Promise<void>

  // Stat block overlays float above everything, so they are app-level.
  statBlockOverlays: StatBlockOverlayEntry[]
  openStatBlockOverlay: (articleId: number, overrides?: { statblock?: string; name?: string }) => void
  closeStatBlockOverlay: (id: string) => void

  // UI preferences
  bgStyle: 'none' | 'parchment' | 'vignette' | 'stone' | 'wood'
  setBgStyle: (s: 'none' | 'parchment' | 'vignette' | 'stone' | 'wood') => void

  /** Base surface family, accent colour, text palette, tint and section overrides. */
  appearance: Appearance
  setAppearance: (patch: Partial<Appearance>) => void
  setSectionColor: (view: SectionView, hex: string | null) => void
  resetSectionColors: () => void
  /** Back to gold-on-parchment: appearance and backdrop texture, not hints. */
  resetAppearance: () => void
  /** Bumped on every appearance change so colour reads taken during render refresh. */
  themeVersion: number
  /** Accents you've moved away from, most recent first, for quick undo-by-eye. */
  recentAccents: string[]
  /** Whether the current look belongs to this campaign or to the app. */
  appearanceScope: 'global' | 'campaign'
  setAppearanceScope: (scope: 'global' | 'campaign') => void

  /** Which tab the Settings dialog is showing, or null when it's closed. */
  settingsTab: 'appearance' | 'data' | 'help' | null
  setSettingsTab: (tab: 'appearance' | 'data' | 'help' | null) => void
  showHints: boolean
  setShowHints: (v: boolean) => void
  dismissedHints: string[]
  dismissHint: (key: string) => void

  searchOpen: boolean
  setSearchOpen: (v: boolean) => void

  // The sidebar's pinned list: places you chose to keep, in the order you
  // pinned them. Distinct from per-tab back/forward (that is navigation) and
  // from what a "recent" trail used to do here — this one is curated, so it is
  // persisted per campaign rather than rebuilt from wherever you have been.
  // Unbounded on purpose: a favourites list you have to prune isn't one.
  pinnedLocations: Location[]
  isPinned: (loc: Location) => boolean
  togglePin: (loc: Location) => void

  // Display names for locations whose label lives outside the campaign caches —
  // a relation web, a DM notes page. Without these, two relation tabs both read
  // "Relations" and are indistinguishable.
  //
  // Filled authoritatively on campaign select, then kept current by the pages
  // themselves: they already hold these lists, so they publish on change rather
  // than every mutation site having to remember to invalidate a cache.
  locationNames: { relations: Record<number, string>; 'dm-notes': Record<number, string> }
  publishLocationNames: (kind: 'relations' | 'dm-notes', entries: Record<number, string>) => void
  loadLocationNames: (campaignId: number) => Promise<void>

  // Pane layout. The pane *stores* live in the registry (they aren't
  // serialisable); this is just which panes exist, which has focus, and where
  // the splitter sits. Capped at two by the UI, though nothing here assumes it.
  paneIds: PaneId[]
  activePaneId: PaneId
  splitRatio: number
  /** Open a second pane. With no `seed` it starts at the campaign hub. */
  splitPane: (seed?: Location) => void
  closePane: (id: PaneId) => void
  focusPane: (id: PaneId) => void
  setSplitRatio: (n: number) => void
  /** Seed location for a pane that is about to mount, consumed once. */
  paneSeed: Partial<Record<PaneId, Location>>
  consumePaneSeed: (id: PaneId) => Location | null
  persistWorkspace: () => void
}

export const sharedStore = createStore<SharedSlice>()((set, get) => ({

  // ── Campaigns ───────────────────────────────────────────────────────────────

  campaigns: [],
  currentCampaign: null,

  loadCampaigns: async () => {
    const campaigns = await window.api.getCampaigns()
    set({ campaigns })
  },

  selectCampaign: (campaign) => {
    // Each campaign remembers its own pane layout, not just its tabs.
    const saved = loadWorkspace(campaign.id)
    const paneIds = saved?.paneIds ?? ['p0']
    const activePaneId = saved?.activePaneId ?? 'p0'
    setActivePaneId(activePaneId)
    // A campaign with its own look puts it on now; one without takes the
    // app-wide look, so leaving a themed campaign doesn't strand you in it.
    const ownLook = hasCampaignAppearance(campaign.id)
    const appearance = loadAppearance(campaign.id)
    applyAppearance(appearance)
    applySectionAccents(resolveSections(appearance))
    set(s => ({
      appearance,
      appearanceScope: ownLook ? 'campaign' : 'global',
      themeVersion: s.themeVersion + 1,
    }))
    set({
      currentCampaign: campaign,
      sessions: [], drafts: [],
      arcs: [],
      allArticles: [],
      players: [], grants: [], soundBoards: [],
      // Each campaign keeps its own pinned list, like its tabs.
      pinnedLocations: loadPins(campaign.id),
      locationNames: { relations: {}, 'dm-notes': {} },
      paneIds, activePaneId,
      splitRatio: saved?.splitRatio ?? 0.5,
    })
    // Live panes restore their own tabs; a second pane restored from disk
    // initialises itself when its provider mounts.
    forEachPane(p => p._enterCampaign(campaign))
    get().loadSessions(campaign.id)
    get().loadArcs(campaign.id)
    get().loadAllArticles()
    get().loadPlayers()
    get().loadGrants()
    get().loadSoundBoards(campaign.id)
    get().loadLocationNames(campaign.id)
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
      currentCampaign: null,
    }))
    forEachPane(p => p._onCampaignDeleted(id))
  },

  // ── Sessions ────────────────────────────────────────────────────────────────

  sessions: [],
  drafts: [],

  loadSessions: async (campaignId) => {
    const all = await window.api.getSessions(campaignId)
    // Drafts ("future sessions") are kept in a separate bucket so they stay out
    // of the sequenced list, the timeline, and the hub until promoted.
    set({
      sessions: all.filter(s => !s.is_draft),
      drafts: all.filter(s => s.is_draft),
    })
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
    }))
    forEachPane(p => p._onSessionUpdated(id, data))
  },

  patchSessionInMemory: (id, data) => {
    set(s => ({
      sessions: s.sessions.map(s2 => s2.id === id ? { ...s2, ...data } : s2),
      drafts: s.drafts.map(d => d.id === id ? { ...d, ...data } : d),
    }))
    forEachPane(p => p._patchCurrentSession(id, data))
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
    const { currentCampaign } = get()
    if (currentCampaign) await get().loadSessions(currentCampaign.id)
    forEachPane(p => p._onSessionDeleted(id))
    await get().loadCampaigns()
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

  // ── Article index ───────────────────────────────────────────────────────────

  allArticles: [],

  loadAllArticles: async () => {
    const { currentCampaign } = get()
    if (!currentCampaign) { set({ allArticles: [] }); return }
    const allArticles = await window.api.getArticlesList({ campaignId: currentCampaign.id })
    set({ allArticles })
  },

  getArticleBacklinks: async (title) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return []
    return window.api.getArticleBacklinks(title, currentCampaign.id)
  },

  // ── Players & visibility ────────────────────────────────────────────────────

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

  // ── Soundboard ──────────────────────────────────────────────────────────────

  soundboardOpen: false,
  setSoundboardOpen: (soundboardOpen) => set({ soundboardOpen }),
  soundboardMinimized: false,
  setSoundboardMinimized: (soundboardMinimized) => set({ soundboardMinimized }),

  soundBoards: [],
  soundsVersion: 0,
  bumpSoundsVersion: () => set(s => ({ soundsVersion: s.soundsVersion + 1 })),

  loadSoundBoards: async (campaignId) => {
    set({ soundBoards: await window.api.getSoundBoards(campaignId) })
  },

  createSoundBoard: async (name) => {
    const { currentCampaign } = get()
    if (!currentCampaign) return null
    const board = await window.api.createSoundBoard({ campaign_id: currentCampaign.id, name })
    set(s => ({ soundBoards: [...s.soundBoards, board] }))
    return board
  },

  updateSoundBoard: async (id, data) => {
    const updated = await window.api.updateSoundBoard(id, data)
    set(s => ({ soundBoards: s.soundBoards.map(b => b.id === id ? { ...b, ...updated } : b) }))
  },

  deleteSoundBoard: async (id) => {
    await window.api.deleteSoundBoard(id)
    set(s => ({
      soundBoards: s.soundBoards.filter(b => b.id !== id),
      // The board is gone; any session pointing at it falls back to the library.
      sessions: s.sessions.map(x => x.soundboard_id === id ? { ...x, soundboard_id: null } : x),
      drafts:   s.drafts.map(x   => x.soundboard_id === id ? { ...x, soundboard_id: null } : x),
    }))
    forEachPane(p => p._onSoundBoardDeleted(id))
  },

  // ── Stat block overlays ─────────────────────────────────────────────────────

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

  // ── UI preferences ──────────────────────────────────────────────────────────

  bgStyle: (localStorage.getItem('bgStyle') as SharedSlice['bgStyle']) || 'none',
  setBgStyle: (bgStyle) => { localStorage.setItem('bgStyle', bgStyle); set({ bgStyle }) },

  appearance: loadAppearance(),
  themeVersion: 0,
  recentAccents: (() => {
    try { return JSON.parse(localStorage.getItem(RECENT_ACCENTS_KEY) ?? '[]') } catch { return [] }
  })(),

  // One path for every appearance change: persist, write the CSS vars, refresh
  // the live section-accent record, then bump `themeVersion`. The bump is what
  // re-renders the tree — section colours are read as plain hex during render
  // (they get concatenated into rgba suffixes and canvas fills), so CSS vars
  // alone would leave those sites showing the old colour until something else
  // re-rendered them.
  setAppearance: (patch) => {
    const prev = get().appearance
    const next = { ...prev, ...patch }
    // Edits land wherever the current look lives: on the campaign when it has
    // its own, otherwise on the app-wide one.
    saveAppearance(next, get().appearanceScope === 'campaign' ? get().currentCampaign?.id : null)
    applyAppearance(next)
    applySectionAccents(resolveSections(next))
    // Trying colours is a back-and-forth, so the ones you passed through stay
    // one click away instead of having to be found in the wheel again.
    let recentAccents = get().recentAccents
    if (next.accent !== prev.accent) {
      recentAccents = [prev.accent, ...recentAccents.filter(c => c !== prev.accent && c !== next.accent)].slice(0, 6)
      localStorage.setItem(RECENT_ACCENTS_KEY, JSON.stringify(recentAccents))
    }
    set(s => ({ appearance: next, recentAccents, themeVersion: s.themeVersion + 1 }))
  },

  setSectionColor: (view, hex) => {
    const sections = { ...get().appearance.sections }
    if (hex) sections[view] = hex
    else delete sections[view]
    get().setAppearance({ sections })
  },

  resetSectionColors: () => get().setAppearance({ sections: {} }),

  appearanceScope: 'global',

  // Turning it on forks the current look onto the campaign; turning it off drops
  // the fork and falls back to the app-wide look, which is what "delete this
  // campaign's look" should mean.
  setAppearanceScope: (scope) => {
    const campaign = get().currentCampaign
    if (!campaign) return
    if (scope === 'campaign') {
      saveAppearance(get().appearance, campaign.id)
      set({ appearanceScope: 'campaign' })
      return
    }
    clearCampaignAppearance(campaign.id)
    const global = loadAppearance()
    applyAppearance(global)
    applySectionAccents(resolveSections(global))
    set(s => ({ appearance: global, appearanceScope: 'global', themeVersion: s.themeVersion + 1 }))
  },

  settingsTab: null,
  setSettingsTab: (settingsTab) => set({ settingsTab }),

  // Back to the app's original look — gold on parchment, no tint, stock section
  // colours, no backdrop texture. Covers everything the Appearance tab owns
  // except hints, which is a help preference rather than an appearance one.
  resetAppearance: () => {
    const next = { ...DEFAULT_APPEARANCE }
    saveAppearance(next, get().appearanceScope === 'campaign' ? get().currentCampaign?.id : null)
    applyAppearance(next)
    applySectionAccents(resolveSections(next))
    localStorage.setItem('bgStyle', 'none')
    set(s => ({ appearance: next, bgStyle: 'none', themeVersion: s.themeVersion + 1 }))
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

  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  locationNames: { relations: {}, 'dm-notes': {} },

  publishLocationNames: (kind, entries) => set(s => {
    const current = s.locationNames[kind]
    // Skip the write when nothing actually changed — these publish from render
    // effects, and churning the store would re-render every tab strip.
    const keys = Object.keys(entries)
    if (keys.length === Object.keys(current).length && keys.every(k => current[+k] === entries[+k])) return s
    return { locationNames: { ...s.locationNames, [kind]: entries } }
  }),

  loadLocationNames: async (campaignId) => {
    const [webs, pages] = await Promise.all([
      window.api.getRelationWebs(campaignId).catch(() => []),
      window.api.getDMNotesPages(campaignId).catch(() => []),
    ])
    set({
      locationNames: {
        relations: Object.fromEntries((webs as { id: number; name: string }[]).map(w => [w.id, w.name])),
        'dm-notes': Object.fromEntries((pages as { id: number; title: string }[]).map(p => [p.id, p.title])),
      },
    })
  },

  // ── Panes ───────────────────────────────────────────────────────────────────

  paneIds: ['p0'],
  activePaneId: 'p0',
  splitRatio: 0.5,
  paneSeed: {},

  splitPane: (seed) => {
    const s = get()
    if (s.paneIds.length > 1) return                       // capped at two
    const next = ALL_PANE_IDS.find(id => !s.paneIds.includes(id))
    if (!next) return
    setActivePaneId(next)
    set({
      paneIds: [...s.paneIds, next],
      activePaneId: next,
      // With no explicit target, a pane opening from empty starts at the
      // campaign hub — a launchpad. Duplicating whatever you were already
      // looking at just gives you the same page twice. An explicit seed (Stage
      // 4's "open in other pane") still wins.
      ...(seed ? { paneSeed: { ...s.paneSeed, [next]: seed } } : {}),
    })
    // The new pane's store persists itself once it mounts and seeds.
  },

  closePane: (id) => {
    const s = get()
    if (s.paneIds.length < 2) return                       // never close the last pane
    const remaining = s.paneIds.filter(p => p !== id)
    const nextActive = remaining[0]
    setActivePaneId(nextActive)
    set({ paneIds: remaining, activePaneId: nextActive })
    get().persistWorkspace()
  },

  focusPane: (id) => {
    if (get().activePaneId === id) return
    setActivePaneId(id)
    set({ activePaneId: id })
  },

  setSplitRatio: (n) => set({ splitRatio: clampRatio(n) }),

  consumePaneSeed: (id) => {
    const seed = get().paneSeed[id] ?? null
    if (seed) set(s => {
      const next = { ...s.paneSeed }
      delete next[id]
      return { paneSeed: next }
    })
    return seed
  },

  persistWorkspace: () => {
    const { currentCampaign, paneIds, activePaneId, splitRatio } = get()
    saveWorkspace(currentCampaign?.id, { paneIds, activePaneId, splitRatio })
  },

  pinnedLocations: [],

  isPinned: (loc) => get().pinnedLocations.some(l => sameLocation(l, loc)),

  togglePin: (loc) => {
    const { pinnedLocations, currentCampaign } = get()
    const next = pinnedLocations.some(l => sameLocation(l, loc))
      ? pinnedLocations.filter(l => !sameLocation(l, loc))
      // Appended, not prepended: the list is curated, so its order should be the
      // order you built it in and not shuffle under you on every pin.
      : [...pinnedLocations, loc]
    set({ pinnedLocations: next })
    savePins(currentCampaign?.id, next)
  },
}))
