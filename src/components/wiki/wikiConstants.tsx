// path: src/components/wiki/wikiConstants.tsx
import {
  BookOpen, MapPin, User, Package, ScrollText, Users, Landmark,
  FileText, PawPrint, StickyNote,
} from 'lucide-react'
import type { ArticleType } from '../../types'
import { ARTICLE_TYPE_COLORS } from '../../constants/articleTypes'
import { RARITY_COLORS } from '../../constants/loot'

// ── Article type definitions ───────────────────────────────────────────────────
// Colors come from the shared ARTICLE_TYPE_COLORS map (single source of truth);
// only label + icon are defined here.

export const ARTICLE_TYPES: { value: ArticleType; label: string; icon: any; color: string }[] = [
  { value: 'character',       label: 'Character',    icon: User,        color: ARTICLE_TYPE_COLORS.character },
  { value: 'playerCharacter', label: 'Player Character', icon: User,    color: ARTICLE_TYPE_COLORS.playerCharacter },
  { value: 'location',        label: 'Location',     icon: MapPin,      color: ARTICLE_TYPE_COLORS.location },
  { value: 'creature',        label: 'Creature',     icon: PawPrint,    color: ARTICLE_TYPE_COLORS.creature },
  { value: 'faction',         label: 'Faction',      icon: Users,       color: ARTICLE_TYPE_COLORS.faction },
  { value: 'culture',         label: 'Culture',      icon: Landmark,    color: ARTICLE_TYPE_COLORS.culture },
  { value: 'religion',        label: 'Religion',     icon: Landmark,    color: ARTICLE_TYPE_COLORS.religion },
  { value: 'item',            label: 'Item',         icon: Package,     color: ARTICLE_TYPE_COLORS.item },
  { value: 'note',            label: 'Note',         icon: StickyNote,  color: ARTICLE_TYPE_COLORS.note },
  { value: 'quest',           label: 'Quest',        icon: ScrollText,  color: ARTICLE_TYPE_COLORS.quest },
  { value: 'event',           label: 'Event',        icon: ScrollText,  color: ARTICLE_TYPE_COLORS.event },
  { value: 'lore',            label: 'Lore',         icon: Landmark,    color: ARTICLE_TYPE_COLORS.lore },
  { value: 'other',           label: 'Other',        icon: FileText,    color: ARTICLE_TYPE_COLORS.other },
]

// ── Track definitions ──────────────────────────────────────────────────────────

