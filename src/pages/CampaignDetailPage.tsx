// path: src/pages/CampaignDetailPage.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../store/store'
import {
  Plus, Calendar, Map, BookOpen, MoreHorizontal, Trash2, Pencil,
  ChevronRight, ArrowUpDown, ChevronDown, ChevronUp, Layers,
  Scroll, Sparkles, ArrowLeft, ShoppingBag, Upload, X, Search,
  ExternalLink, Network, Clock,
  Maximize, Eye, Image as ImageIcon,
} from 'lucide-react'
import type { Session, Arc, GameMap, POI } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'
import { useMenuClose } from '../hooks/useMenuClose'
import { parseDay } from '../utils/dates'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import MapPickerModal from '../components/MapPickerModal'
import { InWorldDatePicker } from '../components/InWorldDatePicker'
import TimelineEmbed from '../components/TimelineEmbed'

// Extend Session with in_world_day / in_world_day_end which exist in DB but not the shared type yet
type SessionExt = Session & { in_world_day?: number | null; in_world_day_end?: number | null }

// ── Constants ──────────────────────────────────────────────────────────────────

const ARC_COLORS = [
  '#c8a84b', '#7aeada', '#2eb370', '#5b9fe8', '#1323cf', '#ce21dd',
  '#f41111', '#e88c3a', '#8a2e2e', '#8a8a8a', '#6013be', '#e0e0e0',
]

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const ZOOM_SPEED = 0.001

// ── Types ──────────────────────────────────────────────────────────────────────

interface HubLink {
  type: 'wiki' | 'session'
  article_id?: number
  title?: string
  session_id?: number
  session_number?: number
  session_sub?: string
  name?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractPoiDescription(contentJson: string): string {
  try {
    const doc = JSON.parse(contentJson)
    const paras = doc?.content ?? []
    for (const node of paras) {
      if (node.type === 'paragraph') {
        const text = (node.content ?? []).map((c: any) => c.text ?? '').join('')
        if (text.trim()) return text.trim()
      }
    }
  } catch {}
  return ''
}

function extractAllText(json: string): string {
  try {
    const walk = (node: any): string => node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(walk).join(' ')
    return walk(JSON.parse(json)).replace(/\s+/g, ' ').trim().toLowerCase()
  } catch { return '' }
}

function makePoiContent(description: string): string {
  return JSON.stringify({
    type: 'doc',
    content: description.trim()
      ? [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }]
      : [{ type: 'paragraph' }],
  })
}

function parseHubLinks(raw: string): HubLink[] {
  try { return JSON.parse(raw) } catch { return [] }
}

// ── POI Popup ──────────────────────────────────────────────────────────────────

