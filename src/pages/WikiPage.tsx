// path: src/pages/WikiPage.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStore } from '../store/store'
import {
  BookOpen, Plus, Search, Trash2, Check, MapPin, User, Package,
  ScrollText, Users, Landmark, FileText, X, ChevronLeft, Calendar,
  MoreHorizontal, Tag, Image as ImageIcon, Link, PawPrint, StickyNote
} from 'lucide-react'
import RichEditor from '../components/RichEditor'
import type { Article, ArticleSummary, ArticleType } from '../types'
import StatBlockEditor from '../components/StatBlockEditor'
import { parseStatBlock, DEFAULT_STATBLOCK } from '../types'
import StatBlockView from '../components/StatBlockView'
import LootTableEditor from '../components/LootTableEditor'
import { parseLootTable } from '../types'
import SectionDivider from '../components/SectionDivider'

const ARTICLE_TYPES: { value: ArticleType; label: string; icon: any; color: string }[] = [
  { value: 'character',       label: 'Character',    icon: User,       color: '#5bbfb0' },
  { value: 'playerCharacter', label: 'Player Char',  icon: User,       color: '#49c185' },
  { value: 'creature',        label: 'Creature',     icon: PawPrint,   color: '#36a502' },
  { value: 'location',        label: 'Location',     icon: MapPin,     color: '#c8a84b' },
  { value: 'faction',         label: 'Faction',      icon: Users,      color: '#e88c3a' },
  { value: 'organization',    label: 'Organization', icon: Users,      color: '#e8a23a' },
  { value: 'culture',         label: 'Culture',      icon: Landmark,   color: '#4da6ff' },
  { value: 'religion',        label: 'Religion',     icon: Landmark,   color: '#b07de8' },
  { value: 'item',            label: 'Item',         icon: Package,    color: '#9b7de8' },
  { value: 'note',            label: 'Note',         icon: StickyNote, color: '#776d92' },
  { value: 'quest',           label: 'Quest',        icon: ScrollText, color: '#5b9fe8' },
  { value: 'event',           label: 'Event',        icon: ScrollText, color: '#e05555' },
  { value: 'lore',            label: 'Lore',         icon: Landmark,   color: '#e05555' },
  { value: 'other',           label: 'Other',        icon: FileText,   color: '#8a8a8a' },
]

// ── Track definitions ──────────────────────────────────────────────────────────
// Maps article type → track name → predefined options.
// An empty options array means the track is custom-input only.
const ARTICLE_TRACKS: Partial<Record<ArticleType, Record<string, string[]>>> = {
  character: {
    Vitality:    ['Alive', 'Dead', 'Unknown', 'Missing', 'Immortal'],
    Disposition: ['Friendly', 'Neutral', 'Hostile'],
    Location:    [],
    Faction:     [],
    Religion:    [],
    Culture:     [],
  },
  playerCharacter: {
    Vitality:    ['Alive', 'Dead', 'Unknown', 'Retired'],
    Disposition: ['Friendly', 'Neutral', 'Hostile'],
    Location:    [],
    Faction:     [],
    Religion:    [],
    Culture:     [],
  },
  creature: {
    Vitality:    ['Living', 'Extinct', 'Threatened','Unknown'],
    Disposition: ['Hostile', 'Neutral', 'Friendly'],
    Awareness:   ['Unaware', 'Alerted', 'Hunting'],
    Size:        ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'],
    Location:    [],
  },
  location: {
    State:  ['Discovered', 'Undiscovered','Destroyed', 'Abandoned'],
    Size:   ['Room', 'Building', 'Village', 'Town', 'City', 'Metropolis', 'Ruins', 'Dungeon', 'Wilderness'],
    Plane:  ['Material Plane', 'The Nine Hells', 'The Abyss', 'Ethereal Plane', 'Shadowfell', 'Feywild', 'Elemental Plane', 'Astral Plane'],
    Region: [],
  },
  faction: {
    Status: ['Active', 'Disbanded', 'Unknown'],
    Scale:  ['Local', 'Regional', 'National', 'Global', 'Secret'],
    HQ:     [],
  },
  organization: {
    Status: ['Active', 'Disbanded', 'Unknown'],
    Scale:  ['Local', 'Regional', 'National', 'Global', 'Secret'],
    HQ:     [],
  },
  quest: {
    Status:     ['Active', 'Completed', 'Failed', 'Abandoned'],
    Difficulty: ['Trivial', 'Easy', 'Medium', 'Hard', 'Deadly'],
  },
  item: {
    Status:   ['Found', 'Lost', 'Destroyed', 'Unknown'],
    Rarity:   ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'],
    Location: [],
  },
  event: {
    Status: ['Upcoming', 'Ongoing', 'Past'],
    Scale:  ['Personal', 'Local', 'Regional', 'World-shaking'],
  },
  culture:  { Status: ['Active', 'Extinct', 'Unknown'] },
  religion: { Status: ['Active','Undercover', 'Extinct', 'Unknown'] },
  lore:     { Status: ['Active', 'Extinct', 'Unknown'] },
  note: {
    Sender:             [],   // dynamic: character names
    Intended_Recipient: [],   // dynamic: character names
    Language:           [],
  },
  other:    { Status: ['Active', 'Inactive', 'Unknown'] },
}

