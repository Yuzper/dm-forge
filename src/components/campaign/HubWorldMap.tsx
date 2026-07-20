// path: src/components/campaign/HubWorldMap.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/store'
import {
  Map, BookOpen, MoreHorizontal, Trash2, Pencil,
  Scroll, Upload, X, Search, ExternalLink,
  Maximize, Image as ImageIcon, List,
} from 'lucide-react'
import type { Session, GameMap, POI } from '../../types'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import Modal from '../Modal'
import { SECTION_ACCENTS } from '../../constants/sections'
import SwatchPicker from '../SwatchPicker'

// Article-link icons on map pins are wiki-flavoured, so they borrow that accent.
const WIKI_ACCENT = SECTION_ACCENTS['wiki']
import EmptyState from '../EmptyState'

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
                className="hover-text"
                title="Edit">
                <Pencil size={11} />
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px 3px', borderRadius: 3, transition: 'color var(--transition)' }}
              className="hover-text"
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
              className="hover-bg-active">
              <BookOpen size={11} style={{ color: WIKI_ACCENT, flexShrink: 0 }} />
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
              className="hover-bg-active">
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
  onSave: (label: string, description: string, links: HubLink[], color: string, size: number, opacity: number) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [label, setLabel] = useState(poi.label)
  const [poiColor, setPoiColor] = useState(poi.color || '#c8a84b')
  const [poiSize, setPoiSize] = useState(poi.hub_size ?? 11)
  const [poiOpacity, setPoiOpacity] = useState(Math.round((poi.hub_opacity ?? 1) * 100))
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
    <Modal title="Edit location" onClose={onClose} style={{ maxWidth: 440, width: '100%' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
          </div>

          <div className="input-group">
            <label className="input-label">Color</label>
            <SwatchPicker value={poiColor} onChange={setPoiColor} size={20} />
          </div>

          <div className="input-group">
            <label className="input-label">Marker</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 52, flexShrink: 0 }}>Size</span>
                  <input type="range" min={6} max={28} step={1} value={poiSize}
                    onChange={e => setPoiSize(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }}>{poiSize}px</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 52, flexShrink: 0 }}>Opacity</span>
                  <input type="range" min={10} max={100} step={5} value={poiOpacity}
                    onChange={e => setPoiOpacity(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }}>{poiOpacity}%</span>
                </div>
              </div>
              {/* Live preview */}
              <div style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ width: poiSize, height: poiSize, borderRadius: '50%', background: poiColor, opacity: poiOpacity / 100, border: '1.5px solid rgba(0,0,0,0.5)' }} />
              </div>
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
                      ? <BookOpen size={11} style={{ color: WIKI_ACCENT, flexShrink: 0 }} />
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
                    className="hover-bg-elevated">
                    <BookOpen size={11} style={{ color: WIKI_ACCENT }} /> {a.title}
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
                    className="hover-bg-elevated">
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: confirmingDelete ? 'var(--danger-hover)' : 'var(--danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px' }}>
            <Trash2 size={13} /> {confirmingDelete ? 'Confirm' : 'Delete'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave(label.trim() || poi.label, description, editLinks, poiColor, poiSize, poiOpacity / 100)}>
              Save
            </button>
          </div>
        </div>
    </Modal>
  )
}

// ── Hub World Map ──────────────────────────────────────────────────────────────