function HubPOIPopup({
  poi, links, onClose, onEdit, editMode,
  onNavigateWiki, onNavigateSession,
}: {
  poi: POI
  links: HubLink[]
  onClose: () => void
  onEdit: () => void
  editMode: boolean
  onNavigateWiki: (title: string) => void
  onNavigateSession: (sessionId: number) => void
}) {
  const description = extractPoiDescription(poi.content)
  const wikis = links.filter(l => l.type === 'wiki')
  const sessions = links.filter(l => l.type === 'session')

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        width: 220,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ padding: '9px 11px 7px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: poi.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {poi.label}
          </span>
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {editMode && (
              <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px 3px', borderRadius: 3, transition: 'color var(--transition)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                title="Edit">
                <Pencil size={11} />
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px 3px', borderRadius: 3, transition: 'color var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
              title="Close">
              <X size={11} />
            </button>
          </div>
        </div>
        {description && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>
            {description}
          </div>
        )}
      </div>

      {/* Scrollable links body */}
      <div style={{ overflowY: 'auto', maxHeight: 220 }}>
      {/* Wiki links */}
      {wikis.length > 0 && (
        <div style={{ padding: '6px 11px', borderBottom: sessions.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Wiki</div>
          {wikis.map((l, i) => (
            <button key={i} onClick={() => onNavigateWiki(l.title!)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 5px', margin: '0 -5px', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left', transition: 'background var(--transition)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-active)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}>
              <BookOpen size={11} style={{ color: '#5b9fe8', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
              <ExternalLink size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* Session links */}
      {sessions.length > 0 && (
        <div style={{ padding: '6px 11px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Sessions</div>
          {sessions.map((l, i) => (
            <button key={i} onClick={() => onNavigateSession(l.session_id!)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 5px', margin: '0 -5px', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left', transition: 'background var(--transition)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-active)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}>
              <Scroll size={11} style={{ color: 'var(--gold)', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Session {l.session_number}{l.session_sub}: {l.name}
              </span>
              <ExternalLink size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {wikis.length === 0 && sessions.length === 0 && (
        <div style={{ padding: '8px 11px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {editMode ? 'Click the pencil to add links' : 'No links yet'}
        </div>
      )}
      </div>
    </div>
  )
}

// ── POI Edit Modal ─────────────────────────────────────────────────────────────

function HubPOIEditModal({
  poi, links, sessions, articles,
  onSave, onDelete, onClose,
}: {
  poi: POI
  links: HubLink[]
  sessions: Session[]
  articles: { id: number; title: string }[]
  onSave: (label: string, description: string, links: HubLink[], color: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [label, setLabel] = useState(poi.label)
  const [poiColor, setPoiColor] = useState(poi.color || '#c8a84b')
  const [description, setDescription] = useState(extractPoiDescription(poi.content))
  const [editLinks, setEditLinks] = useState<HubLink[]>([...links])
  const [wikiSearch, setWikiSearch] = useState('')
  const [sessionSearch, setSessionSearch] = useState('')
  const { confirming: confirmingDelete, trigger: triggerDelete } = useConfirmDelete()

  const filteredArticles = articles.filter(a =>
    a.title.toLowerCase().includes(wikiSearch.toLowerCase()) &&
    !editLinks.some(l => l.type === 'wiki' && l.article_id === a.id)
  ).slice(0, 6)

  const filteredSessions = sessions.filter(s => {
    const label = `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`
    return label.toLowerCase().includes(sessionSearch.toLowerCase()) &&
      !editLinks.some(l => l.type === 'session' && l.session_id === s.id)
  }).slice(0, 6)

  const addWiki = (a: { id: number; title: string }) => {
    setEditLinks(prev => [...prev, { type: 'wiki', article_id: a.id, title: a.title }])
    setWikiSearch('')
  }

  const addSession = (s: Session) => {
    setEditLinks(prev => [...prev, { type: 'session', session_id: s.id, session_number: s.session_number, session_sub: s.session_sub, name: s.name }])
    setSessionSearch('')
  }

  const removeLink = (i: number) => setEditLinks(prev => prev.filter((_, idx) => idx !== i))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440, width: '100%' }}>
        <div className="modal-title">Edit location</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
          </div>

          <div className="input-group">
            <label className="input-label">Color</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['#c8a84b','#7aeada','#2eb370','#5b9fe8','#ce21dd','#f41111','#e88c3a','#8a2e2e','#8a8a8a','#e0e0e0'].map(c => (
                <button key={c} type="button" onClick={() => setPoiColor(c)}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, padding: 0, border: `2px solid ${poiColor === c ? 'var(--text-primary)' : 'transparent'}`, cursor: 'pointer', flexShrink: 0 }} />
              ))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)}
              style={{ minHeight: 64, resize: 'vertical', lineHeight: 1.5 }}
              placeholder="A fortified dwarven city carved into the mountains…" />
          </div>

          {/* Current links */}
          {editLinks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Linked</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {editLinks.map((l, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                    {l.type === 'wiki'
                      ? <BookOpen size={11} style={{ color: '#5b9fe8', flexShrink: 0 }} />
                      : <Scroll size={11} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {l.type === 'wiki' ? l.title : `Session ${l.session_number}${l.session_sub}: ${l.name}`}
                    </span>
                    <button onClick={() => removeLink(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1, flexShrink: 0, borderRadius: 3 }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add wiki link */}
          <div className="input-group">
            <label className="input-label">Link wiki article</label>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 28 }} placeholder="Search articles…"
                value={wikiSearch} onChange={e => setWikiSearch(e.target.value)} />
            </div>
            {wikiSearch && filteredArticles.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4 }}>
                {filteredArticles.map(a => (
                  <button key={a.id} onClick={() => addWiki(a)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                    <BookOpen size={11} style={{ color: '#5b9fe8' }} /> {a.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add session link */}
          <div className="input-group">
            <label className="input-label">Link session</label>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 28 }} placeholder="Search sessions…"
                value={sessionSearch} onChange={e => setSessionSearch(e.target.value)} />
            </div>
            {sessionSearch && filteredSessions.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4 }}>
                {filteredSessions.map(s => (
                  <button key={s.id} onClick={() => addSession(s)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                    <Scroll size={11} style={{ color: 'var(--gold)' }} />
                    Session {s.session_number}{s.session_sub}: {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            onClick={() => triggerDelete(onDelete)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: confirmingDelete ? '#ff7777' : '#e05555', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px' }}>
            <Trash2 size={13} /> {confirmingDelete ? 'Confirm' : 'Delete'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave(label.trim() || poi.label, description, editLinks, poiColor)}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hub World Map ──────────────────────────────────────────────────────────────

function HubWorldMap() {
  const { currentCampaign, sessions, articles, navigateToArticleByTitle, navigateToSessionById } = useStore()

  const [maps, setMaps] = useState<GameMap[]>([])
  const [localArticles, setLocalArticles] = useState<{ id: number; title: string }[]>([])
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [editMode, setEditMode] = useState(false)
  const [mapVisible, setMapVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem('worldmap-map-visible')
    return stored === null ? true : stored === 'true'
  })
  
  const [importing, setImporting] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [renamingMap, setRenamingMap] = useState<GameMap | null>(null)
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [hoveredPoiId, setHoveredPoiId] = useState<number | null>(null)
  const [editingPOI, setEditingPOI] = useState<POI | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  // ── Image-relative POI positioning ────────────────────────────────────────
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ w: width, h: Math.max(0, height - 34) })
    })
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: Math.max(0, el.clientHeight - 34) })
    return () => ro.disconnect()
  }, [])

  const imgBoundsRef = useRef<{ left: number; top: number; w: number; h: number } | null>(null)
  if (imgNatural && containerSize.w > 0 && containerSize.h > 0) {
    const s = Math.min(containerSize.w / imgNatural.w, containerSize.h / imgNatural.h)
    const w = imgNatural.w * s
    const h = imgNatural.h * s
    imgBoundsRef.current = { left: (containerSize.w - w) / 2, top: (containerSize.h - h) / 2, w, h }
  } else {
    imgBoundsRef.current = null
  }

  // ── Pan / zoom state ──────────────────────────────────────────────────────
  const [scale, setScaleState] = useState(1)
  const [offset, setOffsetState] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const setScale = (v: number) => { scaleRef.current = v; setScaleState(v) }
  const setOffset = (v: { x: number; y: number }) => { offsetRef.current = v; setOffsetState(v) }
  const panStart = useRef<{ mouseX: number; mouseY: number; ox: number; oy: number } | null>(null)
  const hasPanned = useRef(false)
  const isPanning = useRef(false)
  const [cursorStyle, setCursorStyle] = useState('grab')

  // ── Load maps ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((list: any[]) =>
      setLocalArticles(list.map((a: any) => ({ id: a.id, title: a.title })))
    )
    window.api.getMapsForCampaign(currentCampaign.id).then((fetched: GameMap[]) => {
      setMaps(fetched)
      const savedId = Number(localStorage.getItem(`worldmap-selected-${currentCampaign.id}`))
      const first = fetched.find(m => m.id === savedId) ?? fetched[0] ?? null
      setCurrentMap(first)
      if (first) window.api.getPOIs(first.id).then(setPois)
    })
  }, [currentCampaign?.id])

  // ── Load image + restore saved view when map changes ──────────────────────
  useEffect(() => {
    if (!currentMap) { setImageUrl(null); return }
    const saved = localStorage.getItem(`worldmap-view-${currentMap.id}`)
    if (saved) {
      try {
        const { scale: s, offset: o } = JSON.parse(saved)
        setScale(s); setOffset(o)
      } catch { setScale(1); setOffset({ x: 0, y: 0 }) }
    } else {
      setScale(1); setOffset({ x: 0, y: 0 })
    }
    setImgNatural(null)
    window.api.getImagePath(currentMap.image_path).then(setImageUrl)
  }, [currentMap?.id, currentMap?.image_path])

  // ── Persist viewport (scale + offset) per map, debounced; flush on unmount ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!currentMap) return
    const id = currentMap.id
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(`worldmap-view-${id}`, JSON.stringify({ scale, offset }))
      saveTimerRef.current = null
    }, 300)
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        localStorage.setItem(`worldmap-view-${id}`, JSON.stringify({ scale, offset }))
      }
    }
  }, [scale, offset, currentMap?.id])

  // ── Wheel zoom (hold Ctrl/Cmd; otherwise let the page scroll) ──────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    if (!mapRef.current) return
    const rect = mapRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top - 34
    const rawDelta = -e.deltaY * ZOOM_SPEED
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current * (1 + rawDelta)))
    const zf = newScale / scaleRef.current
    setScale(newScale)
    setOffset({ x: cx - zf * (cx - offsetRef.current.x), y: cy - zf * (cy - offsetRef.current.y) })
  }, [])

  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Pan handlers ──────────────────────────────────────────────────────────
  const handlePanDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-poi]')) return
    panStart.current = { mouseX: e.clientX, mouseY: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
    hasPanned.current = false
    isPanning.current = false
    setCursorStyle('grabbing')
  }

  const handlePanMove = (e: React.MouseEvent) => {
    if (!panStart.current) return
    const dx = e.clientX - panStart.current.mouseX
    const dy = e.clientY - panStart.current.mouseY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { hasPanned.current = true; isPanning.current = true }
    if (isPanning.current) setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy })
  }

  const handlePanUp = () => {
    panStart.current = null
    isPanning.current = false
    setCursorStyle(editMode ? 'crosshair' : 'grab')
  }

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  const zoomIn = () => {
    const cx = mapRef.current ? mapRef.current.offsetWidth / 2 : 0
    const cy = mapRef.current ? (mapRef.current.offsetHeight - 34) / 2 : 0
    const newScale = Math.min(MAX_SCALE, scaleRef.current * 1.25)
    const zf = newScale / scaleRef.current
    setOffset({ x: cx - zf * (cx - offsetRef.current.x), y: cy - zf * (cy - offsetRef.current.y) })
    setScale(newScale)
  }

  const zoomOut = () => {
    const cx = mapRef.current ? mapRef.current.offsetWidth / 2 : 0
    const cy = mapRef.current ? (mapRef.current.offsetHeight - 34) / 2 : 0
    const newScale = Math.max(MIN_SCALE, scaleRef.current * 0.8)
    const zf = newScale / scaleRef.current
    setOffset({ x: cx - zf * (cx - offsetRef.current.x), y: cy - zf * (cy - offsetRef.current.y) })
    setScale(newScale)
  }

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  // ── Map interactions ──────────────────────────────────────────────────────
  const handleSelectMap = (map: GameMap) => {
    setCurrentMap(map)
    if (currentCampaign) localStorage.setItem(`worldmap-selected-${currentCampaign.id}`, String(map.id))
    setPois([])
    setSelectedPOI(null)
    window.api.getPOIs(map.id).then(setPois)
  }

  const handleImport = async (result: { path: string; name: string }) => {
    if (!currentCampaign) return
    setImporting(true)
    const map = await window.api.createMap({ campaign_id: currentCampaign.id, name: result.name, image_path: result.path })
    setMaps((prev: GameMap[]) => [...prev, map])
    handleSelectMap(map)
    setImporting(false)
  }

  const handleDeleteMap = async (id: number) => {
    await window.api.deleteMap(id)
    setMaps((prev: GameMap[]) => {
      const next = prev.filter(m => m.id !== id)
      if (currentMap?.id === id) {
        const fallback = next[0] ?? null
        setCurrentMap(fallback)
        setPois([])
        setSelectedPOI(null)
        if (fallback) window.api.getPOIs(fallback.id).then(setPois)
      }
      return next
    })
  }

  const handleReplaceMapImage = async (map: GameMap) => {
    const result = await (window.api as any).replaceMapImage(map.id)
    if (!result) return
    const updated = await window.api.updateMap(map.id, { image_path: result.path })
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
    if (currentMap?.id === updated.id) {
      setCurrentMap(updated)
      window.api.getImagePath(updated.image_path).then(setImageUrl)
    }
  }

  const handleRenameMap = async (map: GameMap, name: string) => {
    if (!name.trim()) { setRenamingMap(null); return }
    const updated = await window.api.updateMap(map.id, { name: name.trim() })
    setMaps((prev: GameMap[]) => prev.map(m => m.id === updated.id ? updated : m))
    if (currentMap?.id === updated.id) setCurrentMap(updated)
    setRenamingMap(null)
  }

  // ── POI click — popup positioned in screen space ──────────────────────────
  const handlePOIClick = (poi: POI, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedPOI?.id === poi.id) { setSelectedPOI(null); setPopupPos(null); return }
    const rect = mapRef.current!.getBoundingClientRect()
    // Convert POI % coords through the current transform to screen space
    const ib = imgBoundsRef.current
    const dotX = offsetRef.current.x + (ib ? (ib.left + poi.x / 100 * ib.w) : (poi.x / 100 * rect.width)) * scaleRef.current
    const dotY = 34 + offsetRef.current.y + (ib ? (ib.top + poi.y / 100 * ib.h) : (poi.y / 100 * (rect.height - 34))) * scaleRef.current
    const popW = 224, popH = 200
    let left = dotX + 14
    let top = dotY - 16
    if (left + popW > rect.width - 4) left = dotX - popW - 14
    if (top + popH > rect.height - 8) top = rect.height - popH - 8
    if (top < 38) top = 38
    setSelectedPOI(poi)
    setPopupPos({ top, left })
  }

  // ── Map background click to place POI ────────────────────────────────────
  const handleMapClick = (e: React.MouseEvent) => {
    if (hasPanned.current) { hasPanned.current = false; return }
    if (!editMode || !currentMap) return
    if ((e.target as HTMLElement).closest('[data-poi]')) return
    const rect = mapRef.current!.getBoundingClientRect()
    const ib = imgBoundsRef.current
    if (!ib) return
    const innerX = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current
    const innerY = (e.clientY - rect.top - 34 - offsetRef.current.y) / scaleRef.current
    const x = (innerX - ib.left) / ib.w * 100
    const y = (innerY - ib.top) / ib.h * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return
    window.api.createPOI({ map_id: currentMap.id, label: 'New Location', x, y }).then((poi: POI) => {
      setPois((prev: POI[]) => [...prev, poi])
      setSelectedPOI(poi)
      setEditingPOI(poi)
    })
  }

  // ── POI drag (scale-aware) ────────────────────────────────────────────────
  const dragRef = useRef<{ poi: POI; startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handlePOIMouseDown = (poi: POI, e: React.MouseEvent) => {
    if (!editMode) return
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { poi, startX: e.clientX, startY: e.clientY, origX: poi.x, origY: poi.y }
    const onMove = (mv: MouseEvent) => {
      if (!dragRef.current || !mapRef.current) return
      const rect = mapRef.current.getBoundingClientRect()
      const ib2 = imgBoundsRef.current
      const bw2 = ib2 ? ib2.w : rect.width
      const bh2 = ib2 ? ib2.h : (rect.height - 34)
      const dx = ((mv.clientX - dragRef.current.startX) / (bw2 * scaleRef.current)) * 100
      const dy = ((mv.clientY - dragRef.current.startY) / (bh2 * scaleRef.current)) * 100
      const newX = Math.max(0, Math.min(100, dragRef.current.origX + dx))
      const newY = Math.max(0, Math.min(100, dragRef.current.origY + dy))
      setPois((prev: POI[]) => prev.map(p => p.id === poi.id ? { ...p, x: newX, y: newY } : p))
      if (selectedPOI?.id === poi.id) setSelectedPOI(prev => prev ? { ...prev, x: newX, y: newY } : prev)
    }
    const onUp = async (uv: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!dragRef.current || !mapRef.current) return
      const rect = mapRef.current.getBoundingClientRect()
      const moved = Math.abs(uv.clientX - dragRef.current.startX) > 4 || Math.abs(uv.clientY - dragRef.current.startY) > 4
      if (moved) {
        const ib3 = imgBoundsRef.current
        const bw3 = ib3 ? ib3.w : rect.width
        const bh3 = ib3 ? ib3.h : (rect.height - 34)
        const dx = ((uv.clientX - dragRef.current.startX) / (bw3 * scaleRef.current)) * 100
        const dy = ((uv.clientY - dragRef.current.startY) / (bh3 * scaleRef.current)) * 100
        const newX = Math.max(0, Math.min(100, dragRef.current.origX + dx))
        const newY = Math.max(0, Math.min(100, dragRef.current.origY + dy))
        await window.api.updatePOI(poi.id, { x: newX, y: newY })
      }
      dragRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── POI save / delete ─────────────────────────────────────────────────────
  const handleSavePOI = async (label: string, description: string, links: HubLink[], color: string) => {
    if (!editingPOI) return
    const content = makePoiContent(description)
    const hub_links = JSON.stringify(links)
    const updated = await window.api.updatePOI(editingPOI.id, { label, content, hub_links, color } as any)
    setPois((prev: POI[]) => prev.map(p => p.id === updated.id ? updated : p))
    setSelectedPOI(updated)
    setEditingPOI(null)
  }

  const handleDeletePOI = async () => {
    if (!editingPOI) return
    await window.api.deletePOI(editingPOI.id)
    setPois((prev: POI[]) => prev.filter(p => p.id !== editingPOI.id))
    setSelectedPOI(null)
    setEditingPOI(null)
    setPopupPos(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Map panel */}
      <div
        ref={mapRef}
        style={{
          position: 'relative', width: '100%', height: mapVisible ? 500 : 34,
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          background: 'var(--bg-elevated)',
          cursor: cursorStyle,
          userSelect: 'none',
        }}
        onMouseDown={handlePanDown}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanUp}
        onMouseLeave={handlePanUp}
        onClick={handleMapClick}
      >
        {/* Tab strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.55)', borderBottom: '1px solid rgba(255,255,255,0.07)', zIndex: 10 }}>
          {maps.map(map => (
            <div key={map.id}
              onClick={e => { e.stopPropagation(); handleSelectMap(map) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px 0 12px', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.07)', borderBottom: currentMap?.id === map.id ? '2px solid #c8733a' : '2px solid transparent', background: currentMap?.id === map.id ? 'rgba(200,115,58,0.12)' : 'transparent', color: currentMap?.id === map.id ? '#c8733a' : 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: currentMap?.id === map.id ? 600 : 400, whiteSpace: 'nowrap', userSelect: 'none', transition: 'all var(--transition)', position: 'relative' }}
              onMouseEnter={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Map size={11} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</span>
              {editMode && (
                <button onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === map.id ? null : map.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', padding: '0 2px', marginLeft: 2, borderRadius: 2 }}>
                  <MoreHorizontal size={11} />
                </button>
              )}
              {editMode && menuOpenId === map.id && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 36, left: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 130, zIndex: 100, overflow: 'hidden' }}>
                  <button onClick={() => { setRenamingMap(map); setMenuOpenId(null) }} className="menu-item">
                    <Pencil size={12} /> Rename
                  </button>
                  <button onClick={() => { handleReplaceMapImage(map); setMenuOpenId(null) }} className="menu-item">
                    <ImageIcon size={12} /> Replace image
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <button onClick={() => { handleDeleteMap(map.id); setMenuOpenId(null) }} className="menu-item menu-item-danger">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
          {editMode && (
            <button onClick={e => { e.stopPropagation(); setShowPicker(true) }} disabled={importing}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: importing ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'color var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'}>
              <Upload size={11} /> {importing ? 'Importing…' : 'Add map'}
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0 12px', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
            {editMode
              ? <button onClick={e => { e.stopPropagation(); setEditMode(false); setSelectedPOI(null) }} style={{ background: 'rgba(200,115,58,0.2)', border: '1px solid rgba(200,115,58,0.4)', color: '#c8733a', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>Done</button>
              : <button onClick={e => { e.stopPropagation(); setEditMode(true) }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', transition: 'all var(--transition)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' }}>
                  Edit
                </button>
            }
          </div>
        </div>

        {/* Empty state */}
        {maps.length === 0 && (
          <EmptyState
            style={{ position: 'absolute', inset: 0, gap: 14 }}
            icon={<Map size={44} strokeWidth={1} color="var(--border-light)" />}
            title="No world map yet"
            description="Import a PNG or JPEG to get started"
            action={
              <button className="btn btn-primary" onClick={e => { e.stopPropagation(); setShowPicker(true) }} disabled={importing}
                style={{ background: '#c8733a', borderColor: '#c8733a' }}>
                <Upload size={14} /> {importing ? 'Importing…' : 'Import Map'}
              </button>
            }
          />
        )}

        {/* Transformable content layer (below tab strip) */}
        {maps.length > 0 && (
          <div style={{ position: 'absolute', top: 34, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: '0 0',
            }}>
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={currentMap?.name}
                  onLoad={e => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
                  draggable={false}
                />
              )}
              {imageUrl && imgBoundsRef.current && (
              <div style={{ position: 'absolute', left: imgBoundsRef.current.left, top: imgBoundsRef.current.top, width: imgBoundsRef.current.w, height: imgBoundsRef.current.h }}>
              {pois.map(poi => (
                <div key={poi.id} data-poi="1"
                  style={{ position: 'absolute', left: `${poi.x}%`, top: `${poi.y}%`, transform: 'translate(-50%, -50%)', zIndex: 5 }}
                  onMouseDown={e => handlePOIMouseDown(poi, e)}
                  onMouseEnter={() => setHoveredPoiId(poi.id)}
                  onMouseLeave={() => setHoveredPoiId(null)}
                  onClick={e => handlePOIClick(poi, e)}
                >
                  {hoveredPoiId === poi.id && !editingPOI && (
                    <div style={{
                      position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                      marginBottom: 5, whiteSpace: 'nowrap',
                      background: 'rgba(0,0,0,0.75)', color: '#fff',
                      fontSize: 10, padding: '2px 7px', borderRadius: 3,
                      pointerEvents: 'none',
                    }}>{poi.label}</div>
                  )}
                  <div style={{
                    width: 11, height: 11, borderRadius: '50%',
                    background: poi.color || '#c8a84b',
                    border: '1.5px solid rgba(0,0,0,0.5)',
                    cursor: editMode ? 'move' : 'pointer',
                    boxShadow: selectedPOI?.id === poi.id ? `0 0 0 4px ${poi.color || '#c8a84b'}44` : 'none',
                    transition: 'box-shadow 0.15s',
                  }} />
                </div>
              ))}
              </div>
              )}
            </div>
          </div>
        )}

        {/* Popup — rendered outside the transform layer in map-panel space */}
        {selectedPOI && popupPos && !editingPOI && (
          <div style={{ position: 'absolute', top: popupPos.top, left: popupPos.left, zIndex: 20 }}
            onClick={e => e.stopPropagation()}>
            <HubPOIPopup
              poi={selectedPOI}
              links={parseHubLinks((selectedPOI as any).hub_links || '[]')}
              onClose={() => { setSelectedPOI(null); setPopupPos(null) }}
              onEdit={() => setEditingPOI(selectedPOI)}
              editMode={editMode}
              onNavigateWiki={title => navigateToArticleByTitle(title)}
              onNavigateSession={id => navigateToSessionById(id)}
            />
          </div>
        )}

        {/* Click outside popup closes it */}
        {selectedPOI && !editingPOI && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 4 }}
            onClick={() => { setSelectedPOI(null); setPopupPos(null) }} />
        )}

        {/* Zoom controls */}
        {maps.length > 0 && mapVisible && (
          <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 15, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '4px 8px' }}
            onMouseDown={e => e.stopPropagation()}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginRight: 2, whiteSpace: 'nowrap' }}>Ctrl + scroll</span>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
            <button onClick={zoomOut} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>−</button>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>+</button>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
            <button onClick={resetView} title="Reset view" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
              <Maximize size={11} />
            </button>
          </div>
        )}

        {/* Edit hint */}
        {editMode && (
          <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 10, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none', userSelect: 'none', zIndex: 15 }}>
            Click to place · drag to move · scroll to zoom
          </div>
        )}
      </div>

      {/* Modals */}
      {showPicker && currentCampaign && (
        <MapPickerModal
          campaignId={currentCampaign.id}
          onPickExisting={(result: { path: string; name: string }) => { setShowPicker(false); handleImport(result) }}
          onUploadNew={async () => {
            setShowPicker(false)
            setImporting(true)
            const result = await window.api.importMapForCampaign(currentCampaign.id)
            if (result) await handleImport(result)
            setImporting(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {renamingMap && (
        <Modal title="Rename map" onClose={() => setRenamingMap(null)}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" defaultValue={renamingMap.name} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRenameMap(renamingMap, (e.target as HTMLInputElement).value) }}
              id="rename-map-input" />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setRenamingMap(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => {
              const val = (document.getElementById('rename-map-input') as HTMLInputElement)?.value || ''
              handleRenameMap(renamingMap, val)
            }}>Save</button>
          </div>
        </Modal>
      )}

      {editingPOI && (
        <HubPOIEditModal
          poi={editingPOI}
          links={parseHubLinks((editingPOI as any).hub_links || '[]')}
          sessions={sessions}
          articles={localArticles}
          onSave={handleSavePOI}
          onDelete={handleDeletePOI}
          onClose={() => setEditingPOI(null)}
        />
      )}
    </div>
  )
}

// ── Hub Card ───────────────────────────────────────────────────────────────────

function HubCard({ icon, title, description, stat, onClick, accent = 'var(--gold)' }: {
  icon: React.ReactNode; title: string; description: string; stat?: string; onClick: () => void; accent?: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16,
        padding: '28px 24px',
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: `1px solid ${hovered ? accent : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)', cursor: 'pointer', textAlign: 'left',
        transition: 'all 180ms ease',
        boxShadow: hovered ? `0 0 24px ${accent}18` : 'none',
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: `${accent}18`, border: `1px solid ${accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0, transition: 'all 180ms ease' }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: hovered ? accent : 'var(--text-primary)', letterSpacing: '0.04em', marginBottom: 5, transition: 'color 180ms ease' }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      {stat && (
        <div style={{ fontSize: 11, color: accent, fontFamily: 'var(--font-ui)', letterSpacing: '0.06em', opacity: 0.8 }}>
          {stat}
        </div>
      )}
    </button>
  )
}

// ── ColorPicker ────────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ARC_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, padding: 0, border: `2px solid ${value === c ? 'var(--text-primary)' : 'transparent'}`, cursor: 'pointer', transition: 'border 120ms ease' }} />
      ))}
    </div>
  )
}

