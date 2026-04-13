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
  map_count?: number
}

export interface GameMap {
  id: number
  session_id: number
  name: string
  image_path: string
  created_at: string
  poi_count?: number
}

export interface POI {
  id: number
  map_id: number
  label: string
  x: number
  y: number
  content: string
  poi_type: POIType
  color: string
  loot_table: string
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
  created_at: string
  updated_at: string
}

export interface Article extends ArticleSummary {
  content: string
  portrait_image: string | null
  statblock: string
}

export type ArticleType =
  | 'character' | 'playerCharacter' | 'location' | 'faction'
  | 'organization' | 'culture' | 'religion' | 'item' | 'artifact'
  | 'quest' | 'event' | 'lore' | 'creature' | 'note' | 'other'

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
  str: number; dex: number; con: number
  int: number; wis: number; cha: number
  cr: string
  savingThrows: string
  skills: string
  senses: string
  languages: string
  damageImmunities: string
  damageResistances: string
  conditionImmunities: string
  proficiencyBonus: string
  traits: StatBlockEntry[]
  actions: StatBlockEntry[]
  bonusActions: StatBlockEntry[]
  reactions: StatBlockEntry[]
  legendaryActions: StatBlockEntry[]
  cantrips: string[]        // spell names from spells_2014.json
  preparedSpells: string[]  // spell names from spells_2014.json
}

export const DEFAULT_STATBLOCK: StatBlock = {
  ac: 10, acNote: '', hp: 4,
  hpDice: { count: 1, die: 8, bonus: 0 },
  speed: '30 ft.',
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  cr: '0',
  savingThrows: '', skills: '', senses: '', languages: '', proficiencyBonus: '',
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

export interface LootItem {
  id: string
  name: string
  description: string
  quantity: string
  chance: number
}

export interface LootTable {
  name: string
  items: LootItem[]
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
  resources: string    // JSON CombatResource[]
  title: string
  statblock: string
  loot_table: string
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
}

export interface CreateMapInput {
  session_id: number
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
  cover_image?: string | null
  portrait_image?: string | null
}

export interface ElectronAPI {
  getCampaigns:    ()                              => Promise<Campaign[]>
  getCampaign:     (id: number)                   => Promise<Campaign | null>
  createCampaign:  (data: CreateCampaignInput)    => Promise<Campaign>
  updateCampaign:  (id: number, data: Partial<CreateCampaignInput>) => Promise<Campaign>
  deleteCampaign:  (id: number)                   => Promise<void>

  getSessions:     (campaignId: number)            => Promise<Session[]>
  createSession:   (data: CreateSessionInput)      => Promise<Session>
  updateSession:   (id: number, data: Partial<CreateSessionInput>) => Promise<Session>
  deleteSession:   (id: number)                    => Promise<void>

  getArcs:    (campaignId: number)                 => Promise<Arc[]>
  createArc:  (data: CreateArcInput)               => Promise<Arc>
  updateArc:  (id: number, data: Partial<CreateArcInput>) => Promise<Arc>
  deleteArc:  (id: number)                         => Promise<{ success: boolean; error?: string }>

  getMaps:         (sessionId: number)             => Promise<GameMap[]>
  createMap:       (data: CreateMapInput)          => Promise<GameMap>
  updateMap:       (id: number, data: Partial<CreateMapInput>) => Promise<GameMap>
  deleteMap:       (id: number)                    => Promise<void>
  importMapImage:  (sessionId: number)             => Promise<{ path: string; name: string } | null>

  getPOIs:         (mapId: number)                 => Promise<POI[]>
  createPOI:       (data: CreatePOIInput)          => Promise<POI>
  updatePOI:       (id: number, data: Partial<CreatePOIInput & { content: string; loot_table: string }>) => Promise<POI>
  deletePOI:       (id: number)                    => Promise<void>

  getArticles:         (filter?: ArticleFilter)    => Promise<Article[]>
  getArticlesList:     (filter?: ArticleFilter)    => Promise<ArticleSummary[]>
  getArticle:          (id: number)                => Promise<Article | null>
  getArticleByTitle:   (title: string, campaignId: number) => Promise<Article | null>
  getArticleBacklinks: (title: string, campaignId: number) => Promise<ArticleSummary[]>
  createArticle:       (data: CreateArticleInput)  => Promise<Article>
  updateArticle:       (id: number, data: Partial<CreateArticleInput>) => Promise<Article>
  deleteArticle:       (id: number)                => Promise<void>

  getCombatEncounter:    (poiId: number)           => Promise<CombatEncounter>
  getCombatCreatures:    (encounterId: number)     => Promise<CombatCreature[]>
  addCombatCreature:     (encounterId: number, articleId: number, maxHp: number) => Promise<CombatCreature>
  saveCombatCreatures:   (creatures: Pick<CombatCreature, 'id' | 'current_hp' | 'ac_override' | 'is_dead' | 'initiative' | 'resources'>[]) => Promise<void>
  saveLootResult:        (creatureId: number, lootResult: LootItem[]) => Promise<void>
  getLootResults:        (encounterId: number) => Promise<{ id: number; loot_result: string | null }[]>
  openStatBlockWindow:   (articleId: number)       => Promise<void>

  selectImageFile: () => Promise<string | null>
  getImagePath:    (relativePath: string) => Promise<string>
  exportBackup:    () => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>
  importBackup:    () => Promise<{ success: boolean; error?: string; canceled?: boolean }>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}