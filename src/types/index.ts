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
  // Present when the map is an article map attached to a session: the visit
  // layer this session runs, and the owning article's title for the tab badge.
  attached?: number           // 1 when attached (vs owned) in a session listing
  layer_id?: number | null
  article_title?: string | null
  map_scale?: string | null   // JSON MapScale for the travel/measure tool; null = uncalibrated
}

// Travel pace on foot (PHB p.182). See src/utils/travel.ts for mph values.
export type TravelPace = 'fast' | 'normal' | 'slow'

// One reference line the user drew to calibrate real distance, stored (as JSON)
// in maps.map_scale. Endpoints are %coords of the fitted image box, like POIs.
export interface MapScale {
  x1: number; y1: number; x2: number; y2: number
  distance: number            // real-world length of that line, in `unit`
  unit: DistanceUnit
}

// Overland units (mi/km) and local ones (ft/m). A world map is calibrated in
// the former, a city or dungeon map in the latter — which is why travel time
// only makes sense for the overland pair.
export type DistanceUnit = 'mi' | 'km' | 'ft' | 'm'

export const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: 'mi', label: 'miles' },
  { value: 'km', label: 'km' },
  { value: 'ft', label: 'feet' },
  { value: 'm',  label: 'metres' },
]

/** Local scales measure a room or a street, not a journey. */
export function isLocalUnit(unit: DistanceUnit): boolean {
  return unit === 'ft' || unit === 'm'
}

// A visit layer on a map: the POIs made for one visit to the location (which
// may span several sessions). POIs with layer_id NULL form the base layer.
export interface MapLayer {
  id: number
  map_id: number
  name: string
  created_at: string
  poi_count?: number
  sessions?: { session_id: number; session_number: number; session_sub: string; name: string; is_draft: number }[]
}

// Attachable article map in the "attach from wiki" picker.
export interface AttachableMap extends GameMap {
  article_title: string
  layers: MapLayer[]
}

// A hand-made drawing layer on a map (kingdom borders, city districts…).
// Unrelated to MapLayer above, which is a session's visit layer for POIs.
export interface MapShapeLayer {
  id: number
  map_id: number
  name: string
  visible: number   // 0/1 — SQLite has no boolean
  locked: number    // 0/1 — locked layers can't be selected or edited on canvas
  sort_order: number
  created_at: string
  shape_count?: number
}

// Two primitives only. Rectangles and triangles are polygon presets, so vertex
// editing has a single code path and a rectangle can be dragged out of square.
export type MapShapeType = 'polygon' | 'ellipse'

// Preset picked in the toolbar. All but 'ellipse' produce a polygon.
export type ShapeTool = 'polygon' | 'rect' | 'triangle' | 'ellipse'

// What a click on the map surface does. One enum replaces the old trio of
// mutually exclusive mode booleans (editMode/measureMode/shapeMode), which each
// had to remember to switch the others off — a standing source of bugs. Exactly
// one tool is active, and it owns canvas clicks.
export type MapTool = 'select' | 'pin' | 'measure' | ShapeTool

// 'select' is the resting state: nothing is placed, and POIs and shapes are
// both clickable to open their details.
export const SHAPE_TOOLS: ShapeTool[] = ['polygon', 'rect', 'triangle', 'ellipse']

export function isShapeTool(tool: MapTool): tool is ShapeTool {
  return (SHAPE_TOOLS as MapTool[]).includes(tool)
}

export interface ShapePoint { x: number; y: number }

export interface MapShape {
  id: number
  map_id: number
  layer_id: number | null   // null = unfiled, always visible

  label: string
  shape_type: MapShapeType
  // JSON ShapePoint[] in the same 0–100 space as POI x/y. For 'ellipse' the two
  // points are opposite corners of the bounding box, not centre + radius.
  points: string
  fill_color: string
  fill_opacity: number
  stroke_color: string
  stroke_width: number
  stroke_style: 'solid' | 'dashed'
  content: string     // TipTap doc, same plain-description convention as hub POIs
  hub_links: string   // JSON: HubLink[] — identical shape to a POI's
  show_label: number  // 0/1
  sort_order: number
  created_at: string
}

export interface POI {
  id: number
  map_id: number
  layer_id: number | null  // null = base layer (place feature); set = visit layer

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
  track_visibility: string
}