// Colour map for track values — unrecognised values fall back to grey
const TRACK_VALUE_COLORS: Record<string, string> = {
  // Vitality / general
  Alive: '#3dbf7f', Active: '#3dbf7f', Found: '#3dbf7f', Discovered: '#3dbf7f',
  Dead: '#e05555', Destroyed: '#e05555', Disbanded: '#e05555', Failed: '#e05555', Extinct: '#e05555',
  Unknown: '#8a8a8a', Missing: '#8a8a8a', Lost: '#8a8a8a', Abandoned: '#8a8a8a',
  Inactive: '#8a8a8a', Undiscovered: '#8a8a8a',
  // Disposition
  Friendly: '#3dbf7f', Neutral: '#bab637', Hostile: '#e05555',
  // Awareness
  Unaware: '#8a8a8a', Alerted: '#e88c3a', Hunting: '#e05555',
  // Quest / time
  Completed: '#5b9fe8', Past: '#5b9fe8', Retired: '#5b9fe8',
  Upcoming: '#c8a84b', Ongoing: '#e88c3a',
  // Difficulty
  Trivial: '#8a8a8a', Easy: '#3dbf7f', Medium: '#c8a84b', Hard: '#e88c3a', Deadly: '#e05555',
  // Rarity
  Common: '#8a8a8a', Uncommon: '#3dbf7f', Rare: '#5b9fe8',
  'Very Rare': '#b07de8', Legendary: '#e8d44d', Artifact: '#c8a84b',
  // Scale
  Personal: '#8a8a8a', Local: '#5bbfb0', Regional: '#5b9fe8',
  National: '#b07de8', Global: '#e88c3a', Secret: '#e05555', 'World-shaking': '#e05555',
  // Creature size
  Tiny: '#8a8a8a', Small: '#5bbfb0', Large: '#e88c3a', Huge: '#e05555', Gargantuan: '#8b2533',
  // Location size
  Hamlet: '#8a8a8a', Village: '#5bbfb0', Town: '#c8a84b', City: '#e88c3a',
  Metropolis: '#e05555', Ruins: '#5a5040', Dungeon: '#8b2533', Wilderness: '#3dbf7f',
}

function getTrackTags(tracks: Record<string, string>): string[] {
  return Object.values(tracks)
    .filter(v => v && v.trim() !== '')
    .map(v => v.toLowerCase().replace(/\s+/g, '-'))
}

