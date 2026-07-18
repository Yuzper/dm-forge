// path: src/types/index.ts

export interface Campaign {
  id: number
  name: string
  description: string
  system: string
  cover_image: string | null
  created_at: string
  updated_at: string
  session_count?: number
  timeline_base_year?: number
  timeline_eras?: string | null
  timeline_show_lifespans?: number
  timeline_calendar?: string | null
}

export interface Session {
  id: number
  campaign_id: number
  name: string
  session_number: number
  session_sub: string
  arc_id: number | null
  date: string | null
  notes: string
  created_at: string
  map_count?: number       // image maps only
  scene_count?: number     // mapless text scenes
  in_world_day?: number | null
  in_world_day_end?: number | null
  is_draft?: number
  sort_order?: number
  soundboard_id?: number | null
}

export interface GameMap {
  id: number
  campaign_id: number | null  // null when owned by a session or article
  session_id: number | null   // null when owned by an article
  article_id: number | null   // null when owned by a session
  name: string
  image_path: string          // '' for a mapless scene (a plain rich-text page)
  content?: string            // scene body (TipTap JSON); unused for image maps
  sort_order: number
  created_at: string
  poi_count?: number
}

export interface POI {
  id: number
  map_id: number
  hub_links: string   // JSON: HubLink[]
  hub_size: number    // marker diameter in px on the hub map
  hub_opacity: number // marker opacity 0–1 on the hub map
  label: string
  x: number
  y: number
  content: string
  poi_type: POIType
  color: string
  loot_table: string
  loot_table_id: number | null
  created_at: string
}

export type POIType =
  | 'location' | 'character' | 'puzzle' | 'event'
  | 'item' | 'trap' | 'quest' | 'note' | 'combat'

export interface Arc {
  id: number
  campaign_id: number
  name: string
  color: string
  is_default: boolean
  sort_order: number
  created_at: string
}

export interface CreateArcInput {
  campaign_id: number
  name: string
  color?: string
}

export interface ArticleSummary {
  id: number
  campaign_id: number
  title: string
  article_type: ArticleType
  tags: string
  cover_image: string | null
  tracks: string
  loot_table: string
  loot_table_id: number | null
  created_at: string
  updated_at: string
}

export interface Article extends ArticleSummary {
  content: string
  portrait_image: string | null
  statblock: string
  item_block: string
  substeps: string
  rewards: string
}

export type ArticleType =
  | 'character' | 'playerCharacter' | 'location' | 'faction'
  | 'organization' | 'culture' | 'religion' | 'item' | 'artifact'
  | 'quest' | 'event' | 'lore' | 'creature' | 'note' | 'other'

export interface GlobalSearchResults {
  articles: { id: number; title: string; article_type: string; snippet: string | null }[]
  sessions: { id: number; name: string; session_number: number; session_sub: string; is_draft: boolean; snippet: string | null }[]
  notes:    { id: number; title: string; snippet: string | null }[]
  pois:     { id: number; label: string; snippet: string | null; session_id: number | null; article_id: number | null; on_hub_map: boolean; context: string }[]
}

export interface WikiHealth {
  stubs:   { id: number; title: string; article_type: string; textLen: number }[]
  orphans: { id: number; title: string; article_type: string }[]
  broken:  { title: string; sources: { id: number; title: string }[] }[]
}

// Progress clock (Blades in the Dark style): a segmented dial tracking an
// off-screen threat or plan. Optionally attached to an article; unattached
// clocks are campaign-level fronts.
export interface Clock {
  id: number
  campaign_id: number
  article_id: number | null
  name: string
  segments: number
  filled: number
  status: 'active' | 'completed' | 'paused'
  created_at: string
  updated_at: string
  // Joined for display (clocks:get-all only)
  article_title?: string | null
  article_type?: string | null
}

// Whole-campaign wiki link graph (articles + [[link]]/track references).
export interface LinkGraph {
  nodes: { id: number; title: string; article_type: string; updated_at: string }[]
  edges: { from: number; to: number }[]
  ghosts: { title: string; sources: number[] }[]   // broken [[links]] → nonexistent titles
  mentions: { from: number; to: number }[]          // plain-text (unlinked) title occurrences
}

export type LootTableCategory = 'creature' | 'vendor' | 'location' | 'custom'