// ── Arc Modals ─────────────────────────────────────────────────────────────────

function CreateArcModal({ onClose }: { onClose: () => void }) {
  const { createArc } = useStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(ARC_COLORS[0])
  const [saving, setSaving] = useState(false)
  const handleSubmit = async () => {
    if (!name.trim()) return; setSaving(true)
    await createArc({ name: name.trim(), color }); onClose()
  }
  return (
    <Modal title="New Arc" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="input-group">
          <label className="input-label">Arc Name</label>
          <input className="input" placeholder="Northern Expedition…" value={name}
            onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        <div className="input-group">
          <label className="input-label">Colour</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
          {saving ? 'Creating…' : 'Create Arc'}
        </button>
      </div>
    </Modal>
  )
}

function EditArcModal({ arc, onClose }: { arc: Arc; onClose: () => void }) {
  const { updateArc } = useStore()
  const [name, setName] = useState(arc.name)
  const [color, setColor] = useState(arc.color)
  const [saving, setSaving] = useState(false)
  const handleSubmit = async () => {
    if (!name.trim()) return; setSaving(true)
    await updateArc(arc.id, { name: name.trim(), color }); onClose()
  }
  return (
    <Modal title="Edit Arc" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="input-group">
          <label className="input-label">Arc Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        <div className="input-group">
          <label className="input-label">Colour</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

function EditSessionModal({ session, onClose }: { session: SessionExt; onClose: () => void }) {
  const { updateSession, sessions, arcs } = useStore()
  const [name, setName] = useState(session.name)
  const [sessionNumber, setSessionNumber] = useState(session.session_number)
  const [sessionSub, setSessionSub] = useState(session.session_sub ?? '')
  const [arcId, setArcId] = useState<number | null>(session.arc_id)
  const [date, setDate] = useState(session.date ?? '')
  const [inWorldDayStart, setInWorldDayStart] = useState<string>(() => {
    const d = session.in_world_day
    return d ? JSON.stringify({ day: d, year: 1507, label: `Day ${d}, Year 1507` }) : ''
  })
  const [inWorldDayEnd, setInWorldDayEnd] = useState<string>(() => {
    const d = session.in_world_day_end
    return d ? JSON.stringify({ day: d, year: 1507, label: `Day ${d}, Year 1507` }) : ''
  })
  const [saving, setSaving] = useState(false)
  const subClean = sessionSub.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)
  const isDuplicate = sessions.some(s => s.id !== session.id && s.session_number === sessionNumber && s.session_sub === subClean)

  const handleSubmit = async () => {
    if (!name.trim() || isDuplicate) return
    setSaving(true)
    try {
      const startDay = parseDay(inWorldDayStart)
      const endDay = parseDay(inWorldDayEnd)
      // Ensure end >= start
      const safeEnd = startDay && endDay && endDay < startDay ? startDay : endDay
      await updateSession(session.id, {
        name: name.trim(), session_number: sessionNumber, session_sub: subClean,
        arc_id: arcId, date: date || null,
        in_world_day: startDay, in_world_day_end: safeEnd,
      } as any)
      onClose()
    } catch { setSaving(false) }
  }

  return (
    <Modal title="Edit Session" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="input-group" style={{ flex: '0 0 80px' }}>
            <label className="input-label">Session #</label>
            <input className="input" type="number" min={1} value={sessionNumber}
              onChange={e => setSessionNumber(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ textAlign: 'center', color: 'var(--gold)', fontWeight: 600 }} />
          </div>
          <div className="input-group" style={{ flex: '0 0 72px' }}>
            <label className="input-label">Sub (opt.)</label>
            <input className="input" placeholder="a, b…" value={sessionSub}
              onChange={e => setSessionSub(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3))}
              style={{ textAlign: 'center' }} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-display)', paddingBottom: 6 }}>
            → Session {sessionNumber}{subClean}
          </div>
        </div>
        {isDuplicate && <div style={{ fontSize: 12, color: '#e05555' }}>Session {sessionNumber}{subClean} already exists</div>}
        <div className="input-group">
          <label className="input-label">Session Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        {arcs.length > 1 && (
          <div className="input-group">
            <label className="input-label">Arc</label>
            <select className="input" value={arcId ?? ''} onChange={e => setArcId(e.target.value ? parseInt(e.target.value) : null)}>
              {arcs.map(a => <option key={a.id} value={a.id}>{a.name}{a.is_default ? ' (default)' : ''}</option>)}
            </select>
          </div>
        )}
        <div className="input-group">
          <label className="input-label">Real-world date</label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <InWorldDatePicker value={inWorldDayStart} onChange={raw => {
            setInWorldDayStart(raw)
            const sd = parseDay(raw)
            const ed = parseDay(inWorldDayEnd)
            if (sd !== null && (ed === null || ed < sd)) setInWorldDayEnd(raw)
          }} label="In-world start" />
          <InWorldDatePicker value={inWorldDayEnd} onChange={raw => {
            const sd = parseDay(inWorldDayStart)
            const ed = parseDay(raw)
            setInWorldDayEnd(sd !== null && ed !== null && ed < sd ? inWorldDayStart : raw)
          }} label="In-world end (optional)" />
        </div>
        {(() => {
          const s = parseDay(inWorldDayStart), e = parseDay(inWorldDayEnd)
          if (!s) return null
          const label = e && e > s ? `Day ${s}–${e}, Year 1507 (${e - s + 1} days)` : `Day ${s}, Year 1507`
          return <div style={{ fontSize: 11, color: 'var(--gold)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 10px' }}>{label}</div>
        })()}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving || isDuplicate}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

