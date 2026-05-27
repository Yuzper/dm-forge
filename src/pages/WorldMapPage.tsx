// path: src/pages/WorldMapPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { Map, Upload, MoreHorizontal, Pencil, Trash2, ChevronLeft } from 'lucide-react'
import { useStore } from '../store/store'
import { MapContext } from '../context/MapContext'
import MapCanvas from '../components/MapCanvas'
import POIPanel from '../components/POIPanel'
import MapPickerModal from '../components/MapPickerModal'
import type { GameMap, POI } from '../types'
import type { MapContextValue } from '../context/MapContext'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

// ── Tab menu ──────────────────────────────────────────────────────────────────

function MapTabMenu({ map, onRename, onDelete }: { map: GameMap; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuRef = { current: null as HTMLDivElement | null }
  const btnRef = { current: null as HTMLButtonElement | null }
  const { confirming, trigger } = useConfirmDelete()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const rect = btnRef.current!.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 14px', background: 'none', border: 'none',
    color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
  }

  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        ref={el => { btnRef.current = el }}
        onClick={handleOpen}
        style={{ background: 'none', border: 'none', padding: '2px 3px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderRadius: 3 }}
      >
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div
          ref={el => { menuRef.current = el }}
          style={{
            position: 'fixed', top: menuPos.top, right: menuPos.right,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
            minWidth: 140, zIndex: 1000, overflow: 'hidden',
          }}
        >
          <button onClick={() => { onRename(); setOpen(false) }} style={menuItemStyle}>
            <Pencil size={13} /> Rename
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            onClick={e => { e.stopPropagation(); trigger(() => { onDelete(); setOpen(false) }) }}
            style={{ ...menuItemStyle, color: confirming ? '#ff7777' : '#e05555' }}
          >
            <Trash2 size={13} /> {confirming ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Rename modal ───────────────────────────────────────────────────────────────

function RenameMapModal({ map, onSave, onClose }: { map: GameMap; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(map.name)
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Rename Map</div>
        <div className="input-group">
          <label className="input-label">Map Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            autoFocus onKeyDown={e => e.key === 'Enter' && onSave(name.trim())} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(name.trim())} disabled={!name.trim()}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WorldMapPage() {
  const { currentCampaign, setView, setCampaignSubView } = useStore()

  const [maps, setMaps] = useState<GameMap[]>([])
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [poiPanelOpen, setPoiPanelOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [renamingMap, setRenamingMap] = useState<GameMap | null>(null)

  if (!currentCampaign) return null

  // ── Load maps on mount ────────────────────────────────────────────────────
  useEffect(() => {
    window.api.getMapsForCampaign(currentCampaign.id).then(fetched => {
      setMaps(fetched)
      const first = fetched[0] ?? null
      setCurrentMap(first)
      setPois([])
      setSelectedPOI(null)
      setPoiPanelOpen(false)
      if (first) window.api.getPOIs(first.id).then(setPois)
    })
  }, [currentCampaign.id])

  // ── Map selection ──────────────────────────────────────────────────────────
  const handleSelectMap = useCallback((map: GameMap) => {
    setCurrentMap(map)
    setPois([])
    setSelectedPOI(null)
    setPoiPanelOpen(false)
    window.api.getPOIs(map.id).then(setPois)
  }, [])

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = async (result: { path: string; name: string }) => {
    setImporting(true)
    const map = await window.api.createMap({ campaign_id: currentCampaign.id, name: result.name, image_path: result.path })
    setMaps(prev => [...prev, map])
    handleSelectMap(map)
    setImporting(false)
  }

  const handleUploadNew = async () => {
    setShowPicker(false)
    setImporting(true)
    const result = await window.api.importMapForCampaign(currentCampaign.id)
    if (result) await handleImport(result)
    setImporting(false)
  }

  // ── Rename / delete ────────────────────────────────────────────────────────
  const handleRenameMap = async (name: string) => {
    if (!renamingMap || !name) return
    const updated = await window.api.updateMap(renamingMap.id, { name })
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
    if (currentMap?.id === updated.id) setCurrentMap(updated)
    setRenamingMap(null)
  }

  const handleDeleteMap = async (id: number) => {
    await window.api.deleteMap(id)
    setMaps(prev => {
      const next = prev.filter(m => m.id !== id)
      if (currentMap?.id === id) {
        const fallback = next[0] ?? null
        setCurrentMap(fallback)
        setPois([])
        setSelectedPOI(null)
        setPoiPanelOpen(false)
        if (fallback) window.api.getPOIs(fallback.id).then(setPois)
      }
      return next
    })
  }

  // ── POI callbacks ──────────────────────────────────────────────────────────
  const selectPOI = useCallback((p: POI | null) => {
    setSelectedPOI(p)
    setPoiPanelOpen(p !== null)
  }, [])

  const createPOI = useCallback(async (x: number, y: number) => {
    if (!currentMap) return
    const poi = await window.api.createPOI({ map_id: currentMap.id, label: 'New Location', x, y })
    setPois(prev => [...prev, poi])
    selectPOI(poi)
  }, [currentMap, selectPOI])

  const updatePOI = useCallback(async (id: number, data: Partial<POI>) => {
    const updated = await window.api.updatePOI(id, data)
    setPois(prev => prev.map(p => p.id === id ? updated : p))
    setSelectedPOI(prev => prev?.id === id ? updated : prev)
  }, [])

  const deletePOI = useCallback(async (id: number) => {
    await window.api.deletePOI(id)
    setPois(prev => prev.filter(p => p.id !== id))
    setSelectedPOI(null)
    setPoiPanelOpen(false)
  }, [])

  const optimisticMovePOI = useCallback((id: number, x: number, y: number) => {
    setPois(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
    setSelectedPOI(prev => prev?.id === id ? { ...prev, x, y } : prev)
  }, [])

  // ── Context value ──────────────────────────────────────────────────────────
  const ctx: MapContextValue = {
    currentMap, pois, selectedPOI, poiPanelOpen, editMode,
    selectPOI, createPOI, updatePOI, deletePOI, optimisticMovePOI,
  }

  return (
    <MapContext.Provider value={ctx}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{
          padding: '0 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          minHeight: 48,
        }}>
          {/* Back */}
          <button
            onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '0 16px', background: 'transparent', border: 'none',
              borderRight: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: 12,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'color var(--transition)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >
            <ChevronLeft size={14} /> Back
          </button>

          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
            <Map size={14} color="#c8733a" />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#c8733a', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
              World Map
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentCampaign.name}
            </div>
          </div>

          {/* Map tabs */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1, overflowX: 'auto', overflowY: 'visible' }}>
            {maps.map(map => (
              <div
                key={map.id}
                onClick={() => handleSelectMap(map)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 10px 0 14px',
                  cursor: 'pointer',
                  borderRight: '1px solid var(--border)',
                  borderBottom: currentMap?.id === map.id ? '2px solid #c8733a' : '2px solid transparent',
                  background: currentMap?.id === map.id ? 'var(--bg-active)' : 'transparent',
                  color: currentMap?.id === map.id ? '#c8733a' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: currentMap?.id === map.id ? 600 : 400,
                  transition: 'all var(--transition)',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
                onMouseEnter={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Map size={11} />
                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</span>
                {editMode && (
                  <MapTabMenu
                    map={map}
                    onRename={() => setRenamingMap(map)}
                    onDelete={() => handleDeleteMap(map.id)}
                  />
                )}
              </div>
            ))}

            {/* Import button */}
            <button
              onClick={() => setShowPicker(true)}
              disabled={importing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 14px',
                background: 'transparent', border: 'none',
                borderRight: '1px solid var(--border)',
                color: 'var(--text-muted)', fontSize: 12,
                cursor: importing ? 'wait' : 'pointer',
                transition: 'color var(--transition)',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#c8733a'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
            >
              <Upload size={12} />
              {importing ? 'Importing…' : 'Add Map'}
            </button>
          </div>

          {/* Edit toggle */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
            {editMode
              ? <button className="btn btn-sm btn-ghost" onClick={() => setEditMode(false)} style={{ fontSize: 12 }}>Done</button>
              : <button className="btn btn-sm" onClick={() => setEditMode(true)} style={{ fontSize: 12 }}>Edit</button>
            }
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {maps.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-muted)' }}>
              <Map size={52} strokeWidth={1} color="var(--border-light)" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 6 }}>No world map yet</div>
                <div style={{ fontSize: 13 }}>Import a PNG or JPEG image to get started</div>
              </div>
              <button className="btn btn-primary" onClick={() => setShowPicker(true)} disabled={importing}
                style={{ background: '#c8733a', borderColor: '#c8733a' }}>
                <Upload size={14} /> {importing ? 'Importing…' : 'Import Map Image'}
              </button>
            </div>
          ) : (
            <>
              <MapCanvas readMode={!editMode} />
              <POIPanel readMode={!editMode} />
            </>
          )}
        </div>

        {/* ── Modals ── */}
        {renamingMap && (
          <RenameMapModal
            map={renamingMap}
            onSave={handleRenameMap}
            onClose={() => setRenamingMap(null)}
          />
        )}

        {showPicker && (
          <MapPickerModal
            campaignId={currentCampaign.id}
            onPickExisting={result => { setShowPicker(false); handleImport(result) }}
            onUploadNew={handleUploadNew}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </MapContext.Provider>
  )
}