export interface MasterLootTable {
  id: number
  campaign_id: number
  name: string
  description: string
  category: LootTableCategory
  items: string          // JSON: LootItem[]
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface StatBlockEntry {
  name: string
  desc: string
}

export interface StatBlock {
  ac: number
  acNote: string
  hp: number
  hpDice: { count: number; die: number; bonus: number }
  speed: string
  // Player-character only — used by the encounter balancer to size the party.
  // Optional so existing creature/NPC stat blocks are unaffected.
  // `level` is the derived total (sum of classLevels); kept in sync for display.
  level?: number
  classes?: string
  classLevels?: { cls: string; level: number }[]
  // Named-NPC CR (single stat block). XP is derived from this, never stored.
  cr?: string
  str: number; dex: number; con: number
  int: number; wis: number; cha: number
  savingThrows: string
  skills: string
  senses: string
  languages: string
  damageImmunities: string
  damageResistances: string
  conditionImmunities: string
  traits: StatBlockEntry[]
  actions: StatBlockEntry[]
  bonusActions: StatBlockEntry[]
  reactions: StatBlockEntry[]
  legendaryActions: StatBlockEntry[]
  cantrips: string[]
  preparedSpells: string[]
}

export const DEFAULT_STATBLOCK: StatBlock = {
  ac: 10, acNote: '', hp: 4,
  hpDice: { count: 1, die: 8, bonus: 0 },
  speed: '30 ft.',
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  savingThrows: '', skills: '', senses: '', languages: '',
  damageImmunities: '', damageResistances: '', conditionImmunities: '',
  traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [],
  cantrips: [], preparedSpells: [],
}

export function calcHpAverage(hpDice: StatBlock['hpDice']): number {
  return Math.max(1, Math.floor(hpDice.count * (hpDice.die + 1) / 2) + hpDice.bonus)
}

export function rollHp(hpDice: StatBlock['hpDice']): number {
  let total = hpDice.bonus
  for (let i = 0; i < hpDice.count; i++) {
    total += Math.floor(Math.random() * hpDice.die) + 1
  }
  return Math.max(1, total)
}

export function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export function parseStatBlock(json: string): StatBlock {
  try {
    const parsed = JSON.parse(json)
    return { ...DEFAULT_STATBLOCK, ...parsed }
  } catch {
    return { ...DEFAULT_STATBLOCK }
  }
}

// ── Item stat block (magic-item "Wondrous item, uncommon" style) ───────────────

export const ITEM_CATEGORIES = [
  'Wondrous item', 'Armor', 'Weapon', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand',
] as const

export const ITEM_RARITIES = [
  'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies',
] as const

export interface ItemStatBlock {
  category: string        // "Wondrous item", "Weapon (any sword)"…
  rarity: string          // one of ITEM_RARITIES (or free text)
  requiresAttunement: boolean
  attunementNote: string  // optional qualifier, e.g. "by a spellcaster"
  description: string      // main rules text (newlines = paragraphs)
  properties: StatBlockEntry[]  // named abilities, like creature traits
}

export const DEFAULT_ITEM_STATBLOCK: ItemStatBlock = {
  category: '', rarity: '', requiresAttunement: false, attunementNote: '',
  description: '', properties: [],
}

export function parseItemStatBlock(json: string): ItemStatBlock {
  try {
    const parsed = JSON.parse(json)
    return { ...DEFAULT_ITEM_STATBLOCK, ...parsed }
  } catch {
    return { ...DEFAULT_ITEM_STATBLOCK }
  }
}

// Italic subtitle line, e.g. "Wondrous item, uncommon (requires attunement by a spellcaster)".
export function itemBlockSubtitle(ib: ItemStatBlock): string {
  const head = [ib.category, ib.rarity ? ib.rarity.toLowerCase() : '']
    .filter(Boolean).join(', ')
  if (!ib.requiresAttunement) return head
  const attune = ib.attunementNote.trim()
    ? `requires attunement ${ib.attunementNote.trim()}`
    : 'requires attunement'
  return head ? `${head} (${attune})` : `(${attune})`
}

export function itemBlockHasData(ib: ItemStatBlock): boolean {
  return !!(ib.category || ib.rarity || ib.description.trim() || ib.properties.length || ib.requiresAttunement)
}

export interface LootItem {
  id: string
  name: string
  description: string
  quantity: string
  chance: number
  price?: string
  weight?: string
}

export interface LootTable {
  name: string
  items: LootItem[]
}

export type SoundCategory = 'ambience' | 'music' | 'effect'

export interface SoundBoard {
  id: number
  campaign_id: number
  name: string
  sort_order: number
  sound_count?: number
  created_at: string
}

export interface Sound {
  id: number
  board_id: number
  name: string
  category: SoundCategory
  file_path: string
  hotkey: string
  volume: number
  loop: number        // 1 = loop, 0 = one-shot
  sort_order: number
  created_at: string
}

// Bundled default sound — scanned live from the app's soundboard folder.
// Not stored in the DB; `url` is a ready-to-play file:// path,
// `ref` is the stable `default:<folder>/<file>` reference for "Add to board".
export interface DefaultSound {
  category: SoundCategory
  name: string
  url: string
  ref: string
}

export const DEFAULT_LOOT_TABLE: LootTable = { name: 'Loot', items: [] }

export function parseLootTable(json: string): LootTable {
  try {
    const parsed = JSON.parse(json)
    return {
      name: parsed.name?.trim() || 'Loot',
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return { ...DEFAULT_LOOT_TABLE }
  }
}

export function generateLoot(items: LootItem[]): LootItem[] {
  return items.filter(i => Math.random() * 100 <= i.chance)
}

export interface CombatEncounter {
  id: number
  poi_id: number
  created_at: string
}

export interface CombatResource {
  id: string
  name: string
  current: number
  max: number
}

export interface CombatCreature {
  id: number
  encounter_id: number
  article_id: number
  instance_number: number
  max_hp: number
  current_hp: number
  ac_override: number | null
  is_dead: boolean
  initiative: number | null
  loot_result: string | null
  resources: string
  title: string
  statblock: string
  loot_table: string
  loot_table_id: number | null
  cr?: string | null            // CR captured at add-time (XP derived from it)
  article_type?: string         // source article type (creature / character / playerCharacter)
  display_name?: string         // variant name or article title
}

export interface DMNoteGroup {
  id: number
  campaign_id: number
  name: string
  color: string
  sort_order: number
  is_system: number
  created_at: string
}

export interface DMNotePage {
  id: number
  campaign_id: number
  title: string
  content: string
  group_id: number | null
  sort_order: number
  session_id: number | null
  created_at: string
  updated_at: string
}

export interface CreateCampaignInput {
  name: string
  description: string
  system: string
  cover_image?: string | null
}

export interface CreateSessionInput {
  campaign_id: number
  name: string
  session_number: number
  session_sub?: string
  arc_id?: number | null
  date?: string | null
  notes?: string
  is_draft?: number
}

export interface CreateMapInput {
  session_id?: number | null
  campaign_id?: number | null
  article_id?: number | null
  name: string
  image_path: string
}

export interface CreatePOIInput {
  map_id: number
  label: string
  x: number
  y: number
  content?: string
  poi_type?: POIType
  color?: string
  loot_table?: string
  loot_table_id?: number | null
}

export interface ArticleFilter {
  campaignId?: number
  type?: ArticleType
  search?: string
  searchTitle?: boolean
  searchTags?: boolean
  tag?: string
}

export interface CreateArticleInput {
  campaign_id: number
  title: string
  content?: string
  article_type?: ArticleType
  tags?: string
  tracks?: string
  statblock?: string
  loot_table?: string
  loot_table_id?: number | null
  cover_image?: string | null
  portrait_image?: string | null
  substeps?: string
  rewards?: string
}

export interface CreateLootTableInput {
  campaign_id: number
  name: string
  description?: string
  category?: LootTableCategory
  items?: string    // JSON: LootItem[]
  is_default?: boolean
}

export interface ElectronAPI {
  getCampaigns:    ()                              => Promise<Campaign[]>
  getCampaign:     (id: number)                   => Promise<Campaign | null>
  createCampaign:  (data: CreateCampaignInput)    => Promise<Campaign>
  updateCampaign:  (id: number, data: Partial<CreateCampaignInput>) => Promise<Campaign>
  deleteCampaign:  (id: number)                   => Promise<void>

  getSessions:        (campaignId: number)           => Promise<Session[]>
  getSessionPoiTexts: (campaignId: number)           => Promise<{ session_id: number; label: string; content: string }[]>
  createSession:   (data: CreateSessionInput)      => Promise<Session>
  updateSession:   (id: number, data: Partial<CreateSessionInput>) => Promise<Session>
  promoteSession:  (id: number) => Promise<Session>
  reorderDrafts:   (orders: { id: number; sort_order: number }[]) => Promise<void>
  deleteSession:   (id: number)                    => Promise<void>

  getArcs:    (campaignId: number)                 => Promise<Arc[]>
  createArc:  (data: CreateArcInput)               => Promise<Arc>
  updateArc:  (id: number, data: Partial<CreateArcInput>) => Promise<Arc>
  deleteArc:  (id: number)                         => Promise<{ success: boolean; error?: string }>
  reorderArcs:(orders: { id: number; sort_order: number }[]) => Promise<void>

  getMaps:            (sessionId: number)          => Promise<GameMap[]>
  getMapsForArticle:  (articleId: number)          => Promise<GameMap[]>
  createMap:          (data: CreateMapInput)       => Promise<GameMap>
  updateMap:          (id: number, data: Partial<CreateMapInput>) => Promise<GameMap>
  reorderMaps:        (orders: { id: number; sort_order: number }[]) => Promise<void>
  deleteMap:          (id: number)                 => Promise<void>
  importMapImage:     (sessionId: number)          => Promise<{ path: string; name: string } | null>
  importMapForArticle:(articleId: number)          => Promise<{ path: string; name: string } | null>
  getMapsForCampaign:   (campaignId: number) => Promise<GameMap[]>
  importMapForCampaign: (campaignId: number) => Promise<{ path: string; name: string } | null>

  getPOIs:         (mapId: number)                 => Promise<POI[]>
  createPOI:       (data: CreatePOIInput)          => Promise<POI>
  updatePOI:       (id: number, data: Partial<CreatePOIInput & { content: string; loot_table: string; loot_table_id: number | null }>) => Promise<POI>
  deletePOI:       (id: number)                    => Promise<void>

  getArticles:         (filter?: ArticleFilter)    => Promise<Article[]>
  getArticlesList:     (filter?: ArticleFilter)    => Promise<ArticleSummary[]>
  getArticle:          (id: number)                => Promise<Article | null>
  getArticleByTitle:   (title: string, campaignId: number) => Promise<Article | null>
  getArticleBacklinks: (title: string, campaignId: number) => Promise<ArticleSummary[]>
  getArticlesHealth:   (campaignId: number) => Promise<WikiHealth>
  getArticleLinkGraph: (campaignId: number) => Promise<LinkGraph>
  globalSearch:        (campaignId: number, query: string) => Promise<GlobalSearchResults>
  findInPage:          (text: string, opts?: { forward?: boolean; findNext?: boolean }) => Promise<void>
  stopFindInPage:      () => Promise<void>
  onFindResult:        (cb: (r: { matches: number; active: number }) => void) => void
  createArticle:       (data: CreateArticleInput)  => Promise<Article>
  updateArticle:       (id: number, data: Partial<CreateArticleInput>) => Promise<Article>
  deleteArticle:       (id: number)                => Promise<void>

  getCombatEncounter:    (poiId: number)           => Promise<CombatEncounter>
  getCombatCreatures:    (encounterId: number)     => Promise<CombatCreature[]>
  addCombatCreature:     (encounterId: number, articleId: number, maxHp: number) => Promise<CombatCreature>
  saveCombatCreatures:   (creatures: Pick<CombatCreature, 'id' | 'current_hp' | 'ac_override' | 'is_dead' | 'initiative' | 'resources'>[]) => Promise<void>
  deleteCombatCreature:  (creatureId: number) => Promise<void>
  saveLootResult:        (creatureId: number, lootResult: LootItem[]) => Promise<void>
  getLootResults:        (encounterId: number) => Promise<{ id: number; loot_result: string | null }[]>
  openStatBlockWindow:   (articleId: number)       => Promise<void>

  selectImageFile: () => Promise<string | null>
  getImagePath:    (relativePath: string) => Promise<string>
  exportBackup:    (campaignId?: number | null) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean; failedImages?: number }>
  importBackup:    () => Promise<{ success: boolean; error?: string; canceled?: boolean; imported?: string[]; replaced?: string[]; skipped?: string[] }>

  checkForUpdates:    () => Promise<void>
  installUpdate:      () => Promise<void>
  onUpdateAvailable:  (cb: (info: { version: string }) => void) => void
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => void
  getAppVersion:      () => Promise<string>

  // DM Notes — pages
  getDMNotesPages:     (campaignId: number) => Promise<Omit<DMNotePage, 'content'>[]>
  getDMNotePage:       (id: number) => Promise<DMNotePage | null>
  createDMNotePage:    (campaignId: number, groupId?: number | null) => Promise<DMNotePage>
  updateDMNotePage:    (id: number, data: { title?: string; content?: string; group_id?: number | null; sort_order?: number }) => Promise<DMNotePage>
  deleteDMNotePage:    (id: number) => Promise<void>
  reorderDMNotePages:  (orders: { id: number; sort_order: number; group_id: number | null }[]) => Promise<void>

  // DM Notes — groups
  getDMNoteGroups:     (campaignId: number) => Promise<DMNoteGroup[]>
  createDMNoteGroup:   (campaignId: number, name: string, color: string) => Promise<DMNoteGroup>
  updateDMNoteGroup:   (id: number, data: { name?: string; color?: string; sort_order?: number }) => Promise<DMNoteGroup>
  deleteDMNoteGroup:   (id: number) => Promise<void>
  reorderDMNoteGroups: (orders: { id: number; sort_order: number }[]) => Promise<void>
  syncDMSessionNotes:  (campaignId: number) => Promise<{ group: DMNoteGroup; newPages: Omit<DMNotePage, 'content'>[] }>
  listCreatureImages:  () => Promise<Record<string, string>>

  // Master Loot Tables
  getLootTables:       (campaignId: number) => Promise<MasterLootTable[]>
  getLootTable:        (id: number) => Promise<MasterLootTable | null>
  createLootTable:     (data: CreateLootTableInput) => Promise<MasterLootTable>
  updateLootTable:     (id: number, data: { name?: string; description?: string; category?: LootTableCategory; items?: string }) => Promise<MasterLootTable>
  deleteLootTable:     (id: number) => Promise<{ success: boolean; affected: number }>
  rollLootTable:       (tableId: number, extraItemsJson: string) => Promise<LootItem[]>
  resetDefaultTables:  (campaignId: number) => Promise<MasterLootTable[]>

  // Progress clocks
  getClocks:           (campaignId: number) => Promise<Clock[]>
  getArticleClocks:    (articleId: number) => Promise<Clock[]>
  createClock:         (data: { campaign_id: number; article_id?: number | null; name?: string; segments?: number }) => Promise<Clock>
  updateClock:         (id: number, data: Partial<Pick<Clock, 'name' | 'segments' | 'filled' | 'status' | 'article_id'>>) => Promise<Clock>
  deleteClock:         (id: number) => Promise<{ success: boolean }>

  // Relations
  getRelationWebs:        (campaignId: number) => Promise<any[]>
  createRelationWeb:      (data: any) => Promise<any>
  updateRelationWeb:      (id: number, data: any) => Promise<any>
  deleteRelationWeb:      (id: number) => Promise<void>
  getRelationWebData:     (webId: number) => Promise<{ nodes: any[]; edges: any[] }>
  createRelationNode:     (data: any) => Promise<any>
  updateRelationNode:     (id: number, data: any) => Promise<any>
  deleteRelationNode:     (id: number) => Promise<void>
  createRelationEdge:     (data: any) => Promise<any>
  updateRelationEdge:     (id: number, data: any) => Promise<any>
  deleteRelationEdge:     (id: number) => Promise<void>
  getArticleRelations:    (articleId: number, campaignId: number) => Promise<any[]>

  // Maps
  replaceMapImage: (mapId: number) => Promise<{ path: string } | null>

  // Sound Boards
  getSoundBoards:   (campaignId: number)        => Promise<SoundBoard[]>
  createSoundBoard: (data: { campaign_id: number; name: string }) => Promise<SoundBoard>
  updateSoundBoard: (id: number, data: Partial<SoundBoard>) => Promise<SoundBoard>
  deleteSoundBoard: (id: number)                => Promise<void>
  getDefaultSounds: ()                          => Promise<DefaultSound[]>

  // Sounds
  getSounds:        (boardId: number)           => Promise<Sound[]>
  createSound:      (data: Omit<Sound, 'id' | 'sort_order' | 'created_at' | 'loop'> & { loop?: number }) => Promise<Sound>
  updateSound:      (id: number, data: Partial<Sound>) => Promise<Sound>
  deleteSound:      (id: number)                => Promise<void>
  selectAudioFile:  ()                          => Promise<string | null>
}


declare global {
  interface Window {
    api: ElectronAPI
  }
}