// ── Arc / Session row components ──────────────────────────────────
function SessionRow({ session, arc }: { session: Session; arc: Arc }) {
  const { selectSession, deleteSession } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  useMenuClose(menuOpen, menuRef, setMenuOpen)

  return (
    <>
      <div
        onClick={() => selectSession(session)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 120ms ease', position: 'relative' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = arc.color; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: `${arc.color}18`, border: `1px solid ${arc.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Scroll size={13} color={arc.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: arc.color, letterSpacing: '0.04em' }}>
              {session.session_number}{session.session_sub}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.name}
            </span>
          </div>
          
          {session.date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, color: 'var(--text-muted)', fontSize: 11 }}>
              <Calendar size={10} />
              {new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
            <Map size={10} /> {(session as any).map_count ?? 0} maps
          </span>
        </div>

        <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '3px 2px', borderRadius: 3 }}>
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 140, zIndex: 50, overflow: 'hidden' }}>
              <button onClick={() => { selectSession(session); setMenuOpen(false) }} className="menu-item">
                <ChevronRight size={13} /> Select
              </button>
              <button onClick={() => { setEditOpen(true); setMenuOpen(false) }} className="menu-item">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={e => { e.stopPropagation(); triggerDelete(() => { deleteSession(session.id); setMenuOpen(false) }) }}
                className="menu-item menu-item-danger" style={confirmDelete ? { color: '#ff7777' } : undefined}>
                <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
      {editOpen && <EditSessionModal session={session} onClose={() => setEditOpen(false)} />}
    </>
  )
}