export const ARTICLE_TRACKS: Partial<Record<ArticleType, Record<string, string[]>>> = {
  character: {
    Vitality:      ['Alive', 'Dead', 'Unknown', 'Missing', 'Immortal'],
    Attitude:    ['Friendly', 'Neutral', 'Hostile'],
    Attitude_Towards_Party: ['Friendly', 'Neutral', 'Hostile', 'Unknown'],
    Age:         [],
    Species:     ['Human', 'Elf', 'High Elf', 'Drow', 'Half-Elf', 'Dwarf', 'Duergar', 'Halfling', 'Gnome', 'Deep Gnome', 'Half-Orc', 'Orc',
                  'Tiefling', 'Dragonborn', 'Aasimar', 'Owlin', 'Aarakocra', 'Tortle', 'Goliath', 'Lizardfolk', 'Tabaxi',
                  'Water Genasi', 'Fire Genasi', 'Air Genasi', 'Earth Genasi'],
    Royal_Title: ['Duke', 'Duchess', 'Lord', 'Lady', 'King', 'Queen', 'Prince', 'Princess', 'Emperor', 'Empress', 'Disowned'],
    Title:       ['Professor', 'Captain', 'General', 'Admiral', 'Archmage', 'High Priest'],
    Location:    [],
    Culture:     [],
    Faction:     [],
    Religion:    [],
  },
  playerCharacter: {
    Vitality:      ['Alive', 'Dead', 'Unknown', 'Retired', 'Immortal'],
    Disposition: ['Friendly', 'Neutral', 'Hostile'],
    Age:         [],
    Species:     ['Human', 'Elf', 'High Elf', 'Drow', 'Half-Elf', 'Dwarf', 'Duergar', 'Halfling', 'Gnome', 'Deep Gnome', 'Half-Orc', 'Orc',
                  'Tiefling', 'Dragonborn', 'Aasimar', 'Owlin', 'Aarakocra', 'Tortle', 'Goliath', 'Lizardfolk', 'Tabaxi',
                  'Water Genasi', 'Fire Genasi', 'Air Genasi', 'Earth Genasi'],
    Royal_Title: ['Duke', 'Duchess', 'Lord', 'Lady', 'King', 'Queen', 'Prince', 'Princess', 'Emperor', 'Empress', 'Disowned'],
    Title:       ['Professor', 'Captain', 'General', 'Admiral', 'Archmage', 'High Priest'],
    Location:    [],
    Culture:     [],
    Faction:     [],
    Religion:    [],
  },
  creature: {
    Vitality:      ['Living', 'Extinct', 'Endangered', 'Unknown'],
    Disposition:   ['Hostile', 'Neutral', 'Friendly'],
    Creature_Type: ['Beast', 'Dragon', 'Fiend', 'Celestial', 'Fey', 'Undead', 'Aberration', 'Humanoid', 'Construct', 'Elemental', 'Giant', 'Monstrosity', 'Ooze', 'Plant'],
    Size:          ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'],
    Habitat:       ['Forest', 'Desert', 'Mountain', 'Swamp', 'Ocean', 'Underdark', 'Urban', 'Arctic', 'Plains'],
  },
  location: {
    State:  ['Discovered', 'Undiscovered', 'Destroyed', 'Abandoned'],
    // Two axes: Size = how big (a rough small→large scale mixing settlement,
    // realm and landmass), Type = what kind of place it is. Kept separate so a
    // location can be both at once (e.g. Size: City + Type: Ruins).
    // Size is ordered smallest → largest and renders in that order (TrackRow
    // leaves fixed enums in declaration order), running interior → settlement
    // → polity → landmass. Pick the nearest rung.
    Size:   ['Room', 'Building', 'Camp', 'Hamlet', 'Village', 'Town',
             'District', 'City', 'Metropolis',
             'County', 'Duchy', 'Principality', 'Kingdom', 'Empire',
             'Island', 'Archipelago', 'Region', 'Continent', 'World','Plane of Existence'],
    Type:   ['Ruins', 'Dungeon', 'Wilderness', 'Landmark', 'Natural Wonder'],
    // Years since founding — the location's counterpart to a character's Age.
    // Derived from Founded → Destroyed once both dates exist (see derivedAge).
    Age:    [],
    Government: ['Monarchy', 'Republic', 'Theocracy', 'Oligarchy', 'Magocracy', 'Tribal', 'Anarchy', 'Confederation'],
    'Ruler/Leader': [],
    Controlled_By: [],
    Plane:  ['Material Plane', 'The Nine Hells', 'The Abyss', 'Ethereal Plane', 'Shadowfell', 'Feywild', 'Elemental Plane', 'Astral Plane'],
    Within: [],
  },
  faction: {
    Status: ['Active', 'Disbanded', 'Unknown'],
    Type:   ['Player Party', 'Guild', 'Order', 'Company', 'Cult', 'Noble House', 'Political Bloc', 'Secret Society',
             'Council', 'Clan', 'Tribe', 'Syndicate', 'Cabal', 'Sect', 'Coven', 'Military Order', 'Merchant House',
             'Brotherhood', 'Court', 'Rebellion', 'Mercenary Company'],
    Scale:  ['Local', 'Regional', 'National', 'Global', 'Secret'],
    Leader: [],
    HQ:     [],
    Follower_Count: [],
    Allies: [],
    Rivals: [],
  },
  quest: {
    Status:           ['Active', 'Completed', 'Failed', 'Abandoned'],
    Type:             ['Main', 'Side', 'Personal', 'Faction'],
    Difficulty:       ['Trivial', 'Easy', 'Medium', 'Hard', 'Deadly'],
    Quest_Giver:      [],
    Player_Character: [],
  },
  item: {
    Status:   ['Found', 'Lost', 'Destroyed', 'Unknown'],
    Type:     ['Weapon', 'Armor', 'Potion', 'Scroll', 'Wand', 'Ring', 'Rod', 'Staff', 'Wondrous', 'Tool', 'Gear', 'Treasure'],
    Rarity:   ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'],
    Location: [],
  },
  event: {
    Status:        ['Upcoming', 'Ongoing', 'Past'],
    Type:          ['Battle', 'War', 'Festival', 'Celebration', 'Disaster', 'Cataclysm', 'Destruction', 'Political', 'Treaty',
                    'Discovery', 'Ritual', 'Founding', 'Coronation', 'Death', 'Betrayal', 'Prophecy', 'Plague', 'Uprising'],
    Scale:         ['Personal', 'Local', 'Regional', 'World-shaking'],
    Location:      [],
    In_World_Date: [],
  },
  culture:  { Status: ['Active', 'Undercover', 'Extinct', 'Unknown'] },
  religion: {
    Status:         ['Active', 'Undercover', 'Extinct', 'Unknown'],
    Domains:        ['Life', 'Death', 'War', 'Knowledge', 'Nature', 'Trickery', 'Tempest', 'Light', 'Forge', 'Grave', 'Order', 'Peace'],
    Leader:         [],
    Holy_Symbol:    [],
    Follower_Count: [],
    Allies:         [],
    Rivals:         [],
    Sacred_Sites:   [],
  },
  lore:  { Status: ['Active', 'Extinct', 'Unknown'] },
  note: {
    Sender:             [],
    Intended_Recipient: [],
    Language:           [],
    Date:               [],
    Location:           [],
  },
  other: { Status: ['Active', 'Inactive', 'Unknown'] },
}