// Per-track / per-milestone player visibility (companion to `tracks`).
// No entry = inherit-by-default (except *_Date tracks, which default to DM-only).
export type TrackVisMode = 'inherit' | 'dm' | 'restricted'
export interface TrackVisEntry { mode: TrackVisMode; players?: number[] }
export interface TrackVisibility {
  tracks?: Record<string, TrackVisEntry>
  milestones?: Record<string, TrackVisEntry>
}

export type ArticleType =
  | 'character' | 'playerCharacter' | 'location' | 'faction'
  | 'culture' | 'religion' | 'item' | 'artifact'
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
  // `webs` = names of the relation webs this article is a node in. The wiki's
  // tag search counts those as tags, so the graph needs them to match the list.
  nodes: { id: number; title: string; article_type: string; tags: string; webs: string[]; updated_at: string }[]
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

// One entry on the app-wide sound shelf: every sound the user imported plus the
// bundled starter sounds. `file_path` is either `sounds/<file>` (imported, under
// userData) or `default:<folder>/<file>` (bundled, resolved against the app dir).
export interface SoundLibraryEntry {
  id: number
  name: string
  category: SoundCategory
  file_path: string
  hotkey: string
  volume: number
  loop: number        // 1 = loop, 0 = one-shot
  sort_order: number
  created_at: string
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
  layer_id?: number | null
  label: string
  x: number
  y: number
  content?: string
  poi_type?: POIType
  color?: string
  loot_table?: string
  loot_table_id?: number | null
}

export interface CreateMapShapeInput {
  map_id: number
  layer_id?: number | null
  label?: string
  shape_type?: MapShapeType
  points?: string
  fill_color?: string
  fill_opacity?: number
  stroke_color?: string
  stroke_width?: number
  stroke_style?: 'solid' | 'dashed'
  content?: string
  hub_links?: string
  show_label?: number
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
  item_block?: string
  loot_table?: string
  loot_table_id?: number | null
  cover_image?: string | null
  portrait_image?: string | null
  substeps?: string
  rewards?: string
  track_visibility?: string
}

export interface CreateLootTableInput {
  campaign_id: number
  name: string
  description?: string
  category?: LootTableCategory
  items?: string    // JSON: LootItem[]
  is_default?: boolean
}

// ── Player-facing pages ─────────────────────────────────────────────────────

// First-class entities that visibility grants can target. Track/subtrack
// visibility is handled separately (companion JSON on the article).
export type VisibilityEntityType = 'article' | 'map' | 'poi' | 'layer'

// A grant's audience: a specific player id, or null meaning "party" (all players).
export type Grantee = number | null

export interface Player {
  id: number
  campaign_id: number
  username: string
  display_name: string
  password: string           // DM-assigned share password, stored locally (see plan)
  pc_article_id: number | null
  created_at: string
}

export interface CreatePlayerInput {
  campaign_id: number
  username: string
  display_name?: string
  password?: string
  pc_article_id?: number | null
}

export interface VisibilityGrant {
  id: number
  campaign_id: number
  entity_type: VisibilityEntityType
  entity_id: number
  player_id: number | null   // null = party (all players)
  created_at: string
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
  reorderSessionTabs: (sessionId: number, items: { map_id: number; attached: boolean; sort_order: number }[]) => Promise<void>
  deleteMap:          (id: number)                 => Promise<void>
  importMapImage:     (sessionId: number)          => Promise<{ path: string; name: string } | null>
  importMapForArticle:(articleId: number)          => Promise<{ path: string; name: string } | null>
  getMapsForCampaign:   (campaignId: number) => Promise<GameMap[]>
  importMapForCampaign: (campaignId: number) => Promise<{ path: string; name: string } | null>

  getAttachableMaps:    (campaignId: number) => Promise<AttachableMap[]>
  getMapLayers:         (mapId: number)      => Promise<MapLayer[]>
  attachMapToSession:   (sessionId: number, mapId: number, layerId: number | null) => Promise<GameMap>
  detachMapFromSession: (sessionId: number, mapId: number) => Promise<void>
  updateMapLayer:       (layerId: number, data: { name?: string }) => Promise<MapLayer>
  deleteMapLayer:       (layerId: number)    => Promise<void>

  getPOIs:         (mapId: number)                 => Promise<POI[]>
  createPOI:       (data: CreatePOIInput)          => Promise<POI>
  updatePOI:       (id: number, data: Partial<CreatePOIInput & { content: string; loot_table: string; loot_table_id: number | null }>) => Promise<POI>
  deletePOI:       (id: number)                    => Promise<void>