const ALL_FILTERS = [
  { value: 'all', label: 'All', icon: BookOpen, color: 'var(--text-secondary)' },
  ...ARTICLE_TYPES,
]

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', background: 'none', border: 'none',
  color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-ui)',
  cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease',
}

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
  trackKey: string
  name: string
  options: string[]
  value: string
  onChange: (v: string) => void
  dynamicOptions?: string[]
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
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0 }}>{name}</span>
      {customMode ? (
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <input
            ref={inputRef}
            className="input"
            style={{ height: 28, fontSize: 12, flex: 1 }}
            value={value}
            placeholder={isCustomOnly ? `${name}…` : 'Custom…'}
            onChange={e => onChange(e.target.value)}
          />
          {!isCustomOnly && (
            <button
              onClick={() => { setCustomMode(false); onChange('') }}
              title="Back to list"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', display: 'flex', alignItems: 'center' }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      ) : (
        <select
          className="input"
          style={{ height: 28, fontSize: 12, flex: 1 }}
          value={value}
          onChange={e => {
            if (e.target.value === '__custom__') { setCustomMode(true); onChange('') }
            else onChange(e.target.value)
          }}
        >
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
    setSaving(true)
    setError('')
    try {
      await createArticle({ title: title.trim(), article_type: type })
      onClose()
    } catch {
      setSaving(false)
      setError('Failed — title may already exist.')
    }
  }

  const PLACEHOLDERS = [
    'Neverwinter…', 'Waterdeep…', 'Icewind Dale…',
    'Gandalf the Grey…', 'Gerome the Gnome…', 'Magic Stick of Doom…',
    'Stormwind City…', 'Orgrimmar…',
  ]
  const randomPlaceholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Article</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Title</label>
            <input
              className="input"
              placeholder={randomPlaceholder}
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
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
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 99,
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
  const tags = (() => { try { return JSON.parse(article.tags) as string[] } catch { return [] } })()
  const { wikiSearchFields } = useStore()

  return (
    <div
      className="card card-clickable"
      style={{ padding: 0, cursor: 'pointer', overflow: 'hidden' }}
      onClick={onOpen}
    >
      {article.cover_image ? (
        <div style={{ height: 100, overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={`file://${article.cover_image}`}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      ) : (
        <div style={{ height: 6, background: `${typeInfo.color}44`, flexShrink: 0 }} />
      )}

      <div style={{ padding: '14px 16px' }}>
        {/* Type pill + track value pills */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '2px 8px', borderRadius: 99,
            border: `1px solid ${typeInfo.color}55`,
            background: `${typeInfo.color}12`,
            fontSize: 10, color: typeInfo.color, fontWeight: 600,
          }}>
            <Icon size={9} /> {typeInfo.label}
          </div>
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: 15,
          color: 'var(--text-primary)', marginBottom: 8,
          letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {article.title}
        </h3>

        {/* Tags */}
        {tags.length > 0 && wikiSearchFields.tags && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {tags.slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 99,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
                color: 'var(--text-muted)',
              }}>
                #{tag}
              </span>
            ))}
            {tags.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{tags.length - 3}</span>}
          </div>
        )}

        {/* Footer */}
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

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={() => { setOpen(o => !o); setConfirmDelete(false) }}
        style={{ color: 'var(--text-muted)' }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 140, zIndex: 50, overflow: 'hidden',
        }}>
          <button
            onClick={e => { e.stopPropagation(); if (!confirmDelete) { setConfirmDelete(true); return } onDelete(); setOpen(false) }}
            style={{ ...menuItemStyle, color: confirmDelete ? '#ff7777' : '#e05555' }}
          >
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Article Editor ────────────────────────────────────────────────────────────

const STATBLOCK_TYPES: ArticleType[] = ['creature', 'character', 'playerCharacter']