function ArcMenu({ arc, onEdit }: { arc: Arc; onEdit: () => void }) {
  const { deleteArc } = useStore()
  const [open, setOpen] = useState(false)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  const menuRef = useRef<HTMLDivElement>(null)
  useMenuClose(open, menuRef, setOpen)
  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(o => !o)} style={{ color: 'var(--text-muted)' }}>
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 140, zIndex: 50, overflow: 'hidden' }}>
          <button onClick={() => { onEdit(); setOpen(false) }} className="menu-item">
            <Pencil size={13} /> Rename
          </button>
          {!arc.is_default && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button onClick={() => triggerDelete(() => { deleteArc(arc.id); setOpen(false) })}
                className="menu-item menu-item-danger" style={confirmDelete ? { color: '#ff7777' } : undefined}>
                <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ArcSection({ arc, sessions, sortAsc, onAddSession }: { arc: Arc; sessions: Session[]; sortAsc: boolean; onAddSession: (arcId: number) => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const sorted = [...sessions].sort((a, b) => {
    const numDiff = a.session_number - b.session_number
    if (numDiff !== 0) return sortAsc ? numDiff : -numDiff
    return sortAsc ? (a.session_sub ?? '').localeCompare(b.session_sub ?? '') : (b.session_sub ?? '').localeCompare(a.session_sub ?? '')
  })
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
        <button onClick={() => setCollapsed(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: arc.color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: arc.color, letterSpacing: '0.04em' }}>{arc.name}</span>
          {arc.is_default && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>default</span>}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 99, border: '1px solid var(--border-light)' }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
          {collapsed ? <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronUp size={13} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
        </button>
        <ArcMenu arc={arc} onEdit={() => setEditOpen(true)} />
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, paddingLeft: 18 }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
              No sessions in this arc yet
            </div>
          ) : sorted.map(s => <SessionRow key={s.id} session={s} arc={arc} />)}
          <button onClick={() => onAddSession(arc.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'none', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', transition: 'all 120ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = arc.color; (e.currentTarget as HTMLElement).style.color = arc.color }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
            <Plus size={11} /> Add session to {arc.name}
          </button>
        </div>
      )}
      {editOpen && <EditArcModal arc={arc} onClose={() => setEditOpen(false)} />}
    </>
  )
}