// ── Article-backed tracks ──────────────────────────────────────────────────────
// These track pickers list the titles of other articles instead of a fixed
// enum, so their options grow as the wiki does — a Location track offers every
// Location article you've written, and a new one shows up the moment it exists.
// The mapped types are what feeds each picker; the editor uses them to label the
// dropdown group ("Location articles") and to nudge when a type is empty,
// so the behaviour is visible instead of something you have to discover.
export const ARTICLE_BACKED_TRACKS: Record<string, ArticleType[]> = {
  Religion:           ['religion'],
  Culture:            ['culture'],
  Faction:            ['faction'],
  Location:           ['location'],
  Within:             ['location'],
  HQ:                 ['location'],
  Sacred_Sites:       ['location'],
  Controlled_By:      ['faction'],
  'Ruler/Leader':     ['character', 'playerCharacter'],
  Leader:             ['character', 'playerCharacter'],
  Owner:              ['character', 'playerCharacter'],
  Sender:             ['character', 'playerCharacter'],
  Intended_Recipient: ['character', 'playerCharacter'],
  Quest_Giver:        ['character', 'playerCharacter'],
  Player_Character:   ['playerCharacter'],
  Allies:             ['character', 'playerCharacter', 'faction', 'religion'],
  Rivals:             ['character', 'playerCharacter', 'faction', 'religion'],
  // Merged with the standard species list rather than replacing it.
  Species:            ['creature'],
}

export function articleTypeLabel(type: ArticleType): string {
  return ARTICLE_TYPES.find(t => t.value === type)?.label ?? type
}