function ArticleEditor({ article, onBack }: { article: Article; onBack: () => void }) {
  const { updateArticle, deleteArticle, navigateToArticleByTitle, getArticleBacklinks } = useStore()
  const { currentCampaign, articles } = useStore()
  const [factionNames, setFactionNames] = useState<string[]>([])
  const [organizationNames, setOrganizationNames] = useState<string[]>([])
  const [religionNames, setReligionNames] = useState<string[]>([])
  const [cultureNames, setCultureNames] = useState<string[]>([])
  const [locationNames, setLocationNames] = useState<string[]>([])
  const [creatureNames, setCreatureNames] = useState<string[]>([])
  const [characterNames, setCharacterNames] = useState<string[]>([])
  const [title, setTitle] = useState(article.title)
  const [content, setContent] = useState(article.content)
  const [articleType, setArticleType] = useState<ArticleType>(article.article_type as ArticleType)
  const [tracks, setTracks] = useState<Record<string, string>>(() => {
    try { return JSON.parse(article.tracks) } catch { return {} }
  })
  const [statblock, setStatblock] = useState(() => parseStatBlock(article.statblock))
  const [tags, setTags] = useState<string[]>(() => { try { return JSON.parse(article.tags) } catch { return [] } })
  const [tagInput, setTagInput] = useState('')
  const [coverImage, setCoverImage] = useState<string | null>(article.cover_image || null)
  const [portraitImage, setPortraitImage] = useState<string | null>(article.portrait_image || null)
  const [backlinks, setBacklinks] = useState<ArticleSummary[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [readMode, setReadMode] = useState(true)
  const [lootTableJson, setLootTableJson] = useState(article.loot_table || '{"name":"Loot","items":[]}')


  const hasStatblock = STATBLOCK_TYPES.includes(articleType)

  const pendingRef = useRef({
    title, content, articleType, tracks, statblock, lootTableJson,
    tags, coverImage, portraitImage, dirty, id: article.id,
  })
  pendingRef.current = {
    title, content, articleType, tracks, statblock, lootTableJson,
    tags, coverImage, portraitImage, dirty, id: article.id,
  }

  useEffect(() => {
    return () => {
      const p = pendingRef.current
      if (p.dirty) window.api.updateArticle(p.id, {
        title: p.title, content: p.content, article_type: p.articleType,
        tracks: JSON.stringify(p.tracks),
        statblock: JSON.stringify(p.statblock),
        loot_table: p.lootTableJson,
        tags: JSON.stringify(p.tags),
        cover_image: p.coverImage, portrait_image: p.portraitImage,
      })
    }
  }, [])

  useEffect(() => {
    setTitle(article.title)
    setContent(article.content)
    setArticleType(article.article_type as ArticleType)
    setTracks(() => { try { return JSON.parse(article.tracks) } catch { return {} } })
    setStatblock(parseStatBlock(article.statblock))
    setTags(() => { try { return JSON.parse(article.tags) } catch { return [] } })
    setCoverImage(article.cover_image || null)
    setPortraitImage(article.portrait_image || null)
    setDirty(false)
  }, [article.id])

  useEffect(() => { getArticleBacklinks(article.title).then(setBacklinks) }, [article.title])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'faction' }).then(f =>
      setFactionNames(f.map(a => a.title).sort())
    )
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'organization' }).then(o =>
      setOrganizationNames(o.map(a => a.title).sort())
    )
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'religion' }).then(r =>
      setReligionNames(r.map(a => a.title).sort())
    )
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'culture' }).then(c =>
      setCultureNames(c.map(a => a.title).sort())
    )
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'creature' }).then(c =>
      setCreatureNames(c.map(a => a.title).sort())
    )
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'location' }).then(l =>
      setLocationNames(l.map(a => a.title).sort())
    )
    // Characters + playerCharacters combined for Sender/Intended_Recipient on notes
    Promise.all([
      window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'character' }),
      window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'playerCharacter' }),
    ]).then(([chars, pcs]) =>
      setCharacterNames([...chars, ...pcs].map(a => a.title).sort())
    )
  }, [currentCampaign?.id])

  const save = useCallback(async () => {
    if (!dirty) return
    setSaving(true)
    await updateArticle(article.id, {
      title, content, article_type: articleType,
      tracks: JSON.stringify(tracks),
      statblock: JSON.stringify(statblock),
      loot_table: lootTableJson,
      tags: JSON.stringify(tags),
      cover_image: coverImage, portrait_image: portraitImage,
    })
    setDirty(false)
    setSaving(false)
  }, [article.id, dirty, title, content, articleType, tracks, statblock, lootTableJson, tags, coverImage, portraitImage, updateArticle])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 1500)
    return () => clearTimeout(t)
  }, [dirty, title, content, articleType, tracks, statblock, lootTableJson, tags, coverImage, portraitImage])

  const pickImage = async (setter: (v: string | null) => void) => {
    const path = await window.api.selectImageFile()
    if (!path) return
    const full = await window.api.getImagePath(path)
    setter(full.replace('file://', ''))
    setDirty(true)
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t || tags.includes(t)) return
    setTags(prev => [...prev, t])
    setTagInput('')
    setDirty(true)
  }

  const removeTag = (tag: string) => { setTags(prev => prev.filter(t => t !== tag)); setDirty(true) }

  const currentTypeTracks = Object.entries(ARTICLE_TRACKS[articleType] || {})

  const statblockHasData = statblock.ac > 0 || statblock.hp > 0 ||
    statblock.traits.length > 0 || statblock.actions.length > 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
        flexShrink: 0, display: 'flex', alignItems: 'stretch', minHeight: 48,
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '0 16px',
            background: 'transparent', border: 'none', borderRight: '1px solid var(--border)',
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'color var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
        >
          <ChevronLeft size={14} /> Back to Wiki
        </button>

        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', flex: 1, minWidth: 0 }}>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); setDirty(true) }}
            readOnly={readMode}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500,
              color: 'var(--text-primary)', letterSpacing: '0.03em', width: '100%',
              cursor: readMode ? 'default' : 'text',
            }}
            placeholder="Article title…"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
          {readMode ? (
            <button className="btn btn-sm" onClick={() => setReadMode(false)}>Edit</button>
          ) : (
            <>
              {dirty
                ? <button className="btn btn-sm" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : <><Check size={12} /> Save</>}
                  </button>
                : <span style={{ fontSize: 11, color: 'var(--gold-dim)' }}>Saved</span>
              }
              <button className="btn btn-sm btn-ghost" onClick={() => setReadMode(true)}>Done</button>
            </>
          )}
          <ArticleMenu onDelete={async () => { await deleteArticle(article.id); onBack() }} />
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* Banner */}
        {coverImage ? (
          <div style={{ height: 200, position: 'relative', overflow: 'hidden' }}>
            <img src={`file://${coverImage}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
            {!readMode && (
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
                <button onClick={() => pickImage(setCoverImage)} style={imgBtnStyle}>
                  <ImageIcon size={11} /> Change banner
                </button>
                <button onClick={() => { setCoverImage(null); setDirty(true) }} style={{ ...imgBtnStyle, color: '#e05555', borderColor: 'rgba(224,85,85,0.4)' }}>
                  <X size={11} /> Remove
                </button>
              </div>
            )}
          </div>
        ) : !readMode ? (
          <button onClick={() => pickImage(setCoverImage)} style={addBannerStyle}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
          >
            <ImageIcon size={13} /> Add banner image
          </button>
        ) : null}

        {/* ── Two-column layout ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>

          {/* ── Left: type selector + lore + stat block ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

            {/* Type selector — edit mode only */}
            {!readMode && (
              <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {ARTICLE_TYPES.map(t => {
                  const Icon = t.icon
                  const active = t.value === articleType
                  return (
                    <button key={t.value} onClick={() => {
                      setArticleType(t.value)
                      setDirty(true)
                    }} style={{
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

            {/* Lore editor */}
            <div style={{ padding: '0 8px' }}>
              <RichEditor
                key={article.id}
                content={content}
                onChange={v => { setContent(v); setDirty(true) }}
                placeholder="Start writing… Use [[Article Title]] to link to wiki articles, (( to link to sessions and @ to link spells."
                onWikiLinkClick={navigateToArticleByTitle}
                expandable
                readOnly={readMode}
              />
            </div>

            {/* ── Stat block section — creature/character types only ── */}
            {hasStatblock && (
              <div style={{ padding: '0 24px 32px' }}>

                {/* Divider + heading */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                    letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    Stat Block
                  </div>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
                </div>

                {readMode ? (
                  statblockHasData ? (
                    <StatBlockView
                      statblock={statblock}
                      name={title}
                      articleType={articleType}
                    />
                  ) : (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 8, padding: '24px 16px', textAlign: 'center',
                      border: '1px dashed var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-muted)',
                    }}>
                      <span style={{ fontSize: 13 }}>No stat block yet</span>
                      <span style={{ fontSize: 11 }}>Switch to Edit mode to add combat stats</span>
                    </div>
                  )
                ) : (
                  <StatBlockEditor
                    value={statblock}
                    onChange={sb => { setStatblock(sb); setDirty(true) }}
                  />
                )}
              </div>
            )}

            {/* ── Loot table section — creature/character/playerCharacter ── */}
            {hasStatblock && (() => {
              const lootTable = parseLootTable(lootTableJson)
              const lootSuggestions = articles
                .filter(a => ['item', 'artifact', 'note'].includes(a.article_type))
                .map(a => a.title)
              return (
                <div style={{ padding: '0 24px 32px' }}>
                  <SectionDivider label={lootTable.name || 'Loot'} />
                  {readMode ? (
                    lootTable.items.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {lootTable.items.filter(i => i.chance === 100).length > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                            Guaranteed
                          </div>
                        )}
                        {lootTable.items.filter(i => i.chance === 100).map(item => {
                          const isLink = articles.some(a => a.title.toLowerCase() === item.name.toLowerCase())
                          return (
                            <div key={item.id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-gold)', background: 'var(--gold-glow)',
                              fontSize: 12,
                            }}>
                              <span
                                onClick={isLink ? () => navigateToArticleByTitle(item.name) : undefined}
                                style={{
                                  color: 'var(--gold)', fontWeight: 500, flex: 1,
                                  cursor: isLink ? 'pointer' : 'default',
                                  borderBottom: isLink ? '1px solid var(--gold-dim)' : 'none',
                                  width: 'fit-content',
                                }}
                              >{item.name}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Quantity: </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{item.quantity}</span>
                                <span style={{
                                  fontSize: 12, fontWeight: 700, marginLeft: 4,
                                  color: '#3dbf7f',
                                  background: 'var(--bg-surface)', padding: '2px 8px',
                                  borderRadius: 99, border: '1px solid var(--border-light)',
                                }}>{item.chance}%</span>
                              </div>
                            </div>
                          )
                        })}
                        {lootTable.items.filter(i => i.chance < 100).length > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 4px' }}>
                            Random
                          </div>
                        )}
                        {lootTable.items.filter(i => i.chance < 100).map(item => {
                          const isLink = articles.some(a => a.title.toLowerCase() === item.name.toLowerCase())
                          return (
                            <div key={item.id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-light)', background: 'var(--bg-elevated)',
                              fontSize: 12,
                            }}>
                              <span
                                onClick={isLink ? () => navigateToArticleByTitle(item.name) : undefined}
                                style={{
                                  color: isLink ? 'var(--gold)' : 'var(--text-secondary)', flex: 1,
                                  cursor: isLink ? 'pointer' : 'default',
                                  borderBottom: isLink ? '1px solid var(--gold-dim)' : 'none',
                                  width: 'fit-content',
                                }}
                              >{item.name}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Quantity: </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{item.quantity}</span>
                                <span style={{
                                  fontSize: 12, fontWeight: 700, marginLeft: 4,
                                  color: item.chance >= 75 ? '#3dbf7f' : item.chance >= 40 ? '#c8a84b' : '#e88c3a',
                                  background: 'var(--bg-surface)', padding: '2px 8px',
                                  borderRadius: 99, border: '1px solid var(--border-light)',
                                }}>{item.chance}%</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '16px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 12 }}>
                        No loot table — switch to Edit to add items
                      </div>
                    )
                  ) : (
                    <LootTableEditor
                      value={lootTable}
                      onChange={t => { setLootTableJson(JSON.stringify(t)); setDirty(true) }}
                      defaultName="Loot"
                      suggestions={lootSuggestions}
                    />
                  )}
                </div>
              )
            })()}
          </div>

          {/* ── Right sidebar ── */}
          <div style={{
            width: 260, flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            position: 'sticky', top: 0,
            display: 'flex', flexDirection: 'column',
          }}>

            {/* Portrait */}
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={sidebarSectionLabel}>{article.title}</div>
              {portraitImage ? (
                <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <img src={`file://${portraitImage}`} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                  {!readMode && (
                    <div
                      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0, transition: 'all 200ms ease' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.5)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)' }}
                    >
                      <button onClick={() => pickImage(setPortraitImage)} style={imgBtnStyle}><ImageIcon size={11} /> Change</button>
                      <button onClick={() => { setPortraitImage(null); setDirty(true) }} style={{ ...imgBtnStyle, color: '#e05555', borderColor: 'rgba(224,85,85,0.4)' }}><X size={11} /> Remove</button>
                    </div>
                  )}
                </div>
              ) : !readMode ? (
                <button
                  onClick={() => pickImage(setPortraitImage)}
                  style={{
                    width: '100%', aspectRatio: '3/4', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'var(--bg-elevated)', border: '1px dashed var(--border-light)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: 12, transition: 'all 120ms ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'; (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
                >
                  <ImageIcon size={22} strokeWidth={1} />
                  Add portrait
                </button>
              ) : null}
            </div>

            {/* Tracks */}
            {currentTypeTracks.length > 0 && (
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={sidebarSectionLabel}>Details</div>
                {readMode ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {currentTypeTracks.map(([trackName]) => {
                      const val = tracks[trackName]
                      if (!val) return null
                      const color = TRACK_VALUE_COLORS[val] || '#8a8a8a'
                      return (
                        <div key={trackName} style={{
                          fontSize: 11, fontWeight: 600, color,
                          padding: '3px 10px', borderRadius: 99,
                          border: `1px solid ${color}44`,
                          background: `${color}12`,
                        }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{trackName}: </span>{val}
                        </div>
                      )
                    })}
                    {currentTypeTracks.every(([n]) => !tracks[n]) && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— none set —</span>
                    )}
                  </div>
                ) : (
                  currentTypeTracks.map(([trackName, options]) => (
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
                        trackName === 'Faction'             ? factionNames :
                        trackName === 'Organization'        ? organizationNames :
                        trackName === 'Religion'            ? religionNames :
                        trackName === 'Culture'             ? cultureNames :
                        trackName === 'Species'             ? creatureNames :
                        trackName === 'Location'            ? locationNames :
                        trackName === 'HQ'                  ? locationNames :
                        trackName === 'Sender'              ? characterNames :
                        trackName === 'Intended_Recipient'  ? characterNames :
                        undefined
                      }
                    />
                  ))
                )}
              </div>
            )}

            {/* Tags */}
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={sidebarSectionLabel}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {tags.map(tag => (
                  <span key={tag} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 99, fontSize: 11,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
                    color: 'var(--text-secondary)',
                  }}>
                    #{tag}
                    {!readMode && (
                      <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-muted)' }}>
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
                {!readMode && (
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
                    placeholder="Add tag…"
                    style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text-secondary)', width: 80 }}
                  />
                )}
              </div>
            </div>

            {/* Backlinks */}
            {backlinks.length > 0 && (
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={{ ...sidebarSectionLabel, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Link size={11} /> Linked from
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {backlinks.map(a => {
                    const t = ARTICLE_TYPES.find(x => x.value === a.article_type) || ARTICLE_TYPES[ARTICLE_TYPES.length - 1]
                    return (
                      <button
                        key={a.id}
                        onClick={() => navigateToArticleByTitle(a.title)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                          background: 'transparent', border: '1px solid var(--border-light)',
                          color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                          textAlign: 'left', transition: 'all 120ms ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = t.color; (e.currentTarget as HTMLElement).style.color = t.color }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
                      >
                        <t.icon size={11} color={t.color} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Dates */}
            <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Created {new Date(article.created_at).toLocaleDateString()}</span>
              <span>Updated {new Date(article.updated_at).toLocaleDateString()}</span>
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
  } = useStore()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { loadArticles() }, [currentCampaign?.id])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    articles.forEach(a => {
      try { (JSON.parse(a.tags) as string[]).forEach(t => tagSet.add(t)) } catch {}
    })
    if (wikiTagFilter) tagSet.add(wikiTagFilter)
    return [...tagSet].sort()
  }, [articles, wikiTagFilter])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BookOpen size={22} color="var(--gold)" />
            <h1 style={{ fontSize: 22, letterSpacing: '0.05em' }}>Campaign Wiki</h1>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {articles.length} article{articles.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Article
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ position: 'relative', width: 260 }}>
              <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="input"
                style={{ paddingLeft: 30, paddingRight: wikiSearch ? 28 : 10, fontSize: 13, height: 34 }}
                placeholder={
                  wikiSearchFields.title && wikiSearchFields.tags ? 'Search by title or tag…'
                  : wikiSearchFields.tags ? 'Search by tag…'
                  : 'Search by title…'
                }
                value={wikiSearch}
                onChange={e => setWikiSearch(e.target.value)}
              />
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
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={isLast}
                      onChange={() => setWikiSearchFields({ ...wikiSearchFields, [field]: !active })}
                      style={{ accentColor: 'var(--gold)', cursor: isLast ? 'default' : 'pointer', width: 11, height: 11 }}/>
                    {field}
                  </label>
                )})}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_FILTERS.map(f => {
              const Icon = f.icon
              const active = wikiFilter === f.value
              return (
                <button key={f.value} onClick={() => setWikiFilter(f.value as any)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 99,
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
          <button
            onClick={() => setWikiShowTags(!wikiShowTags)}
            style={{
              fontSize: 11,
              padding: '2px 10px',
              borderRadius: 99,
              border: '1px solid var(--border-light)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
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
                <button
                  key={tag}
                  onClick={() => setWikiTagFilter(active ? null : tag)}
                  style={{
                    padding: '2px 10px', borderRadius: 99, fontSize: 11,
                    border: `1px solid ${active ? 'var(--gold-dim)' : 'var(--border-light)'}`,
                    background: active ? 'var(--gold-glow)' : 'transparent',
                    color: active ? 'var(--gold)' : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 120ms ease',
                  }}
                >
                  #{tag}
                </button>
              )
            })}
            {wikiTagFilter && (
              <button
                onClick={() => setWikiTagFilter(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 99, fontSize: 11,
                  border: '1px solid var(--border-light)',
                  background: 'transparent', color: 'var(--text-primary)',
                  cursor: 'pointer', transition: 'all 120ms ease', marginLeft: 2,
                }}
              >
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
                {wikiSearch ? 'Try a different search term or filter' : 'Create your first article to start building your campaign wiki'}
              </div>
            </div>
            {!wikiSearch && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Create Article
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, alignContent: 'start' }}>
            {articles.map(a => (
              <ArticleCard key={a.id} article={a} onOpen={() => onOpen(a)} />
            ))}
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