// ── Create Session Modal ───────────────────────────────────────────────────────

function CreateSessionModal({ defaultArcId, onClose }: { defaultArcId: number | null; onClose: () => void }) {
  const { createSession, arcs, lastUsedArcId, currentCampaign, sessions } = useStore()
  const [name, setName] = useState('')
  const [sessionNumber, setSessionNumber] = useState(() => {
    const nums = sessions.map(s => s.session_number)
    return nums.length > 0 ? Math.max(...nums) + 1 : 1
  })
  const [sessionSub, setSessionSub] = useState('')
  const [arcId, setArcId] = useState<number | null>(() => {
    if (defaultArcId && arcs.some(a => a.id === defaultArcId)) return defaultArcId
    const lastArc = currentCampaign ? lastUsedArcId[currentCampaign.id] : null
    if (lastArc && arcs.some(a => a.id === lastArc)) return lastArc
    return arcs.find(a => a.is_default)?.id ?? arcs[0]?.id ?? null
  })
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await createSession({ name: name.trim(), session_number: sessionNumber, session_sub: sessionSub.trim(), arc_id: arcId, date: date || undefined })
    onClose()
  }

  return (
    <Modal title="New Session" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 60px 1fr', gap: 10 }}>
          <div className="input-group">
            <label className="input-label">Session #</label>
            <input className="input" type="number" value={sessionNumber} onChange={e => setSessionNumber(parseInt(e.target.value) || 1)} min={1} />
          </div>
          <div className="input-group">
            <label className="input-label">Sub</label>
            <input className="input" placeholder="a…" value={sessionSub} onChange={e => setSessionSub(e.target.value)} maxLength={4} />
          </div>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" placeholder="The Iron Gate…" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Arc</label>
          <select className="input" value={arcId ?? ''} onChange={e => setArcId(e.target.value ? parseInt(e.target.value) : null)}>
            {arcs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Date <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
          {saving ? 'Creating…' : 'Create Session'}
        </button>
      </div>
    </Modal>
  )
}

// ── Sessions View ──────────────────────────────────────────────────────────────

