// path: src/pages/WikiPage.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStore } from '../store/store'
import { useMenuClose } from '../hooks/useMenuClose'
import {
  BookOpen, Plus, Search, Trash2, Check, MapPin, User, Package,
  ScrollText, Users, Landmark, FileText, X, ChevronLeft, Calendar,
  MoreHorizontal, Tag, Image as ImageIcon, Link, PawPrint, StickyNote,
  ArrowLeft, ShoppingBag,
  Network, ChevronDown, ChevronRight, Skull, ExternalLink,
} from 'lucide-react'
import RichEditor from '../components/RichEditor'
import type { Article, ArticleSummary, ArticleType, MasterLootTable, LootItem } from '../types'
import StatBlockEditor from '../components/StatBlockEditor'
import { crToXp, CR_OPTIONS } from '../utils/encounterBudget'
import { parseStatBlock, parseItemStatBlock, itemBlockHasData } from '../types'
import StatBlockView from '../components/StatBlockView'
import ItemStatBlockEditor from '../components/ItemStatBlockEditor'
import ItemStatBlockView from '../components/ItemStatBlockView'
import LootTableEditor from '../components/LootTableEditor'
import LootTableView from '../components/LootTableView'
import { parseLootTable } from '../types'
import SectionDivider from '../components/SectionDivider'
import { InWorldDatePicker } from '../components/InWorldDatePicker'
import { TIMELINE_DATE_FIELDS, parseMilestones, type Milestone } from '../constants/timelineDates'
import LocationMapSection from '../components/LocationMapSection'
import QuestSubstepsSection, { parseSubsteps } from '../components/QuestSubstepsSection'
import type { Substep } from '../components/QuestSubstepsSection'
import QuestRewardSection, { parseRewards } from '../components/QuestRewardSection'
import type { Reward } from '../components/QuestRewardSection'
import { NewWebModal } from './RelationsPage'
import { RelationWebPreview } from '../components/RelationWebPreview'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'

// ── Article type definitions ───────────────────────────────────────────────────
// Colors come from the shared ARTICLE_TYPE_COLORS map (single source of truth);
// only label + icon are defined here.