  getShapeLayers:     (mapId: number)              => Promise<MapShapeLayer[]>
  createShapeLayer:   (mapId: number, name?: string) => Promise<MapShapeLayer>
  updateShapeLayer:   (id: number, data: Partial<Pick<MapShapeLayer, 'name' | 'visible' | 'locked' | 'sort_order'>>) => Promise<MapShapeLayer>
  deleteShapeLayer:   (id: number)                 => Promise<void>

  getMapShapes:    (mapId: number)                 => Promise<MapShape[]>
  createMapShape:  (data: CreateMapShapeInput)     => Promise<MapShape>
  updateMapShape:  (id: number, data: Partial<Omit<MapShape, 'id' | 'map_id' | 'created_at'>>) => Promise<MapShape>
  deleteMapShape:  (id: number)                    => Promise<void>

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
  /** Webs whose own article_id points at this article (its hierarchy webs). */
  listRelationWebsForArticle: (articleId: number) => Promise<any[]>
  /** Webs this article appears in as a node — what "show in relations" offers. */
  listRelationWebsForMember:  (articleId: number) => Promise<{ id: number; name: string; template: string }[]>

  // Maps
  replaceMapImage: (mapId: number) => Promise<{ path: string } | null>

  // Sound Boards
  getSoundBoards:   (campaignId: number)        => Promise<SoundBoard[]>
  createSoundBoard: (data: { campaign_id: number; name: string }) => Promise<SoundBoard>
  updateSoundBoard: (id: number, data: Partial<SoundBoard>) => Promise<SoundBoard>
  deleteSoundBoard: (id: number)                => Promise<void>

  // Sounds
  getSounds:        (boardId: number)           => Promise<Sound[]>
  createSound:      (data: Omit<Sound, 'id' | 'sort_order' | 'created_at' | 'loop'> & { loop?: number }) => Promise<Sound>
  updateSound:      (id: number, data: Partial<Sound>) => Promise<Sound>
  deleteSound:      (id: number)                => Promise<void>
  selectAudioFile:  ()                          => Promise<string | null>
  selectAudioFiles: ()                          => Promise<{ file_path: string; name: string }[]>

  // Sound Library
  getSoundLibrary:    ()                        => Promise<SoundLibraryEntry[]>
  createLibrarySound: (data: { name: string; category: SoundCategory; file_path: string; hotkey?: string; volume?: number; loop?: number }) => Promise<SoundLibraryEntry>
  updateLibrarySound: (id: number, data: Partial<SoundLibraryEntry>) => Promise<SoundLibraryEntry>
  deleteLibrarySound: (id: number)              => Promise<void>

  // Players (player-facing pages)
  getPlayers:    (campaignId: number)              => Promise<Player[]>
  createPlayer:  (data: CreatePlayerInput)         => Promise<Player>
  updatePlayer:  (id: number, data: Partial<CreatePlayerInput>) => Promise<Player>
  deletePlayer:  (id: number)                      => Promise<void>

  // Visibility grants (deny-by-default; grantee = player id or null for party)
  getVisibilityGrants:   (campaignId: number) => Promise<VisibilityGrant[]>
  getGrantsForEntity:    (entityType: VisibilityEntityType, entityId: number) => Promise<VisibilityGrant[]>
  grantVisibility:       (campaignId: number, entityType: VisibilityEntityType, entityId: number, grantee: Grantee) => Promise<void>
  revokeVisibility:      (entityType: VisibilityEntityType, entityId: number, grantee: Grantee) => Promise<void>
  setEntityAudience:     (campaignId: number, entityType: VisibilityEntityType, entityId: number, grantees: Grantee[]) => Promise<void>

  // Publish the player-facing site
  publishPlayerSite:     (campaignId: number) => Promise<PublishResult>

  // Native context menus — see src/hooks/useContextMenu.ts for the caller side.
  popupMenu:             (template: MenuTemplateItem[]) => Promise<string | null>
}

/** Serializable menu template sent to the main process. Mirrors electron/main/menu.ts. */
export interface MenuTemplateItem {
  id?: string
  label?: string
  type?: 'normal' | 'separator' | 'checkbox'
  enabled?: boolean
  checked?: boolean
  accelerator?: string
  submenu?: MenuTemplateItem[]
}

export interface PublishResult {
  success: boolean
  path?: string
  error?: string
  canceled?: boolean
  warnings?: string[]
  stats?: { players: number; articles: number; images: number }
}


declare global {
  interface Window {
    api: ElectronAPI
  }
}