export const TRACK_VALUE_COLORS: Record<string, string> = {
  Alive: '#3dbf7f', Active: '#3dbf7f', Found: '#3dbf7f', Discovered: '#3dbf7f', Open: '#3dbf7f',
  Dead: '#e05555', Destroyed: '#e05555', Disbanded: '#e05555', Failed: '#e05555', Extinct: '#e05555',
  'Burned Down': '#e05555',
  Unknown: '#8a8a8a', Missing: '#8a8a8a', Lost: '#8a8a8a', Abandoned: '#8a8a8a',
  Inactive: '#8a8a8a', Undiscovered: '#8a8a8a', Closed: '#8a8a8a',
  'Under New Management': '#c8a84b',
  Friendly: '#3dbf7f', Neutral: '#bab637', Hostile: '#e05555',
  Completed: '#5b9fe8', Past: '#5b9fe8', Retired: '#5b9fe8',
  Upcoming: '#c8a84b', Ongoing: '#e88c3a',
  Trivial: '#8a8a8a', Easy: '#3dbf7f', Medium: '#c8a84b', Hard: '#e88c3a', Deadly: '#e05555',
  // Item rarities share the ladder used by item hover cards (constants/loot.ts)
  ...RARITY_COLORS,
  Personal: '#8a8a8a', Local: '#5bbfb0', Regional: '#5b9fe8',
  National: '#b07de8', Global: '#e88c3a', Secret: '#e05555', 'World-shaking': '#e05555',
  Tiny: '#8a8a8a', Small: '#5bbfb0', Large: '#e88c3a', Huge: '#e05555', Gargantuan: '#8b2533',
}

// Date tracks hold JSON (e.g. {"day":3,"year":1507}) and shouldn't become tags.
// Age is excluded for a plainer reason: it's a bare number, and "#317" is noise
// in the tag cloud — more so now that a lifespan derives one on its own.
export const NON_TAG_TRACKS = new Set(['In_World_Date', 'Death_Date', 'Timeline_Milestones', 'Age'])

// Tracks that hold several entries instead of one. Stored as a JSON array of
// strings in the same `tracks[key]` slot; a legacy plain string reads as a
// single-element list (see trackValues).
export const MULTI_TRACKS = new Set(['Allies', 'Rivals', 'Sacred_Sites', 'Domains'])

// The individual entries of a track value. Plain string → one entry; a JSON
// array (multi-value tracks) → its string members; JSON objects (date pickers,
// milestone lists) → none. Empty/blank → none.
export function trackValues(raw: string | null | undefined): string[] {
  const v = (raw ?? '').trim()
  if (!v) return []
  if (v.startsWith('[')) {
    try {
      const arr = JSON.parse(v)
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim())
    } catch { /* malformed → no entries */ }
    return []
  }
  if (v.startsWith('{')) return []
  return [v]
}

// Serialise a multi-value list back into a track slot: '' when empty, a JSON
// array otherwise. (A single entry still stores as an array so the shape is
// stable for multi-value tracks.)
export function stringifyMulti(list: string[]): string {
  const clean = list.map(s => s.trim()).filter(Boolean)
  return clean.length ? JSON.stringify(clean) : ''
}

// A plain enum/text track value becomes a tag; JSON values (date pickers,
// milestone lists) and any *_Date field are skipped so they never leak in.
export function isTaggableTrack(key: string, value: string): boolean {
  if (NON_TAG_TRACKS.has(key)) return false
  if (key.endsWith('_Date')) return false
  const v = value.trim()
  if (!v) return false
  if (v.startsWith('{') || v.startsWith('[')) return false
  return true
}

export function getTrackTags(tracks: Record<string, string>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(tracks)) {
    if (NON_TAG_TRACKS.has(k) || k.endsWith('_Date')) continue
    // Expands multi-value tracks (Allies/Rivals) into one tag per entry.
    for (const val of trackValues(v)) out.push(val.toLowerCase().replace(/\s+/g, '-'))
  }
  return out
}

// Parse a stored tags array, dropping any JSON-fragment garbage that earlier
// leaked in from date/milestone tracks (never present in legitimate tags).
export function parseTags(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr.filter((t): t is string => typeof t === 'string' && t.trim() !== '' && !/[{}[\]"]/.test(t))
  } catch { return [] }
}

export function formatTrackName(key: string): string {
  if (key === 'Within') return 'Located within'
  return key.replace(/_/g, ' ')
}

export const ALL_FILTERS = [
  { value: 'all', label: 'All', icon: BookOpen, color: 'var(--text-secondary)' },
  ...ARTICLE_TYPES,
]

export const imgBtnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-light)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 5,
}

export const addBannerStyle: React.CSSProperties = {
  width: '100%', padding: '12px', background: 'var(--bg-elevated)',
  border: 'none', borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  transition: 'background var(--transition)',
}

export const sidebarSectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
}