export default function HubWorldMap({ fullBleed = false, onHasMapsChange, listSlot = null }: {
  fullBleed?: boolean
  onHasMapsChange?: (has: boolean) => void
  // In the map hub, the location list is portaled into this left-stack slot so it
  // stacks below the floating panels instead of overlapping them.
  listSlot?: HTMLElement | null
}) {
  const { currentCampaign, sessions, navigateToArticleByTitle, navigateToSessionById } = useStore()

  const [maps, setMaps] = useState<GameMap[]>([])
  const [localArticles, setLocalArticles] = useState<{ id: number; title: string }[]>([])
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [editMode, setEditMode] = useState(false)
  const [mapVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem('worldmap-map-visible')
    return stored === null ? true : stored === 'true'
  })
  
  const [importing, setImporting] = useState(false)
  const [renamingMap, setRenamingMap] = useState<GameMap | null>(null)
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [hoveredPoiId, setHoveredPoiId] = useState<number | null>(null)
  const [showPoiList, setShowPoiList] = useState(() => localStorage.getItem('worldmap-poi-list') === 'true')
  const [poiListFilter, setPoiListFilter] = useState('')
  const togglePoiList = () => setShowPoiList(v => { localStorage.setItem('worldmap-poi-list', String(!v)); return !v })
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
      onHasMapsChange?.(fetched.length > 0)
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

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
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
    onHasMapsChange?.(true)
    handleSelectMap(map)
    setImporting(false)
  }

  const handleUploadNew = async () => {
    if (!currentCampaign) return
    const result = await window.api.importMapForCampaign(currentCampaign.id)
    if (result) await handleImport(result)
  }

  const handleDeleteMap = async (id: number) => {
    await window.api.deleteMap(id)
    setMaps((prev: GameMap[]) => {
      const next = prev.filter(m => m.id !== id)
      onHasMapsChange?.(next.length > 0)
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

  // ── POI popup positioning ─────────────────────────────────────────────────
  // Convert a POI's % coords through the current transform to map-panel space.
  const computePopupPos = (poi: POI) => {
    const rect = mapRef.current!.getBoundingClientRect()
    const ib = imgBoundsRef.current
    const dotX = offsetRef.current.x + (ib ? (ib.left + poi.x / 100 * ib.w) : (poi.x / 100 * rect.width)) * scaleRef.current
    const dotY = 34 + offsetRef.current.y + (ib ? (ib.top + poi.y / 100 * ib.h) : (poi.y / 100 * (rect.height - 34))) * scaleRef.current
    const popW = 224, popH = 200
    let left = dotX + 14
    let top = dotY - 16
    if (left + popW > rect.width - 4) left = dotX - popW - 14
    if (top + popH > rect.height - 8) top = rect.height - popH - 8
    if (top < 38) top = 38
    return { top, left }
  }

  const handlePOIClick = (poi: POI, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedPOI?.id === poi.id) { setSelectedPOI(null); setPopupPos(null); return }
    setSelectedPOI(poi)
    setPopupPos(computePopupPos(poi))
  }

  // ── Focus a POI from the list — recenter the map on it, then open its popup ─
  const focusPOIFromList = (poi: POI) => {
    const ib = imgBoundsRef.current
    if (ib && containerSize.w > 0 && containerSize.h > 0) {
      const cx = ib.left + poi.x / 100 * ib.w
      const cy = ib.top + poi.y / 100 * ib.h
      // setOffset updates offsetRef synchronously, so computePopupPos below sees it.
      setOffset({ x: containerSize.w / 2 - scaleRef.current * cx, y: containerSize.h / 2 - scaleRef.current * cy })
    }
    setSelectedPOI(poi)
    setPopupPos(computePopupPos(poi))
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
  const handleSavePOI = async (label: string, description: string, links: HubLink[], color: string, size: number, opacity: number) => {
    if (!editingPOI) return
    const content = makePoiContent(description)
    const hub_links = JSON.stringify(links)
    const updated = await window.api.updatePOI(editingPOI.id, { label, content, hub_links, color, hub_size: size, hub_opacity: opacity } as any)
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

  // ── Location list panel ───────────────────────────────────────────────────
  // `stacked` = rendered in the map hub's left panel column (static flow, capped
  // height); otherwise floats absolutely over the classic-hub map.
  const renderLocationList = (stacked: boolean) => {
    const visible = [...pois]
      .filter(p => p.label.toLowerCase().includes(poiListFilter.trim().toLowerCase()))
      .sort((a, b) => a.label.localeCompare(b.label))
    return (
      <div
        style={{
          width: 214, display: 'flex', flexDirection: 'column', zIndex: 16,
          background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, overflow: 'hidden',
          ...(stacked
            ? { maxHeight: 340 }
            : { position: 'absolute', top: 42, left: 10, maxHeight: 'calc(100% - 84px)' }),
        }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <List size={12} style={{ color: 'rgba(255,255,255,0.55)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
            Locations
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{pois.length}</span>
          <button onClick={togglePoiList} title="Hide list"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', padding: 2 }}>
            <X size={12} />
          </button>
        </div>

        {/* Filter (only when the list is long enough to warrant it) */}
        {pois.length > 6 && (
          <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              value={poiListFilter}
              onChange={e => setPoiListFilter(e.target.value)}
              placeholder="Filter…"
              style={{
                width: '100%', height: 24, fontSize: 11, padding: '0 8px',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4, color: '#fff', outline: 'none',
              }}
            />
          </div>
        )}

        {/* Rows */}
        <div style={{ overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
              {pois.length === 0 ? 'No locations on this map' : 'No matches'}
            </div>
          ) : visible.map(poi => (
            <button
              key={poi.id}
              onMouseEnter={() => setHoveredPoiId(poi.id)}
              onMouseLeave={() => setHoveredPoiId(null)}
              onClick={() => focusPOIFromList(poi)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                background: hoveredPoiId === poi.id ? 'rgba(255,255,255,0.09)'
                  : selectedPOI?.id === poi.id ? 'rgba(200,115,58,0.16)' : 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background var(--transition)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: poi.color || '#c8a84b', flexShrink: 0, border: '1px solid rgba(0,0,0,0.4)' }} />
              <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {poi.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={fullBleed ? { height: '100%' } : undefined}>
      {/* Map-hub location list — portaled into MapHub's left stack so it sits
          below the floating panels rather than overlapping them. */}
      {fullBleed && listSlot && maps.length > 0 && showPoiList && createPortal(renderLocationList(true), listSlot)}

      {/* Map panel */}
      <div
        ref={mapRef}
        style={{
          position: 'relative', width: '100%', height: fullBleed ? '100%' : (mapVisible ? 520 : 34),
          borderRadius: fullBleed ? 0 : 'var(--radius-lg)',
          border: fullBleed ? 'none' : '1px solid var(--border)',
          overflow: 'hidden',
          background: fullBleed ? 'var(--bg-base)' : 'var(--bg-elevated)',
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
            <button onClick={e => { e.stopPropagation(); handleUploadNew() }} disabled={importing}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: importing ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'color var(--transition)', '--hover-accent': 'rgba(255,255,255,0.65)' } as React.CSSProperties}
              className="hover-accent">
              <Upload size={11} /> {importing ? 'Importing…' : 'Add map'}
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
            {maps.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); togglePoiList() }}
                title={showPoiList ? 'Hide location list' : 'Show location list'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: showPoiList ? 'rgba(200,115,58,0.2)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${showPoiList ? 'rgba(200,115,58,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  color: showPoiList ? '#c8733a' : 'rgba(255,255,255,0.55)',
                  borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', transition: 'all var(--transition)',
                }}
              >
                <List size={12} /> Locations
              </button>
            )}
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
              <button className="btn btn-primary" onClick={e => { e.stopPropagation(); handleUploadNew() }} disabled={importing}
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
                    width: poi.hub_size ?? 11, height: poi.hub_size ?? 11, borderRadius: '50%',
                    background: poi.color || '#c8a84b',
                    border: '1.5px solid rgba(0,0,0,0.5)',
                    cursor: editMode ? 'move' : 'pointer',
                    // Hover/selection restores full opacity so faded markers stay findable
                    opacity: hoveredPoiId === poi.id || selectedPOI?.id === poi.id ? 1 : (poi.hub_opacity ?? 1),
                    // Ring on select or hover (incl. hovering the location list) so the
                    // highlighted marker is easy to spot.
                    boxShadow: selectedPOI?.id === poi.id ? `0 0 0 4px ${poi.color || '#c8a84b'}44`
                      : hoveredPoiId === poi.id ? `0 0 0 3px ${poi.color || '#c8a84b'}66` : 'none',
                    transition: 'box-shadow 0.15s, opacity 0.15s',
                  }} />
                </div>
              ))}
              </div>
              )}
            </div>
          </div>
        )}

        {/* Location list, classic hub: floats top-left over the map (its cell has
            no other overlays). In the map hub it's portaled into the left stack
            instead — see the portal render below. */}
        {maps.length > 0 && showPoiList && mapVisible && !fullBleed && renderLocationList(false)}

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
        {maps.length > 0 && (mapVisible || fullBleed) && (
          <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 15, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '4px 8px' }}
            onMouseDown={e => e.stopPropagation()}>
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
          <div style={{ position: 'absolute', ...(fullBleed ? { top: 42, left: 14 } : { bottom: 10, left: 12 }), fontSize: 10, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none', userSelect: 'none', zIndex: 15 }}>
            Click to place · drag to move · scroll to zoom
          </div>
        )}
      </div>

      {/* Modals */}

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