const ARTICLE_TYPES: { value: ArticleType; label: string; icon: any; color: string }[] = [
  { value: 'character',       label: 'Character',    icon: User,        color: ARTICLE_TYPE_COLORS.character },
  { value: 'playerCharacter', label: 'Player Char',  icon: User,        color: ARTICLE_TYPE_COLORS.playerCharacter },
  { value: 'creature',        label: 'Creature',     icon: PawPrint,    color: ARTICLE_TYPE_COLORS.creature },
  { value: 'location',        label: 'Location',     icon: MapPin,      color: ARTICLE_TYPE_COLORS.location },
  { value: 'faction',         label: 'Faction',      icon: Users,       color: ARTICLE_TYPE_COLORS.faction },
  { value: 'organization',    label: 'Organization', icon: Users,       color: ARTICLE_TYPE_COLORS.organization },
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

const ARTICLE_TRACKS: Partial<Record<ArticleType, Record<string, string[]>>> = {
  character: {
    Vitality:      ['Alive', 'Dead', 'Unknown', 'Missing', 'Immortal'],
    Death_Date:    [],
    Attitude:    ['Friendly', 'Neutral', 'Hostile'],
    Attitude_Towards_Party: ['Friendly', 'Neutral', 'Hostile', 'Unknown'],
    Age:         [],
    Species:     ['Human', 'Elf', 'High Elf', 'Drow', 'Half-Elf', 'Dwarf', 'Duergar', 'Halfling', 'Gnome', 'Deep Gnome', 'Half-Orc', 'Orc',
                  'Tiefling', 'Dragonborn', 'Aasimar', 'Owlin', 'Aarakocra', 'Tortle', 'Goliath', 'Lizardfolk', 'Tabaxi',
                  'Water Genasi', 'Fire Genasi', 'Air Genasi', 'Earth Genasi'],
    Royal_Title: ['Duke', 'Duchess', 'Lord', 'Lady', 'King', 'Queen', 'Prince', 'Princess', 'Emperor', 'Empress', 'Disowned', 'Revoked Title'],
    Title:       ['Professor', 'Captain', 'General', 'Admiral', 'Archmage', 'High Priest'],
    Location:    [],
    Culture:     [],
  },
  playerCharacter: {
    Vitality:      ['Alive', 'Dead', 'Unknown', 'Retired', 'Immortal'],
    Death_Date:    [],
    Disposition: ['Friendly', 'Neutral', 'Hostile'],
    Age:         [],
    Species:     ['Human', 'Elf', 'High Elf', 'Drow', 'Half-Elf', 'Dwarf', 'Duergar', 'Halfling', 'Gnome', 'Deep Gnome', 'Half-Orc', 'Orc',
                  'Tiefling', 'Dragonborn', 'Aasimar', 'Owlin', 'Aarakocra', 'Tortle', 'Goliath', 'Lizardfolk', 'Tabaxi',
                  'Water Genasi', 'Fire Genasi', 'Air Genasi', 'Earth Genasi'],
    Royal_Title: ['Duke', 'Duchess', 'Lord', 'Lady', 'King', 'Queen', 'Prince', 'Princess', 'Emperor', 'Empress', 'Disowned', 'Revoked Title'],
    Title:       ['Professor', 'Captain', 'General', 'Admiral', 'Archmage', 'High Priest'],
    Location:    [],
    Culture:     [],
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
    Size:   ['Room', 'Building', 'Village', 'Town', 'City', 'Metropolis', 'Duchy', 'Kingdom', 'Empire', 'Continent', 'World', 'Ruins', 'Dungeon', 'Wilderness', 'Landmark', 'Natural Wonder'],
    Plane:  ['Material Plane', 'The Nine Hells', 'The Abyss', 'Ethereal Plane', 'Shadowfell', 'Feywild', 'Elemental Plane', 'Astral Plane'],
    Within: [],
  },
  faction: {
    Status: ['Active', 'Disbanded', 'Unknown'],
    Scale:  ['Local', 'Regional', 'National', 'Global', 'Secret'],
    Leader: [],
    HQ:     [],
    Follower_Count: [],
    Allies: [],
    Rivals: [],
  },
  organization: {
    Status: ['Active', 'Disbanded', 'Unknown'],
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
    Quest_Giver:      [],
    Player_Character: [],
  },
  item: {
    Status:   ['Found', 'Lost', 'Destroyed', 'Unknown'],
    Rarity:   ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'],
    Location: [],
  },
  event: {
    Status:        ['Upcoming', 'Ongoing', 'Past'],
    Scale:         ['Personal', 'Local', 'Regional', 'World-shaking'],
    In_World_Date: [],
  },
  culture:  { Status: ['Active', 'Undercover', 'Extinct', 'Unknown'] },
  religion: {
    Status:         ['Active', 'Undercover', 'Extinct', 'Unknown'],
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

const TRACK_VALUE_COLORS: Record<string, string> = {
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
  Common: '#8a8a8a', Uncommon: '#3dbf7f', Rare: '#5b9fe8',
  'Very Rare': '#b07de8', Legendary: '#e8d44d', Artifact: '#c8a84b',
  Personal: '#8a8a8a', Local: '#5bbfb0', Regional: '#5b9fe8',
  National: '#b07de8', Global: '#e88c3a', Secret: '#e05555', 'World-shaking': '#e05555',
  Tiny: '#8a8a8a', Small: '#5bbfb0', Large: '#e88c3a', Huge: '#e05555', Gargantuan: '#8b2533',
}

// Date tracks hold JSON (e.g. {"day":3,"year":1507}) and shouldn't become tags.
const NON_TAG_TRACKS = new Set(['In_World_Date', 'Death_Date', 'Timeline_Milestones'])

// A plain enum/text track value becomes a tag; JSON values (date pickers,
// milestone lists) and any *_Date field are skipped so they never leak in.
function isTaggableTrack(key: string, value: string): boolean {
  if (NON_TAG_TRACKS.has(key)) return false
  if (key.endsWith('_Date')) return false
  const v = value.trim()
  if (!v) return false
  if (v.startsWith('{') || v.startsWith('[')) return false
  return true
}

function getTrackTags(tracks: Record<string, string>): string[] {
  return Object.entries(tracks)
    .filter(([k, v]) => isTaggableTrack(k, v))
    .map(([, v]) => v.toLowerCase().replace(/\s+/g, '-'))
}

// Parse a stored tags array, dropping any JSON-fragment garbage that earlier
// leaked in from date/milestone tracks (never present in legitimate tags).
function parseTags(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr.filter((t): t is string => typeof t === 'string' && t.trim() !== '' && !/[{}[\]"]/.test(t))
  } catch { return [] }
}

function formatTrackName(key: string): string {
  if (key === 'Within') return 'Located within'
  return key.replace(/_/g, ' ')
}

const ALL_FILTERS = [
  { value: 'all', label: 'All', icon: BookOpen, color: 'var(--text-secondary)' },
  ...ARTICLE_TYPES,
]

const imgBtnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-light)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 5,
}

const addBannerStyle: React.CSSProperties = {
  width: '100%', padding: '12px', background: 'var(--bg-elevated)',
  border: 'none', borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  transition: 'background var(--transition)',
}

const sidebarSectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
}

// ─── Track Row ─────────────────────────────────────────────────────────────────

function TrackRow({ trackKey, name, options, value, onChange, dynamicOptions }: {
  trackKey: string; name: string; options: string[]; value: string
  onChange: (v: string) => void; dynamicOptions?: string[]
}) {
  const resolvedOptions = dynamicOptions ?? options
  const isCustomOnly = dynamicOptions === undefined && options.length === 0
  const [customMode, setCustomMode] = useState(() => isCustomOnly || (value !== '' && !resolvedOptions.includes(value)))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCustomMode(isCustomOnly || (value !== '' && !resolvedOptions.includes(value)))
  }, [trackKey])

  useEffect(() => {
    if (customMode && !isCustomOnly) inputRef.current?.focus()
  }, [customMode])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0 }}>{formatTrackName(name)}</span>
      {customMode ? (
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <input ref={inputRef} className="input" style={{ height: 28, fontSize: 12, flex: 1 }}
            value={value} placeholder={isCustomOnly ? `${name}…` : 'Custom…'}
            onChange={e => onChange(e.target.value)} />
          {!isCustomOnly && (
            <button onClick={() => { setCustomMode(false); onChange('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          )}
        </div>
      ) : (
        <select className="input" style={{ height: 28, fontSize: 12, flex: 1 }} value={value}
          onChange={e => { if (e.target.value === '__custom__') { setCustomMode(true); onChange('') } else onChange(e.target.value) }}>
          <option value="">— none —</option>
          {resolvedOptions.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__custom__">Custom…</option>
        </select>
      )}
    </div>
  )
}

// ─── Create Modal ──────────────────────────────────────────────────────────────

function CreateArticleModal({ onClose }: { onClose: () => void }) {
  const { createArticle } = useStore()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ArticleType>('location')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSaving(true); setError('')
    try {
      await createArticle({ title: title.trim(), article_type: type })
      onClose()
    } catch { setSaving(false); setError('Failed — title may already exist.') }
  }

  const PLACEHOLDERS = ['Neverwinter…', 'Waterdeep…', 'Gandalf the Grey…', 'Gerome the Gnome…']
  const randomPlaceholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Article</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Title</label>
            <input className="input" placeholder={randomPlaceholder} value={title}
              onChange={e => setTitle(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            {error && <div style={{ fontSize: 12, color: '#e05555', marginTop: 4 }}>{error}</div>}
          </div>
          <div className="input-group">
            <label className="input-label">Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ARTICLE_TYPES.map(t => {
                const Icon = t.icon
                const active = t.value === type
                return (
                  <button key={t.value} onClick={() => setType(t.value)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99,
                    border: `1px solid ${active ? t.color : 'var(--border-light)'}`,
                    background: active ? `${t.color}18` : 'transparent',
                    color: active ? t.color : 'var(--text-muted)',
                    fontSize: 12, cursor: 'pointer', transition: 'all 120ms ease',
                  }}>
                    <Icon size={12} /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!title.trim() || saving}>
            {saving ? 'Creating…' : 'Create Article'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({ article, onOpen }: { article: ArticleSummary; onOpen: () => void }) {
  const typeInfo = ARTICLE_TYPES.find(t => t.value === article.article_type) || ARTICLE_TYPES[ARTICLE_TYPES.length - 1]
  const Icon = typeInfo.icon
  const tags = parseTags(article.tags)
  const { wikiSearchFields } = useStore()

  return (
    <div className="card card-clickable" style={{ padding: 0, cursor: 'pointer', overflow: 'hidden' }} onClick={onOpen}>
      {article.cover_image ? (
        <div style={{ height: 100, overflow: 'hidden', flexShrink: 0 }}>
          <img src={`file://${article.cover_image}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <div style={{ height: 6, background: `${typeInfo.color}44`, flexShrink: 0 }} />
      )}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, border: `1px solid ${typeInfo.color}55`, background: `${typeInfo.color}12`, fontSize: 10, color: typeInfo.color, fontWeight: 600 }}>
            <Icon size={9} /> {typeInfo.label}
          </div>
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.title}
        </h3>
        {tags.length > 0 && wikiSearchFields.tags && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {tags.slice(0, 3).map(tag => (
              <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                #{tag}
              </span>
            ))}
            {tags.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{tags.length - 3}</span>}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={10} />
          Updated {new Date(article.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}

// ─── Article Menu ──────────────────────────────────────────────────────────────

function ArticleMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useMenuClose(open, menuRef, v => { if (!v) setConfirmDelete(false); setOpen(v) })

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setOpen(o => !o); setConfirmDelete(false) }} style={{ color: 'var(--text-muted)' }}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 140, zIndex: 50, overflow: 'hidden' }}>
          <button
            onClick={e => { e.stopPropagation(); if (!confirmDelete) { setConfirmDelete(true); return } onDelete(); setOpen(false) }}
            className="menu-item menu-item-danger" style={confirmDelete ? { color: 'var(--danger-hover)' } : undefined}>
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Article Relations Panel ────────────────────────────────────────────────────

interface ArticleRelationRow {
  edge_id: number
  web_id: number
  web_name: string
  from_node_id: number
  to_node_id: number
  from_article_id: number | null
  to_article_id: number | null
  from_article_title: string | null
  to_article_title: string | null
  from_node_label: string
  to_node_label: string
  from_vitality: string | null
  to_vitality: string | null
  label_from: string
  label_to: string
  is_rank?: boolean
}

// List the relation webs linked to this article, and create a new one (any
// template) pre-linked to it via the shared New-web modal.
// Article-type-specific suggestion for what a web living inside this article could map.
function webSectionHint(articleType: ArticleType): string {
  switch (articleType) {
    case 'faction':
    case 'organization':
      return 'Map a structure within this organisation — its chain of command, ranks, cells, or alliances and rivalries between members.'
    case 'religion':
      return 'Map a structure within this faith — its clergy hierarchy, sects, holy orders, or pantheon of deities.'
    case 'location':
      return 'Map a structure rooted in this place — the ruling council or court, the noble houses, or the guilds and factions that operate here.'
    case 'character':
    case 'playerCharacter':
      return 'Map this character’s personal web — their household and retinue, family tree, or circle of allies and rivals.'
    case 'culture':
      return 'Map the social fabric of this culture — its clans, castes, or kinship and lineage ties.'
    case 'creature':
      return 'Map a structure for this creature — a pack, swarm, hive, or brood and its hierarchy.'
    case 'quest':
      return 'Map this quest’s shape — its branching steps, dependencies, or the factions pulling its strings.'
    default:
      return 'Add an optional hierarchy, family tree, or other relation web tied to this article.'
  }
}

function RelationWebsSection({ articleId, articleTitle, articleType, canCreate, webs, loaded, onReload, onOpenWeb }: {
  articleId: number
  articleTitle: string
  articleType: ArticleType
  canCreate: boolean
  webs: any[]
  loaded: boolean
  onReload: () => void
  onOpenWeb: (webId: number) => void
}) {
  const [showCreate, setShowCreate] = useState(false)

  if (!loaded) return null
  // In read mode with no linked webs, show nothing — creation is edit-only.
  if (!canCreate && webs.length === 0) return null

  const btnStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px',
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left',
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={sidebarSectionLabel}>Webs</div>
      {canCreate && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 8 }}>
          {webSectionHint(articleType)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {webs.map(w => (
          <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button style={btnStyle} onClick={() => onOpenWeb(w.id)}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
              <Network size={13} color="#7F77DD" />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.node_count} node{w.node_count !== 1 ? 's' : ''}</span>
            </button>
            <RelationWebPreview webId={w.id} webName={w.name} onOpen={() => onOpenWeb(w.id)} />
          </div>
        ))}
        {canCreate && (
          <button style={{ ...btnStyle, borderStyle: 'dashed', justifyContent: 'center', color: '#7F77DD' }}
            onClick={() => setShowCreate(true)}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
            <Plus size={13} /> Create web
          </button>
        )}
      </div>
      {showCreate && (
        <NewWebModal
          lockedArticle={{ id: articleId, title: articleTitle }}
          onClose={() => setShowCreate(false)}
          onCreated={(w: any) => { setShowCreate(false); onReload(); onOpenWeb(w.id) }}
        />
      )}
    </div>
  )
}

// Named member count: article-backed members (characters with Faction/Religion → this).
function MemberCountSection({ articleId, followerEstimate }: { articleId: number; followerEstimate?: string }) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!articleId) return
    ;(window as any).api.getArticleMemberCount(articleId).then((c: number) => setCount(c))
  }, [articleId])
  if (count === null) return null
  const est = (followerEstimate || '').trim()
  if (!est && count === 0) return null
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Followers</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
        {est ? est : '—'}<span style={{ color: 'var(--text-muted)' }}> · {count} named</span>
      </span>
    </div>
  )
}

// Derived, read-only affiliations for characters/PCs. The faction/org/religion
// articles that own a web this character is a node in. Webs are the source of
// truth — these fields are computed, never stored, so they can't drift.
function AffiliationsSection({ articleId }: { articleId: number }) {
  const { navigateToArticleByTitle } = useStore()
  const [items, setItems] = useState<{ id: number; title: string; article_type: string }[]>([])

  useEffect(() => {
    if (!articleId) return
    ;(window as any).api.getArticleAffiliations(articleId).then((a: any[]) => setItems(a || []))
  }, [articleId])

  const religion = items.find(a => a.article_type === 'religion')
  const factions = items.filter(a => a.article_type === 'faction' || a.article_type === 'organization')
  if (!religion && factions.length === 0) return null

  const chip = (a: { id: number; title: string; article_type: string }) => {
    const color = ARTICLE_TYPE_COLORS[a.article_type] || '#8a8a8a'
    return (
      <button
        key={a.id}
        onClick={() => navigateToArticleByTitle(a.title)}
        title={`Go to ${a.title}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
          borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          border: `1px solid ${color}44`, background: `${color}12`, color,
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${color}22`}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${color}12`}
      >
        <ExternalLink size={10} /> {a.title}
      </button>
    )
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={sidebarSectionLabel}>Affiliations</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
        From relation webs
      </div>
      {religion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: factions.length ? 8 : 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 56, flexShrink: 0 }}>Religion</span>
          {chip(religion)}
        </div>
      )}
      {factions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 56, flexShrink: 0, paddingTop: 3 }}>
            Faction{factions.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {factions.map(chip)}
          </div>
        </div>
      )}
    </div>
  )
}

// Derived, read-only geography for a location: the containment path up the
// "Within" chain (root-first) plus the locations nested directly inside it.
function GeographySection({ articleId, reloadKey }: { articleId: number; reloadKey?: unknown }) {
  const { navigateToArticleByTitle } = useStore()
  const [data, setData] = useState<{ ancestors: { id: number; title: string }[]; children: { id: number; title: string }[] }>({ ancestors: [], children: [] })

  useEffect(() => {
    if (!articleId) return
    ;(window as any).api.getArticleGeography(articleId).then((d: any) => setData(d || { ancestors: [], children: [] }))
  }, [articleId, reloadKey])

  const { ancestors, children } = data
  if (ancestors.length === 0 && children.length === 0) return null

  const color = ARTICLE_TYPE_COLORS.location || '#c8a84b'
  const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    fontSize: 12, color, fontWeight: 500, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
  const chip = (c: { id: number; title: string }) => (
    <button key={c.id} onClick={() => navigateToArticleByTitle(c.title)} title={`Go to ${c.title}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px',
        borderRadius: 99, fontSize: 11, cursor: 'pointer',
        border: `1px solid ${color}44`, background: `${color}12`, color,
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${color}22`}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${color}12`}>
      {c.title}
    </button>
  )

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={sidebarSectionLabel}>Geography</div>

      {ancestors.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: children.length ? 10 : 0 }}>
          {ancestors.map((a, i) => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
              <button onClick={() => navigateToArticleByTitle(a.title)} title={`Go to ${a.title}`} style={linkStyle}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.textDecoration = 'underline'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.textDecoration = 'none'}>
                {a.title}
              </button>
            </span>
          ))}
          <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>here</span>
        </div>
      )}

      {children.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Contains <span style={{ fontWeight: 400 }}>· {children.length}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {children.map(chip)}
          </div>
        </div>
      )}
    </div>
  )
}

function ArticleRelationsPanel({
  articleId,
  onOpenWeb,
}: {
  articleId: number
  onOpenWeb: (webId: number) => void
}) {
  const { currentCampaign } = useStore()
  const [rows, setRows] = useState<ArticleRelationRow[]>([])

  useEffect(() => {
    if (!currentCampaign || !articleId) return
    ;(window as any).api.getArticleRelations(articleId, currentCampaign.id).then(setRows)
  }, [articleId, currentCampaign?.id])

  if (rows.length === 0) return null

  // Group by web
  const byWeb = rows.reduce<Record<number, { webName: string; rows: ArticleRelationRow[] }>>(
    (acc, row) => {
      if (!acc[row.web_id]) acc[row.web_id] = { webName: row.web_name, rows: [] }
      acc[row.web_id].rows.push(row)
      return acc
    },
    {}
  )

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 16px 4px' }}>
        <div style={sidebarSectionLabel}>Relations</div>
      </div>
      {Object.entries(byWeb).map(([webIdStr, { webName, rows: webRows }]) => (
        <div key={webIdStr}>
          <button
            onClick={() => onOpenWeb(Number(webIdStr))}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 16px 3px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '1px solid var(--border-light)', transition: 'color var(--transition)', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >
            <Network size={10} /> {webName}
          </button>
          {webRows.map(row => {
            // Rank is an attribute of the current article, not a link — render it as a label line.
            if (row.is_rank) {
              return (
                <div key={row.edge_id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 16px' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{row.to_node_label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>rank</span>
                </div>
              )
            }
            const isFrom = row.from_article_id === articleId
            const otherName = isFrom
              ? (row.to_article_title || row.to_node_label)
              : (row.from_article_title || row.from_node_label)
            const relationLabel = isFrom ? row.label_to : row.label_from
            const otherLinked = isFrom ? row.to_article_id !== null : row.from_article_id !== null
            const otherVitality = isFrom ? row.to_vitality : row.from_vitality
            const dead = otherVitality === 'Dead'

            return (
              <div
                key={row.edge_id}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 16px', cursor: 'default' }}
              >
                {dead && <Skull size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: otherLinked ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: otherLinked ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {otherName}
                </span>
                {relationLabel && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{relationLabel}</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ height: 8 }} />
    </div>
  )
}

// ─── Article Editor ────────────────────────────────────────────────────────────

// ── Creature variant types ─────────────────────────────────────────────────────

interface CreatureVariant {
  id: string
  name: string
  cr: string
  statblock: ReturnType<typeof parseStatBlock>
  loot_table_id: number | null
  loot_table: string  // JSON LootTable
}

function parseCreatureVariants(raw: string): CreatureVariant[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && 'name' in parsed[0]) {
      return parsed.map(v => ({
        id: v.id || `v_${Math.random().toString(36).slice(2)}`,
        name: v.name || 'Variant',
        cr: v.cr || '—',
        statblock: parseStatBlock(typeof v.statblock === 'string' ? v.statblock : JSON.stringify(v.statblock)),
        loot_table_id: v.loot_table_id ?? null,
        loot_table: v.loot_table || '{"name":"Loot","items":[]}',
      }))
    }
  } catch {}
  // Legacy: single statblock object → wrap as one variant
  const sb = parseStatBlock(raw)
  if (sb.hp > 0 || sb.ac > 0 || sb.actions.length > 0) {
    return [{ id: 'v_legacy', name: 'Standard', cr: '—', statblock: sb, loot_table_id: null, loot_table: '{"name":"Loot","items":[]}' }]
  }
  return []
}

const STATBLOCK_TYPES: ArticleType[] = ['character', 'playerCharacter']
const LOOT_TYPES: ArticleType[] = ['character', 'playerCharacter']

// ── Creature Variants Section ──────────────────────────────────────────────────

function CreatureVariantsSection({
  variants, masterTables, readMode, articleTitle, lootSuggestions, onChange,
}: {
  variants: CreatureVariant[]
  masterTables: MasterLootTable[]
  readMode: boolean
  articleTitle: string
  lootSuggestions: string[]
  onChange: (v: CreatureVariant[]) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(variants[0]?.id ?? null)

  const addVariant = () => {
    const id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const newV: CreatureVariant = {
      id, name: 'New Variant', cr: '',
      statblock: parseStatBlock('{}'),
      loot_table_id: null,
      loot_table: '{"name":"Loot","items":[]}',
    }
    onChange([...variants, newV])
    setExpandedId(id)
  }

  const updateVariant = (id: string, patch: Partial<CreatureVariant>) => {
    onChange(variants.map(v => v.id === id ? { ...v, ...patch } : v))
  }

  const removeVariant = (id: string) => {
    const next = variants.filter(v => v.id !== id)
    onChange(next)
    if (expandedId === id) setExpandedId(next[0]?.id ?? null)
  }

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Variants</div>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
      </div>

      {variants.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 13 }}>No variants yet</span>
          {!readMode && <span style={{ fontSize: 11 }}>Add a variant to define combat stats for this creature</span>}
        </div>
      )}

      {variants.map(variant => {
        const isOpen = expandedId === variant.id
        const masterTable = masterTables.find(t => t.id === variant.loot_table_id)
        const extrasTable = parseLootTable(variant.loot_table)
        const sbHasData = variant.statblock.hp > 0 || variant.statblock.ac > 0 || variant.statblock.actions.length > 0

        return (
          <div key={variant.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 8, overflow: 'hidden' }}>
            {/* Header row */}
            <div
              onClick={() => setExpandedId(isOpen ? null : variant.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: isOpen ? 'var(--bg-elevated)' : 'transparent', transition: 'background var(--transition)' }}
            >
              {isOpen ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
              {readMode ? (
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{variant.name}</span>
              ) : (
                <input
                  value={variant.name}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateVariant(variant.id, { name: e.target.value })}
                  style={{ fontWeight: 600, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', flex: 1, minWidth: 0 }}
                  placeholder="Variant name…"
                />
              )}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 99, padding: '1px 8px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                CR {readMode ? (variant.cr || '—') : (
                  <select
                    value={CR_OPTIONS.includes(variant.cr) ? variant.cr : ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateVariant(variant.id, { cr: e.target.value })}
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: 11, color: 'var(--text-secondary)', padding: '1px 2px' }}
                  >
                    <option value="">—</option>
                    {CR_OPTIONS.map(cr => <option key={cr} value={cr}>{cr}</option>)}
                  </select>
                )}
              </span>
              {(() => {
                const xp = crToXp(variant.cr)
                return (
                  <span
                    title={xp === null ? 'Unrecognized CR — no XP' : `${xp.toLocaleString()} XP`}
                    style={{ fontSize: 11, color: xp === null ? 'var(--text-muted)' : 'var(--gold)', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 99, padding: '1px 8px', flexShrink: 0 }}
                  >
                    {xp === null ? '— XP' : `${xp.toLocaleString()} XP`}
                  </span>
                )
              })()}
              {masterTable && (
                <span style={{ fontSize: 10, color: '#49c185', background: '#49c18514', border: '1px solid #49c18530', borderRadius: 99, padding: '1px 7px', flexShrink: 0 }}>
                  {masterTable.name}
                </span>
              )}
              {!readMode && variants.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); removeVariant(variant.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0 }}
                  title="Remove variant"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Expanded body */}
            {isOpen && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Stat block */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Stat Block</div>
                  {readMode ? (
                    sbHasData
                      ? <StatBlockView statblock={variant.statblock} name={variant.name} articleType="creature" />
                      : <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No stat block — switch to Edit to add</div>
                  ) : (
                    <StatBlockEditor
                      value={variant.statblock}
                      onChange={sb => updateVariant(variant.id, { statblock: sb })}
                    />
                  )}
                </div>

                {/* Loot */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Loot</div>
                  {/* Master table picker */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Master loot table</div>
                    {readMode ? (
                      masterTable
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, background: '#49c18518', border: '1px solid #49c18540', fontSize: 12, color: '#49c185', width: 'fit-content' }}>
                            <ShoppingBag size={11} /> {masterTable.name}
                          </div>
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No master table</span>
                    ) : (
                      <select
                        className="input" style={{ fontSize: 12 }}
                        value={variant.loot_table_id ?? ''}
                        onChange={e => updateVariant(variant.id, { loot_table_id: e.target.value ? parseInt(e.target.value) : null })}
                      >
                        <option value="">— None —</option>
                        {(['creature', 'vendor', 'location', 'custom'] as const).map(cat => {
                          const group = masterTables.filter(t => t.category === cat)
                          if (!group.length) return null
                          const labels: Record<string, string> = { creature: 'Creature', vendor: 'Vendor', location: 'Location', custom: 'Custom' }
                          return (
                            <optgroup key={cat} label={labels[cat]}>
                              {group.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </optgroup>
                          )
                        })}
                      </select>
                    )}
                  </div>
                  {/* Master table preview */}
                  {readMode && masterTable && (() => {
                    let items: LootItem[] = []
                    try { items = JSON.parse(masterTable.items) } catch {}
                    if (!items.length) return null
                    return <div style={{ marginBottom: 8 }}><LootTableView label={`From ${masterTable.name}`} items={items} tableBadge={masterTable.name} wikiTitles={[]} onItemClick={() => {}} emptyMessage="" /></div>
                  })()}
                  {/* Inline extra items */}
                  {readMode ? (
                    <LootTableView
                      label={masterTable ? 'Extra drops' : 'Loot'}
                      items={extrasTable.items}
                      wikiTitles={[]}
                      onItemClick={() => {}}
                      emptyMessage="No extra items"
                    />
                  ) : (
                    <LootTableEditor
                      value={extrasTable}
                      onChange={t => updateVariant(variant.id, { loot_table: JSON.stringify(t) })}
                      suggestions={lootSuggestions}
                      showPriceWeight
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {!readMode && (
        <button
          onClick={addVariant}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', width: '100%', justifyContent: 'center', transition: 'all var(--transition)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
        >
          <Plus size={13} /> Add variant
        </button>
      )}
    </div>
  )
}

function TimelineDatesSection({ articleType, tracks, setTracks, setDirty, readMode, baseYear }: {
  articleType: ArticleType
  tracks: Record<string, string>
  setTracks: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setDirty: (v: boolean) => void
  readMode: boolean
  baseYear: number
}) {
  // Skip semantic fields already shown in Details (e.g. character Death_Date).
  const typeTracks = ARTICLE_TRACKS[articleType] || {}
  const fields = (TIMELINE_DATE_FIELDS[articleType] ?? []).filter(f => !(f.key in typeTracks))
  const milestones = parseMilestones(tracks.Timeline_Milestones)

  const setField = (key: string, v: string) => { setTracks(prev => ({ ...prev, [key]: v })); setDirty(true) }
  const setMilestones = (list: Milestone[]) => { setTracks(prev => ({ ...prev, Timeline_Milestones: JSON.stringify(list) })); setDirty(true) }
  const addMilestone = () => setMilestones([...milestones, { id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: '', date: '' }])
  const updateMilestone = (id: string, patch: Partial<Milestone>) => setMilestones(milestones.map(m => m.id === id ? { ...m, ...patch } : m))
  const removeMilestone = (id: string) => setMilestones(milestones.filter(m => m.id !== id))

  const fmt = (raw: string) => { try { const d = JSON.parse(raw); return `Day ${d.day}, Year ${d.year}` } catch { return raw } }
  const setFields = [...fields.filter(f => tracks[f.key])]
  const setMs = milestones.filter(m => m.date)

  return (
    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={sidebarSectionLabel}>Timeline</div>
      {readMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {setFields.map(f => (
            <div key={f.key} style={{ fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>{f.label}: </span><span style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmt(tracks[f.key])}</span></div>
          ))}
          {setMs.map(m => (
            <div key={m.id} style={{ fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>{m.label || 'Milestone'}: </span><span style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmt(m.date)}</span></div>
          ))}
          {setFields.length === 0 && setMs.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— not on timeline —</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fields.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{f.label}</div>
              <InWorldDatePicker value={tracks[f.key] || ''} onChange={v => setField(f.key, v)} label="" baseYear={baseYear} />
            </div>
          ))}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Milestones</span>
              <button onClick={addMilestone} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, background: 'none', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 7px' }}><Plus size={11} /> Add</button>
            </div>
            {milestones.map(m => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8, padding: 8, border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input" value={m.label} onChange={e => updateMilestone(m.id, { label: e.target.value })} placeholder="Label (e.g. Rebuilt)" style={{ flex: 1, minWidth: 0, fontSize: 12, height: 28 }} />
                  <button onClick={() => removeMilestone(m.id)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}><X size={13} /></button>
                </div>
                <InWorldDatePicker value={m.date} onChange={v => updateMilestone(m.id, { date: v })} label="" baseYear={baseYear} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ArticleEditor({ article, onBack, backLabel = 'Back to Wiki' }: { article: Article; onBack: () => void; backLabel?: string }) {
  const { updateArticle, deleteArticle, navigateToArticleByTitle, getArticleBacklinks, currentCampaign, articles, setView, setRelationsOpenWebId, setRelationsFocusArticleId, setHintContext } = useStore()

  const [factionNames, setFactionNames]       = useState<string[]>([])
  const [organizationNames, setOrgNames]      = useState<string[]>([])
  const [religionNames, setReligionNames]     = useState<string[]>([])
  const [cultureNames, setCultureNames]       = useState<string[]>([])
  const [locationNames, setLocationNames]     = useState<string[]>([])
  const [creatureNames, setCreatureNames]     = useState<string[]>([])
  const [characterNames, setCharacterNames]   = useState<string[]>([])
  const [playerCharacterNames, setPlayerCharacterNames] = useState<string[]>([])
  const [masterTables, setMasterTables]       = useState<MasterLootTable[]>([])

  const [title, setTitle]             = useState(article.title)
  const [content, setContent]         = useState(article.content)
  const [articleType, setArticleType] = useState<ArticleType>(article.article_type as ArticleType)
  const [tracks, setTracks]           = useState<Record<string, string>>(() => { try { return JSON.parse(article.tracks) } catch { return {} } })
  const [statblock, setStatblock]     = useState(() => parseStatBlock(article.statblock))
  const [variants, setVariants]       = useState<CreatureVariant[]>(() => parseCreatureVariants(article.statblock))
  const [itemBlock, setItemBlock]     = useState(() => parseItemStatBlock(article.item_block))
  const [tags, setTags]               = useState<string[]>(() => parseTags(article.tags))
  const [tagInput, setTagInput]       = useState('')
  const [coverImage, setCoverImage]   = useState<string | null>(article.cover_image || null)
  const [portraitImage, setPortraitImage] = useState<string | null>(article.portrait_image || null)
  const [backlinks, setBacklinks]     = useState<ArticleSummary[]>([])
  const [relationWebs, setRelationWebs] = useState<any[]>([])
  const [relationWebsLoaded, setRelationWebsLoaded] = useState(false)
  const [memberWebs, setMemberWebs] = useState<any[]>([])
  const [dirty, setDirty]             = useState(false)
  const [saving, setSaving]           = useState(false)
  const [readMode, setReadMode]       = useState(true)
  const [savedTick, setSavedTick]     = useState(0)   // bumped after each save — refreshes derived sections

  // Floating hint follows the article mode: reading vs. editing
  useEffect(() => {
    setHintContext(readMode ? 'wiki-article-read' : 'wiki-linking')
    return () => setHintContext(null)
  }, [readMode, setHintContext])

  // Loot — inline extras JSON (extra items layered on top of any linked master table)
  const [lootTableJson, setLootTableJson] = useState(article.loot_table || '{"name":"Loot","items":[]}')
  // Master table FK
  const [lootTableId, setLootTableId] = useState<number | null>(article.loot_table_id ?? null)
  // Quest substeps
  const [substeps, setSubsteps] = useState<Substep[]>(() => parseSubsteps((article as any).substeps))
  // Quest rewards
  const [rewards, setRewards]   = useState<Reward[]>(() => parseRewards((article as any).rewards))

  const hasStatblock = STATBLOCK_TYPES.includes(articleType)
  const hasItemBlock = articleType === 'item'
  const hasLoot      = LOOT_TYPES.includes(articleType)
  const hasMap       = articleType === 'location'
  const hasQuest     = articleType === 'quest'

  const pendingRef = useRef({ title, content, articleType, tracks, statblock, variants, lootTableJson, lootTableId, tags, coverImage, portraitImage, dirty, id: article.id, substeps, rewards })
  pendingRef.current = { title, content, articleType, tracks, statblock, variants, lootTableJson, lootTableId, tags, coverImage, portraitImage, dirty, id: article.id, substeps, rewards }

  useEffect(() => {
    return () => {
      const p = pendingRef.current
      if (p.dirty) window.api.updateArticle(p.id, {
        title: p.title, content: p.content, article_type: p.articleType,
        tracks: JSON.stringify(p.tracks),
        statblock: p.articleType === 'creature' ? JSON.stringify(p.variants) : JSON.stringify(p.statblock),
        loot_table: p.lootTableJson, loot_table_id: p.lootTableId,
        tags: JSON.stringify(p.tags), cover_image: p.coverImage, portrait_image: p.portraitImage,
        substeps: JSON.stringify(p.substeps),
        rewards:  JSON.stringify(p.rewards),
      })
    }
  }, [])

  useEffect(() => {
    setTitle(article.title); setContent(article.content)
    setArticleType(article.article_type as ArticleType)
    setTracks(() => { try { return JSON.parse(article.tracks) } catch { return {} } })
    setStatblock(parseStatBlock(article.statblock))
    setVariants(parseCreatureVariants(article.statblock))
    setItemBlock(parseItemStatBlock(article.item_block))
    setTags(parseTags(article.tags))
    setCoverImage(article.cover_image || null); setPortraitImage(article.portrait_image || null)
    setLootTableJson(article.loot_table || '{"name":"Loot","items":[]}')
    setLootTableId(article.loot_table_id ?? null)
    setSubsteps(parseSubsteps((article as any).substeps))
    setRewards(parseRewards((article as any).rewards))
    setDirty(false)
  }, [article.id])

  useEffect(() => { getArticleBacklinks(article.title).then(setBacklinks) }, [article.title])

  const reloadRelationWebs = useCallback(() => {
    setRelationWebsLoaded(false)
    ;(window as any).api.listRelationWebsForArticle(article.id).then((ws: any[]) => {
      setRelationWebs(ws || []); setRelationWebsLoaded(true)
    })
    ;(window as any).api.listRelationWebsForMember(article.id).then((ws: any[]) => setMemberWebs(ws || []))
  }, [article.id])
  useEffect(() => { reloadRelationWebs() }, [reloadRelationWebs])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'faction' }).then(f => setFactionNames(f.map(a => a.title).sort()))
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'organization' }).then(o => setOrgNames(o.map(a => a.title).sort()))
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'religion' }).then(r => setReligionNames(r.map(a => a.title).sort()))
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'culture' }).then(c => setCultureNames(c.map(a => a.title).sort()))
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'creature' }).then(c => setCreatureNames(c.map(a => a.title).sort()))
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'location' }).then(l => setLocationNames(l.map(a => a.title).sort()))
    Promise.all([
      window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'character' }),
      window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'playerCharacter' }),
    ]).then(([chars, pcs]) => {
      setCharacterNames([...chars, ...pcs].map(a => a.title).sort())
      setPlayerCharacterNames(pcs.map(a => a.title).sort())
    })
    window.api.getLootTables(currentCampaign.id).then(setMasterTables)
  }, [currentCampaign?.id])

  const save = useCallback(async () => {
    if (!dirty) return
    setSaving(true)
    const statblockJson = articleType === 'creature' ? JSON.stringify(variants) : JSON.stringify(statblock)
    await updateArticle(article.id, {
      title, content, article_type: articleType,
      tracks: JSON.stringify(tracks), statblock: statblockJson,
      item_block: JSON.stringify(itemBlock),
      loot_table: lootTableJson, loot_table_id: lootTableId,
      tags: JSON.stringify(tags), cover_image: coverImage, portrait_image: portraitImage,
      substeps: JSON.stringify(substeps),
      rewards:  JSON.stringify(rewards),
    })
    setDirty(false); setSaving(false); setSavedTick(t => t + 1)
  }, [article.id, dirty, title, content, articleType, tracks, statblock, variants, itemBlock, lootTableJson, lootTableId, tags, coverImage, portraitImage, substeps, rewards, updateArticle])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 1500)
    return () => clearTimeout(t)
  }, [dirty, title, content, articleType, tracks, statblock, variants, lootTableJson, lootTableId, tags, coverImage, portraitImage])

  const pickImage = async (setter: (v: string | null) => void) => {
    const path = await window.api.selectImageFile()
    if (!path) return
    const full = await window.api.getImagePath(path)
    setter(full.replace('file://', '')); setDirty(true)
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t || tags.includes(t)) return
    setTags(prev => [...prev, t]); setTagInput(''); setDirty(true)
  }
  const removeTag = (tag: string) => { setTags(prev => prev.filter(t => t !== tag)); setDirty(true) }

  const currentTypeTracks = Object.entries(ARTICLE_TRACKS[articleType] || {})
  const statblockHasData = statblock.ac > 0 || statblock.hp > 0 || statblock.traits.length > 0 || statblock.actions.length > 0

  const lootSuggestions = articles.filter(a => ['item', 'artifact', 'note'].includes(a.article_type)).map(a => a.title)

  // For read-mode loot display — delegates to LootTableView
  const renderLootReadMode = (items: LootItem[], label: string, tableBadge?: string) => (
    <LootTableView
      label={label}
      items={items}
      tableBadge={tableBadge}
      wikiTitles={articles.map(a => a.title)}
      onItemClick={name => {
        if (articles.some(a => a.title.toLowerCase() === name.toLowerCase()))
          navigateToArticleByTitle(name)
      }}
      emptyMessage="No items — switch to Edit to add"
    />
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, display: 'flex', alignItems: 'stretch', minHeight: 48 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 16px', background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color var(--transition)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}>
          <ChevronLeft size={14} /> {backLabel}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', flex: 1, minWidth: 0 }}>
          <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true) }} readOnly={readMode}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.03em', width: '100%', cursor: readMode ? 'default' : 'text' }}
            placeholder="Article title…" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
          {readMode ? (
            <button className="btn btn-sm" onClick={() => setReadMode(false)}>Edit</button>
          ) : (
            <>
              {dirty
                ? <button className="btn btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : <><Check size={12} /> Save</>}</button>
                : <span style={{ fontSize: 11, color: 'var(--gold-dim)' }}>Saved</span>
              }
              <button className="btn btn-sm btn-ghost" onClick={() => setReadMode(true)}>Done</button>
            </>
          )}
          <ArticleMenu onDelete={async () => { await deleteArticle(article.id); onBack() }} />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Banner */}
        {coverImage ? (
          <div style={{ height: 200, position: 'relative', overflow: 'hidden' }}>
            <img src={`file://${coverImage}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
            {!readMode && (
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
                <button onClick={() => pickImage(setCoverImage)} style={imgBtnStyle}><ImageIcon size={11} /> Change banner</button>
                <button onClick={() => { setCoverImage(null); setDirty(true) }} style={{ ...imgBtnStyle, color: '#e05555', borderColor: 'rgba(224,85,85,0.4)' }}><X size={11} /> Remove</button>
              </div>
            )}
          </div>
        ) : !readMode ? (
          <button onClick={() => pickImage(setCoverImage)} style={addBannerStyle}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}>
            <ImageIcon size={13} /> Add banner image
          </button>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Type picker */}
            {!readMode && (
              <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {ARTICLE_TYPES.map(t => {
                  const Icon = t.icon; const active = t.value === articleType
                  return (
                    <button key={t.value} onClick={() => { setArticleType(t.value); setDirty(true) }} style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99,
                      border: `1px solid ${active ? t.color + '88' : 'var(--border-light)'}`,
                      background: active ? `${t.color}18` : 'transparent',
                      color: active ? t.color : 'var(--text-muted)',
                      fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
                    }}>
                      <Icon size={9} /> {t.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Editor */}
            <div style={{ padding: '0 8px' }}>
              <RichEditor key={article.id} content={content} onChange={v => { setContent(v); setDirty(true) }}
                placeholder="Start writing… Use [[ to link wiki articles, @@ for spells, \\\\ for sessions."
                onWikiLinkClick={navigateToArticleByTitle} expandable readOnly={readMode} />
            </div>

            {/* Stat block — non-creature types */}
            {hasStatblock && (
              <div style={{ padding: '0 24px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Stat Block</div>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
                </div>
                {readMode ? (
                  statblockHasData
                    ? <StatBlockView statblock={statblock} name={title} articleType={articleType} />
                    : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: 13 }}>No stat block yet</span>
                        <span style={{ fontSize: 11 }}>Switch to Edit mode to add combat stats</span>
                      </div>
                ) : <StatBlockEditor value={statblock} onChange={sb => { setStatblock(sb); setDirty(true) }} showLevel={articleType === 'playerCharacter' || articleType === 'character'} showCR={articleType === 'character'} />}
              </div>
            )}

            {/* Item stat block — magic-item "Wondrous item, uncommon" block */}
            {hasItemBlock && (
              <div style={{ padding: '0 24px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Item Stats</div>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
                </div>
                {readMode ? (
                  itemBlockHasData(itemBlock)
                    ? <ItemStatBlockView
                        itemBlock={itemBlock}
                        name={title}
                        image={portraitImage ? `file://${portraitImage}` : coverImage ? `file://${coverImage}` : null}
                      />
                    : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: 13 }}>No item stats yet</span>
                        <span style={{ fontSize: 11 }}>Switch to Edit mode to add type, rarity, and properties</span>
                      </div>
                ) : <ItemStatBlockEditor value={itemBlock} onChange={ib => {
                      setItemBlock(ib)
                      // Mirror the item-block rarity into the article's Rarity track —
                      // it drives the hover card, timeline and relation styling, and
                      // there's no separate input for it. Keep the auto-tags in sync too.
                      setTracks(prev => {
                        if ((prev.Rarity ?? '') === ib.rarity) return prev
                        const updated = { ...prev, Rarity: ib.rarity }
                        const oldTrackTags = getTrackTags(prev)
                        const newTrackTags = getTrackTags(updated)
                        setTags(prevTags => {
                          const manualTags = prevTags.filter(t => !oldTrackTags.includes(t))
                          return Array.from(new Set([...manualTags, ...newTrackTags]))
                        })
                        return updated
                      })
                      setDirty(true)
                    }} />}
              </div>
            )}

            {/* Creature variants section */}
            {articleType === 'creature' && (
              <CreatureVariantsSection
                variants={variants}
                masterTables={masterTables}
                readMode={readMode}
                articleTitle={title}
                lootSuggestions={lootSuggestions}
                onChange={v => { setVariants(v); setDirty(true) }}
              />
            )}

            {/* Map section */}
            {hasMap && (
              <div style={{ padding: '0 24px 32px' }}>
                <SectionDivider label="Maps" />
                <LocationMapSection articleId={article.id} readMode={readMode} campaignId={currentCampaign!.id} />
              </div>
            )}

            {/* Quest substeps section */}
            {hasQuest && (
              <div style={{ padding: '0 24px 32px' }}>
                <SectionDivider label="Substeps" />
                <QuestSubstepsSection
                  articleId={article.id}
                  substeps={substeps}
                  readMode={readMode}
                  onChange={steps => { setSubsteps(steps); setDirty(true) }}
                />
              </div>
            )}

            {/* Quest rewards section */}
            {hasQuest && (
              <div style={{ padding: '0 24px 32px' }}>
                <SectionDivider label="Rewards" />
                <QuestRewardSection
                  rewards={rewards}
                  readMode={readMode}
                  onChange={r => { setRewards(r); setDirty(true) }}
                />
              </div>
            )}

            {/* Loot / Inventory section */}
            {hasLoot && (() => {
              const extrasTable = parseLootTable(lootTableJson)
              const masterTable = masterTables.find(t => t.id === lootTableId)

              return (
                <div style={{ padding: '0 24px 32px' }}>
                  <SectionDivider label={extrasTable.name || 'Loot'} />

                  {/* Master loot table picker */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Master loot table
                    </div>
                    {readMode ? (
                      masterTable ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, background: '#49c18518', border: '1px solid #49c18540', fontSize: 12, color: '#49c185', width: 'fit-content' }}>
                          <ShoppingBag size={11} /> {masterTable.name}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No master table — using inline items only</span>
                      )
                    ) : (
                      <select className="input" style={{ fontSize: 12 }} value={lootTableId ?? ''} onChange={e => { setLootTableId(e.target.value ? parseInt(e.target.value) : null); setDirty(true) }}>
                        <option value="">— None (inline items only) —</option>
                        {(['creature', 'vendor', 'location', 'custom'] as const).map(cat => {
                          const group = masterTables.filter(t => t.category === cat)
                          if (group.length === 0) return null
                          const labels: Record<string, string> = { creature: 'Creature', vendor: 'Vendor', location: 'Location', custom: 'Custom' }
                          return (
                            <optgroup key={cat} label={labels[cat]}>
                              {group.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </optgroup>
                          )
                        })}
                      </select>
                    )}
                  </div>

                  {/* Show master table items preview in read mode */}
                  {readMode && masterTable && (() => {
                    let masterItems: LootItem[] = []
                    try { masterItems = JSON.parse(masterTable.items) } catch {}
                    if (masterItems.length === 0) return null
                    return (
                      <div style={{ marginBottom: 12 }}>
                        {renderLootReadMode(masterItems, `From ${masterTable.name}`, masterTable.name)}
                      </div>
                    )
                  })()}

                  {/* Extras / inline items */}
                  <div>
                    {readMode ? (
                      renderLootReadMode(
                        extrasTable.items,
                        masterTable ? 'Extra drops' : 'Loot',
                      )
                    ) : (
                      <LootTableEditor
                        value={extrasTable}
                        onChange={t => { setLootTableJson(JSON.stringify(t)); setDirty(true) }}
                        suggestions={lootSuggestions}
                        showPriceWeight={['creature', 'character', 'playerCharacter'].includes(articleType)}
                      />
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Right sidebar */}
          <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={sidebarSectionLabel}>{article.title}</div>
              {portraitImage ? (
                <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <img src={`file://${portraitImage}`} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                  {!readMode && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0, transition: 'all 200ms ease' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.5)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)' }}>
                      <button onClick={() => pickImage(setPortraitImage)} style={imgBtnStyle}><ImageIcon size={11} /> Change</button>
                      <button onClick={() => { setPortraitImage(null); setDirty(true) }} style={{ ...imgBtnStyle, color: '#e05555', borderColor: 'rgba(224,85,85,0.4)' }}><X size={11} /> Remove</button>
                    </div>
                  )}
                </div>
              ) : !readMode ? (
                <button onClick={() => pickImage(setPortraitImage)} style={{ width: '100%', aspectRatio: '3/4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, transition: 'all 120ms ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'; (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
                  <ImageIcon size={22} strokeWidth={1} /> Add portrait
                </button>
              ) : null}
            </div>

            {currentTypeTracks.length > 0 && (
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={sidebarSectionLabel}>Details</div>
                {readMode ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {currentTypeTracks.map(([trackName]) => {
                      const val = tracks[trackName]
                      if (!val) return null
                      if (trackName === 'In_World_Date' || trackName === 'Death_Date') {
                        let display = val
                        try { const d = JSON.parse(val); display = `Day ${d.day}, Year ${d.year}` } catch {}
                        const dateColor = trackName === 'Death_Date' ? '#9b7de8' : 'var(--gold)'
                        const dateBg = trackName === 'Death_Date' ? 'rgba(155,125,232,0.1)' : 'rgba(200,168,75,0.1)'
                        const dateBorder = trackName === 'Death_Date' ? 'rgba(155,125,232,0.3)' : 'rgba(200,168,75,0.3)'
                        return (
                          <div key={trackName} style={{ fontSize: 11, fontWeight: 600, color: dateColor, padding: '3px 10px', borderRadius: 99, border: `1px solid ${dateBorder}`, background: dateBg }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{formatTrackName(trackName)}: </span>{display}
                          </div>
                        )
                      }
                      const color = TRACK_VALUE_COLORS[val] || '#8a8a8a'
                      return (
                        <div key={trackName} style={{ fontSize: 11, fontWeight: 600, color, padding: '3px 10px', borderRadius: 99, border: `1px solid ${color}44`, background: `${color}12` }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{formatTrackName(trackName)}: </span>{val}
                        </div>
                      )
                    })}
                    {currentTypeTracks.every(([n]) => !tracks[n]) && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— none set —</span>}
                  </div>
                ) : (
                  currentTypeTracks.map(([trackName, options]) => {
                    // Item rarity is owned by the Item Stats block — show it read-only here
                    if (articleType === 'item' && trackName === 'Rarity') {
                      const val = tracks['Rarity']
                      return (
                        <div key={articleType + trackName} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0 }}>Rarity</span>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 12, color: val ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{val || '—'}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>set in Item Stats</span>
                          </div>
                        </div>
                      )
                    }
                    if (trackName === 'In_World_Date' || trackName === 'Death_Date') {
                      return (
                        <div key={articleType + trackName} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0 }}>{formatTrackName(trackName)}</span>
                          <div style={{ flex: 1 }}>
                            <InWorldDatePicker
                              value={tracks[trackName] || ''}
                              onChange={v => {
                                setTracks(prev => {
                                  const updated = { ...prev, [trackName]: v }
                                  // Auto-set Vitality to Dead when Death_Date is given
                                  if (trackName === 'Death_Date' && v) {
                                    updated['Vitality'] = 'Dead'
                                  }
                                  return updated
                                })
                                setDirty(true)
                              }}
                              label=""
                            />
                          </div>
                        </div>
                      )
                    }
                    return (
                      <TrackRow
                        key={articleType + trackName}
                        trackKey={articleType + trackName}
                        name={trackName}
                        options={options}
                        value={tracks[trackName] || ''}
                        onChange={v => {
                          setTracks(prev => {
                            const updated = { ...prev, [trackName]: v }
                            const oldTrackTags = getTrackTags(prev)
                            const newTrackTags = getTrackTags(updated)
                            setTags(prevTags => {
                              const manualTags = prevTags.filter(t => !oldTrackTags.includes(t))
                              return Array.from(new Set([...manualTags, ...newTrackTags]))
                            })
                            return updated
                          })
                          setDirty(true)
                        }}
                        dynamicOptions={
                          trackName === 'Organization'       ? organizationNames :
                          trackName === 'Religion'           ? religionNames :
                          trackName === 'Culture'            ? cultureNames :
                          trackName === 'Species'            ? [...(ARTICLE_TRACKS[articleType]?.Species ?? []), ...creatureNames] :
                          trackName === 'Location'           ? locationNames :
                          trackName === 'Within'             ? locationNames.filter(n => n !== title) :
                          trackName === 'HQ'                 ? locationNames :
                          trackName === 'Owner'              ? characterNames :
                          trackName === 'Sender'             ? characterNames :
                          trackName === 'Intended_Recipient' ? characterNames :
                          trackName === 'Leader'             ? characterNames :
                          trackName === 'Quest_Giver'        ? characterNames :
                          trackName === 'Player_Character'   ? playerCharacterNames :
                          trackName === 'Allies'             ? [...characterNames, ...organizationNames, ...factionNames, ...religionNames] :
                          trackName === 'Rivals'             ? [...characterNames, ...organizationNames, ...factionNames, ...religionNames] :
                          undefined
                        }
                      />
                    )
                  })
                )}
              </div>
            )}

            <TimelineDatesSection
              articleType={articleType}
              tracks={tracks}
              setTracks={setTracks}
              setDirty={setDirty}
              readMode={readMode}
              baseYear={(currentCampaign as any)?.timeline_base_year ?? 1507}
            />

            {['faction', 'organization', 'religion'].includes(articleType) && (
              <MemberCountSection articleId={article.id} followerEstimate={tracks.Follower_Count} />
            )}

            {['character', 'playerCharacter'].includes(articleType) && (
              <AffiliationsSection articleId={article.id} />
            )}

            {articleType === 'location' && (
              <GeographySection articleId={article.id} reloadKey={savedTick} />
            )}

            <RelationWebsSection
              articleId={article.id}
              articleTitle={article.title}
              articleType={articleType}
              canCreate={!readMode}
              webs={relationWebs}
              loaded={relationWebsLoaded}
              onReload={reloadRelationWebs}
              onOpenWeb={(webId) => {
                setRelationsOpenWebId(webId)
                setRelationsFocusArticleId(article.id)
                setView('relations')
              }}
            />

            <ArticleRelationsPanel
              articleId={article.id}
              onOpenWeb={(webId) => {
                setRelationsOpenWebId(webId)   // ← tell RelationsPage which web to open
                setRelationsFocusArticleId(article.id)  // ← select + center this article's node
                setView('relations')
              }}
            />

            {(() => {
              const personalQuests = backlinks.filter(a => {
                if (a.article_type !== 'quest') return false
                try {
                  const t = JSON.parse(a.tracks || '{}')
                  return t.Player_Character === article.title
                } catch { return false }
              })
              const otherLinks = backlinks.filter(a => !personalQuests.includes(a))

              const renderLink = (a: ArticleSummary) => {
                const t = ARTICLE_TYPES.find(x => x.value === a.article_type) || ARTICLE_TYPES[ARTICLE_TYPES.length - 1]
                return (
                  <button key={a.id} onClick={() => navigateToArticleByTitle(a.title)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = t.color; (e.currentTarget as HTMLElement).style.color = t.color }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}>
                    <t.icon size={11} color={t.color} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                  </button>
                )
              }

              return (
                <>
                  {personalQuests.length > 0 && (
                    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ ...sidebarSectionLabel, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ScrollText size={11} /> Personal quests
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {personalQuests.map(renderLink)}
                      </div>
                    </div>
                  )}

                  {otherLinks.length > 0 && (
                    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ ...sidebarSectionLabel, display: 'flex', alignItems: 'center', gap: 5 }}><Link size={11} /> Linked from</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {otherLinks.map(renderLink)}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {(tags.length > 0 || memberWebs.length > 0 || !readMode) && (
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={sidebarSectionLabel}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {memberWebs.map(w => (
                    <span key={`web-${w.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      #{w.name}
                    </span>
                  ))}
                  {tags.map(tag => (
                    <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      #{tag}
                      {!readMode && <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-muted)' }}><X size={10} /></button>}
                    </span>
                  ))}
                  {!readMode && (
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
                      placeholder="Add tag…"
                      style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text-secondary)', width: 80 }} />
                  )}
                </div>
              </div>
            )}

            <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Created {new Date(article.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>Updated {new Date(article.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Article List View ─────────────────────────────────────────────────────────

function ArticleListView({ onOpen }: { onOpen: (a: ArticleSummary) => void }) {
  const {
    articles, currentCampaign, wikiFilter, wikiSearch, wikiTagFilter, wikiSearchFields, wikiShowTags, setWikiShowTags,
    loadArticles, setWikiFilter, setWikiSearch, setWikiTagFilter, setWikiSearchFields,
    setView, setCampaignSubView,
  } = useStore()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { loadArticles() }, [currentCampaign?.id])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    articles.forEach(a => { parseTags(a.tags).forEach(t => tagSet.add(t)) })
    if (wikiTagFilter) tagSet.add(wikiTagFilter)
    return [...tagSet].sort()
  }, [articles, wikiTagFilter])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', transition: 'color var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
              <ArrowLeft size={14} /> Back
            </button>
            <BookOpen size={22} color="var(--gold)" />
            <h1 style={{ fontSize: 22, letterSpacing: '0.05em' }}>Campaign Wiki</h1>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{articles.length} article{articles.length !== 1 ? 's' : ''}</span>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> New Article</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ position: 'relative', width: 260 }}>
              <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 30, paddingRight: wikiSearch ? 28 : 10, fontSize: 13, height: 34 }}
                placeholder={wikiSearchFields.title && wikiSearchFields.tags ? 'Search by title or tag…' : wikiSearchFields.tags ? 'Search by tag…' : 'Search by title…'}
                value={wikiSearch} onChange={e => setWikiSearch(e.target.value)} />
              {wikiSearch && (
                <button onClick={() => setWikiSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, paddingLeft: 2 }}>
              {(['title', 'tags'] as const).map(field => {
                const active = wikiSearchFields[field]
                const isLast = active && !wikiSearchFields[field === 'title' ? 'tags' : 'title']
                return (
                  <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', userSelect: 'none' }}>
                    <input type="checkbox" checked={active} disabled={isLast}
                      onChange={() => setWikiSearchFields({ ...wikiSearchFields, [field]: !active })}
                      style={{ accentColor: 'var(--gold)', cursor: isLast ? 'default' : 'pointer', width: 11, height: 11 }} />
                    {field}
                  </label>
                )
              })}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_FILTERS.map(f => {
              const Icon = f.icon; const active = wikiFilter === f.value
              return (
                <button key={f.value} onClick={() => setWikiFilter(f.value as any)} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99,
                  border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border-light)'}`,
                  background: active ? 'var(--bg-active)' : 'transparent',
                  color: active ? 'var(--gold)' : 'var(--text-muted)',
                  fontSize: 12, cursor: 'pointer', transition: 'all 120ms ease',
                }}>
                  <Icon size={11} /> {f.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', paddingBottom: 8 }}>
          <button onClick={() => setWikiShowTags(!wikiShowTags)}
            style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}>
            {wikiShowTags ? 'Hide tags' : 'Show tags'}
          </button>
        </div>

        {allTags.length > 0 && <div className="divider" />}
        {allTags.length > 0 && wikiShowTags && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 12, flexWrap: 'wrap' }}>
            <Tag size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            {allTags.map(tag => {
              const active = wikiTagFilter === tag
              return (
                <button key={tag} onClick={() => setWikiTagFilter(active ? null : tag)}
                  style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, border: `1px solid ${active ? 'var(--gold-dim)' : 'var(--border-light)'}`, background: active ? 'var(--gold-glow)' : 'transparent', color: active ? 'var(--gold)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}>
                  #{tag}
                </button>
              )
            })}
            {wikiTagFilter && (
              <button onClick={() => setWikiTagFilter(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 120ms ease', marginLeft: 2 }}>
                <X size={10} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {articles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-muted)' }}>
            <BookOpen size={40} strokeWidth={1} color="var(--border-light)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>
                {wikiSearch ? 'No articles match your search' : 'No articles yet'}
              </div>
              <div style={{ fontSize: 13 }}>
                {wikiSearch ? 'Try a different search term or filter' : 'Create your first article to start building your wiki'}
              </div>
            </div>
            {!wikiSearch && <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Article</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, alignContent: 'start' }}>
            {articles.map(a => <ArticleCard key={a.id} article={a} onOpen={() => onOpen(a)} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateArticleModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

// ─── Wiki Page ─────────────────────────────────────────────────────────────────

export default function WikiPage() {
  const { currentArticle, currentCampaign, selectArticle, openArticle } = useStore()

  if (!currentCampaign) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
        <BookOpen size={40} strokeWidth={1} color="var(--border-light)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No campaign selected</div>
          <div style={{ fontSize: 13 }}>Open a campaign first to access its wiki</div>
        </div>
      </div>
    )
  }

  if (currentArticle) {
    return <ArticleEditor key={currentArticle.id} article={currentArticle} onBack={() => selectArticle(null)} />
  }

  return <ArticleListView onOpen={(a) => openArticle(a.id)} />
}