function SessionsView({ onBack }: { onBack: () => void }) {
  const { currentCampaign, sessions, arcs } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [createArcOpen, setCreateArcOpen] = useState(false)
  const [preselectedArcId, setPreselectedArcId] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState<boolean>(() => {
    try { return localStorage.getItem('dmforge:session-sort') !== 'desc' } catch { return true }
  })

  // ── Search ────────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [searchTitle, setSearchTitle] = useState(true)
  const [searchNotes, setSearchNotes] = useState(true)
  const [searchPOIs, setSearchPOIs] = useState(true)
  const [poiIndex, setPoiIndex] = useState<Record<number, string[]>>({})
  const [poiIndexLoaded, setPoiIndexLoaded] = useState(false)

  // Load POI texts lazily the first time POI search is active with a query
  useEffect(() => {
    if (!searchPOIs || poiIndexLoaded || !currentCampaign || !query.trim()) return
    window.api.getSessionPoiTexts(currentCampaign.id).then(rows => {
      const idx: Record<number, string[]> = {}
      rows.forEach(row => {
        const text = [row.label?.toLowerCase(), extractAllText(row.content)].filter(Boolean).join(' ')
        if (!idx[row.session_id]) idx[row.session_id] = []
        idx[row.session_id].push(text)
      })
      setPoiIndex(idx)
      setPoiIndexLoaded(true)
    })
  }, [searchPOIs, poiIndexLoaded, currentCampaign?.id, query])

  // Invalidate POI index when campaign changes
  useEffect(() => { setPoiIndex({}); setPoiIndexLoaded(false) }, [currentCampaign?.id])

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(s => {
      if (searchTitle && s.name.toLowerCase().includes(q)) return true
      if (searchNotes && extractAllText(s.notes).includes(q)) return true
      if (searchPOIs && poiIndex[s.id]?.some(t => t.includes(q))) return true
      return false
    })
  }, [sessions, query, searchTitle, searchNotes, searchPOIs, poiIndex])

  const toggleSort = () => {
    const next = !sortAsc; setSortAsc(next)
    try { localStorage.setItem('dmforge:session-sort', next ? 'asc' : 'desc') } catch {}
  }
  const handleAddSession = (arcId: number) => { setPreselectedArcId(arcId); setShowCreate(true) }
  if (!currentCampaign) return null
  const defaultArc = arcs.find(a => a.is_default)
  const sortedArcs = [...arcs].sort((a, b) => a.name.localeCompare(b.name))
  const sessionsForArc = (arcId: number) =>
    filteredSessions.filter(s => s.arc_id === arcId || (s.arc_id === null && arcId === defaultArc?.id))

  const isSearching = query.trim().length > 0
  const arcsWithResults = isSearching ? sortedArcs.filter(arc => sessionsForArc(arc.id).length > 0) : sortedArcs


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)', gap: 6 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, letterSpacing: '0.04em', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              <Scroll size={20} color="var(--gold)" /> Sessions
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => setCreateArcOpen(true)}><Layers size={15} /> New Arc</button>
            <button className="btn btn-primary" onClick={() => { setPreselectedArcId(null); setShowCreate(true) }}>
              <Plus size={15} /> New Session
            </button>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>

        {/* Search bar */}
        <div style={{ marginBottom: 20, maxWidth: 680 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search sessions…"
              style={{
                width: '100%', paddingLeft: 30, paddingRight: query ? 28 : 10,
                paddingTop: 7, paddingBottom: 7, background: 'var(--bg-elevated)',
                border: `1px solid ${query ? 'var(--border-gold)' : 'var(--border-light)'}`,
                borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-primary)',
                outline: 'none', transition: 'border-color 120ms',
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{
                position: 'absolute', right: 8, background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2,
              }}><X size={12} /></button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Search in:</span>
            {(['Title', 'Notes', 'POIs'] as const).map(label => {
              const active = label === 'Title' ? searchTitle : label === 'Notes' ? searchNotes : searchPOIs
              const toggle = label === 'Title' ? () => setSearchTitle(v => !v) : label === 'Notes' ? () => setSearchNotes(v => !v) : () => setSearchPOIs(v => !v)
              return (
                <button key={label} onClick={toggle} style={{
                  padding: '2px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer', transition: 'all 100ms',
                  background: active ? 'rgba(200,168,75,0.09)' : 'transparent',
                  border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border-light)'}`,
                  color: active ? 'var(--gold)' : 'var(--text-muted)',
                }}>{label}</button>
              )
            })}
          </div>
        </div>

        {/* Count + sort row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <BookOpen size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, flex: 1 }}>
            {isSearching
              ? `${filteredSessions.length} of ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`
              : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
          </span>
          <button onClick={toggleSort}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}>
            <ArrowUpDown size={11} /> Sessions {sortAsc ? '↑' : '↓'}
          </button>
        </div>

        {sessions.length === 0 && arcs.length <= 1 ? (
          <EmptyState
            style={{ height: 300, gap: 12 }}
            icon={<BookOpen size={40} strokeWidth={1} color="var(--border-light)" />}
            title="No sessions yet"
            description="Add your first session to start planning"
            action={<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Add Session</button>}
          />
        ) : isSearching && filteredSessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            No sessions match <span style={{ color: 'var(--text-secondary)' }}>"{query}"</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}>
            {arcsWithResults.map(arc => (
              <ArcSection key={arc.id} arc={arc} sessions={sessionsForArc(arc.id)} sortAsc={sortAsc} onAddSession={handleAddSession} />
            ))}
          </div>
        )}
      </div>
      {showCreate && <CreateSessionModal defaultArcId={preselectedArcId} onClose={() => { setShowCreate(false); setPreselectedArcId(null) }} />}
      {createArcOpen && <CreateArcModal onClose={() => setCreateArcOpen(false)} />}
    </div>
  )
}

// ── Hub Settings ──────────────────────────────────────────────────────────────

type HubPanelKey = 'worldMap' | 'recentlyUpdated' | 'articlesByType' | 'sessionTimeline' | 'activeQuests'


const HUB_PANEL_DEFAULTS: Record<HubPanelKey, boolean> = {
  worldMap: true, recentlyUpdated: true, articlesByType: true, sessionTimeline: true, activeQuests: true,
}

function loadHubPanels(campaignId: number): Record<HubPanelKey, boolean> {
  try {
    const stored = localStorage.getItem(`hub-panels-${campaignId}`)
    if (stored) return { ...HUB_PANEL_DEFAULTS, ...JSON.parse(stored) }
  } catch {}
  return { ...HUB_PANEL_DEFAULTS }
}

function saveHubPanels(campaignId: number, panels: Record<HubPanelKey, boolean>) {
  localStorage.setItem(`hub-panels-${campaignId}`, JSON.stringify(panels))
}

const PANEL_LABELS: Record<HubPanelKey, string> = {
  worldMap: 'World map',
  recentlyUpdated: 'Recently updated',
  articlesByType: 'Articles by type',
  sessionTimeline: 'Session timeline',
  activeQuests: 'Active quests',
}

function HubSettingsMenu({ panels, onChange }: {
  panels: Record<HubPanelKey, boolean>
  onChange: (k: HubPanelKey, v: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useMenuClose(open, ref, setOpen)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Customise hub"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11, background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}
      >
        <Eye size={11} /> Customise
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 190, zIndex: 50, overflow: 'hidden' }}>
          {(Object.keys(PANEL_LABELS) as HubPanelKey[]).map((key, i) => (
            <div key={key}>
              {i === 1 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}
              <button
                onClick={() => onChange(key, !panels[key])}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left', transition: 'background 80ms' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
              >
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${panels[key] ? 'var(--gold)' : 'var(--border)'}`, background: panels[key] ? 'var(--gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 120ms' }}>
                  {panels[key] && <span style={{ fontSize: 9, color: '#000', fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </div>
                {PANEL_LABELS[key]}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Recently Updated Panel ─────────────────────────────────────────────────────

function RecentlyUpdatedPanel() {
  const { currentCampaign, openArticle, setView } = useStore()
  const [items, setItems] = useState<{ id: number; title: string; article_type: string; updated_at: string }[]>([])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((list: any[]) => {
      const sorted = [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setItems(sorted.slice(0, 6))
    })
  }, [currentCampaign?.id])

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  if (items.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>Recently updated</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, i) => (
          <button key={item.id} onClick={() => { openArticle(item.id); setView('wiki') }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', background: 'none', border: 'none', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            className="hover-opacity"
          >
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ARTICLE_TYPE_COLORS[item.article_type] ?? 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(item.updated_at)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Active Quests Panel ────────────────────────────────────────────────────────

function ActiveQuestsPanel() {
  const { currentCampaign, openArticle, setView } = useStore()
  const [quests, setQuests] = useState<{
    id: number; title: string; updated_at: string
    type: string; substeps: any[]; questGiver: string; playerCharacter: string
  }[]>([])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'quest' }).then((list: any[]) => {
      const active = list
        .map(a => {
          let tracks: any = {}, substeps: any[] = []
          try { tracks = JSON.parse(a.tracks || '{}') } catch {}
          try { substeps = JSON.parse((a as any).substeps || '[]') } catch {}
          return {
            id: a.id, title: a.title, updated_at: a.updated_at,
            status: tracks.Status || '',
            type: tracks.Type || '',
            questGiver: tracks.Quest_Giver || '',
            playerCharacter: tracks.Player_Character || '',
            substeps,
          }
        })
        .filter(q => q.status === 'Active')
        .sort((a, b) => {
          // Main first, then by recent update
          const aMain = a.type === 'Main' ? 0 : 1
          const bMain = b.type === 'Main' ? 0 : 1
          if (aMain !== bMain) return aMain - bMain
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
      setQuests(active)
    })
  }, [currentCampaign?.id])

  const QUEST_TYPE_COLORS: Record<string, string> = {
    Main: '#e88c3a', Side: '#5b9fe8', Personal: '#9b7de8', Faction: '#49c185',
  }

  if (quests.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Active quests</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{quests.length}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {quests.map((q, i) => {
          const total = q.substeps.length
          const done  = q.substeps.filter(s => s.status === 'complete').length
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0
          const color = QUEST_TYPE_COLORS[q.type] ?? 'var(--text-muted)'

          return (
            <button key={q.id} onClick={() => { openArticle(q.id); setView('wiki') }}
              style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 0', background: 'none', border: 'none', borderBottom: i < quests.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
                {q.type && (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: color + '18', border: `1px solid ${color}44`, color, flexShrink: 0 }}>
                    {q.type}
                  </span>
                )}
                {total > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{done}/{total}</span>
                )}
              </div>
              {q.playerCharacter && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 15, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>for</span>
                  <span style={{ color: '#9b7de8' }}>{q.playerCharacter}</span>
                </div>
              )}
              {total > 0 && (
                <div style={{ marginLeft: 15, height: 2, background: 'var(--border-light)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#49c185' : color, transition: 'width 200ms' }} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Articles By Type Panel ─────────────────────────────────────────────────────

function ArticlesByTypePanel() {
  const { currentCampaign } = useStore()
  const [counts, setCounts] = useState<{ type: string; count: number; color: string }[]>([])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((list: any[]) => {
      const map: Record<string, number> = {}
      list.forEach((a: any) => { map[a.article_type] = (map[a.article_type] ?? 0) + 1 })
      const sorted = Object.entries(map)
        .map(([type, count]) => ({ type, count, color: ARTICLE_TYPE_COLORS[type] ?? '#8a8a8a' }))
        .sort((a, b) => b.count - a.count)
      setCounts(sorted)
    })
  }, [currentCampaign?.id])

  if (counts.length === 0) return null
  const max = Math.max(...counts.map(c => c.count))

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>Articles by type</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {counts.map(({ type, count, color }) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 72, flexShrink: 0, textTransform: 'capitalize' }}>{type}</span>
            <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 99, height: 5 }}>
              <div style={{ width: `${Math.round(count / max * 100)}%`, height: 5, borderRadius: 99, background: color }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Campaign Detail Page ───────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { currentCampaign, sessions, setView } = useStore()
  const { campaignSubView: subView, setCampaignSubView: setSubView } = useStore()
  const [noteCount, setNoteCount] = useState(0)
  const [articleCount, setArticleCount] = useState(0)
  const [lootCount, setLootCount] = useState(0)
  const [relationsCount, setRelationsCount] = useState(0)
  const [hubPanels, setHubPanels] = useState<Record<HubPanelKey, boolean>>(() =>
    currentCampaign ? loadHubPanels(currentCampaign.id) : { ...HUB_PANEL_DEFAULTS }
  )

  useEffect(() => {
    if (currentCampaign) setHubPanels(loadHubPanels(currentCampaign.id))
  }, [currentCampaign?.id])

  const togglePanel = (key: HubPanelKey, value: boolean) => {
    if (!currentCampaign) return
    setHubPanels(prev => {
      const next = { ...prev, [key]: value }
      saveHubPanels(currentCampaign.id, next)
      return next
    })
  }

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getDMNotesPages(currentCampaign.id).then((p: any[]) => setNoteCount(p.length))
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((a: any[]) => setArticleCount(a.length))
    window.api.getLootTables(currentCampaign.id).then((t: any[]) => setLootCount(t.length))
    window.api.getRelationWebs(currentCampaign.id).then((w: any[]) => setRelationsCount(w.length))
  }, [currentCampaign?.id])

  if (!currentCampaign) return null

  if (subView === 'sessions') {
    return <SessionsView onBack={() => setSubView('hub')} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '28px 40px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="badge badge-gold">{currentCampaign.system}</span>
            </div>
            <h1 style={{ fontSize: 28, letterSpacing: '0.04em' }}>{currentCampaign.name}</h1>
          </div>
          <div style={{ paddingTop: 6 }}>
            <HubSettingsMenu panels={hubPanels} onChange={togglePanel} />
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 40px 40px' }}>

        {/* World map embedded */}
        {hubPanels.worldMap && <HubWorldMap />}

        {/* Dashboard panels */}
        {(hubPanels.recentlyUpdated || hubPanels.articlesByType || hubPanels.sessionTimeline || hubPanels.activeQuests) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
            {hubPanels.recentlyUpdated && <RecentlyUpdatedPanel />}
            {hubPanels.activeQuests && <ActiveQuestsPanel />}
            {hubPanels.articlesByType && <ArticlesByTypePanel />}
            {hubPanels.sessionTimeline && (
              <div style={{ gridColumn: '1 / -1' }}>
                <TimelineEmbed />
              </div>
            )}
          </div>
        )}

        {/* Hub cards */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 16 }}>
          Where to?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          <HubCard
            icon={<Scroll size={20} />} title="Sessions"
            description="Plan and run your sessions, manage maps, points of interest, and combat encounters."
            stat={sessions.length > 0 ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}` : undefined}
            onClick={() => setSubView('sessions')} accent="var(--gold)"
          />
          <HubCard
            icon={<BookOpen size={20} />} title="Wiki"
            description="Browse and edit your campaign compendium — characters, locations, factions, lore, and more."
            stat={articleCount > 0 ? `${articleCount} article${articleCount !== 1 ? 's' : ''}` : undefined}
            onClick={() => setView('wiki')} accent="#5b9fe8"
          />
          <HubCard
            icon={<Sparkles size={20} />} title="DM Notes"
            description="A freeform scratchpad with wiki, session, and spell links for planning on the fly."
            stat={noteCount > 0 ? `${noteCount} note${noteCount !== 1 ? 's' : ''}` : undefined}
            onClick={() => setView('dm-notes')} accent="#9b7de8"
          />
          <HubCard
            icon={<ShoppingBag size={20} />} title="Loot Tables"
            description="Manage reusable loot tables for creatures and vendors. Edit master tables that update all references live."
            stat={lootCount > 0 ? `${lootCount} table${lootCount !== 1 ? 's' : ''}` : undefined}
            onClick={() => setView('loot-tables')} accent="#49c185"
          />
          <HubCard
            icon={<Network size={20} />} title="Relations"
            description="Map relationships between characters, factions, and entities. Build family trees, hierarchies, and political webs."
            stat={relationsCount > 0 ? `${relationsCount} web${relationsCount !== 1 ? 's' : ''}` : undefined}
            onClick={() => setView('relations')} accent="#b07de8"
          />
          <HubCard
            icon={<Clock size={20} />} title="Timeline"
            description="Visualise your campaign history — arc spans, sessions, and world events on a scrollable in-world timeline."
            onClick={() => setView('timeline')} accent="#5bbfb0"
          />
        </div>
      </div>
    </div>
  )
}