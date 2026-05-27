import { useState, useEffect, useCallback, useRef } from 'react'
import { Map, Upload, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { MapContext } from '../context/MapContext'
import MapCanvas from '../components/MapCanvas'
import POIPanel from '../components/POIPanel'
import MapPickerModal from '../components/MapPickerModal'
import type { GameMap, POI } from '../types'
import type { MapContextValue } from '../context/MapContext'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

// ── Small inline rename modal (mirrors MapTabMenu in SessionPage) ─────────────
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

// ── Tab context menu ──────────────────────────────────────────────────────────

function MapTabMenu({ map, onRename, onDelete }: { map: GameMap; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
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
      <button ref={btnRef} onClick={handleOpen}
        style={{ background: 'none', border: 'none', padding: '2px 3px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderRadius: 3 }}>
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div ref={menuRef} style={{
          position: 'fixed', top: menuPos.top, right: menuPos.right,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 140, zIndex: 1000, overflow: 'hidden',
        }}>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function LocationMapSection({ articleId, readMode, campaignId }: { articleId: number; readMode: boolean; campaignId: number }) {
  const [maps, setMaps] = useState<GameMap[]>([])
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [poiPanelOpen, setPoiPanelOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [renamingMap, setRenamingMap] = useState<GameMap | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const editMode = !readMode

  // ── Load maps on mount / article change ────────────────────────────────────
  const loadPOIs = useCallback(async (mapId: number) => {
    const p = await window.api.getPOIs(mapId)
    setPois(p)
  }, [])

  useEffect(() => {
    window.api.getMapsForArticle(articleId).then(fetched => {
      setMaps(fetched)
      const first = fetched[0] ?? null
      setCurrentMap(first)
      setPois([])
      setSelectedPOI(null)
      setPoiPanelOpen(false)
      if (first) loadPOIs(first.id)
    })
  }, [articleId, loadPOIs])

  // ── Map selection ──────────────────────────────────────────────────────────
  const handleSelectMap = useCallback((map: GameMap) => {
    setCurrentMap(map)
    setPois([])
    setSelectedPOI(null)
    setPoiPanelOpen(false)
    loadPOIs(map.id)
  }, [loadPOIs])

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = async (result: { path: string; name: string }) => {
    setImporting(true)
    const map = await window.api.createMap({ article_id: articleId, name: result.name, image_path: result.path })
    setMaps(prev => [...prev, map])
    handleSelectMap(map)
    setImporting(false)
  }

  const handleUploadNew = async () => {
    setShowPicker(false)
    setImporting(true)
    const result = await window.api.importMapForArticle(articleId)
    if (result) await handleImport(result)
    setImporting(false)
  }

  // ── Map rename / delete ────────────────────────────────────────────────────
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
        if (fallback) loadPOIs(fallback.id)
      }
      return next
    })
  }

  // ── Context actions ────────────────────────────────────────────────────────
  const selectPOI = useCallback((p: POI | null) => {
    setSelectedPOI(p)
    setPoiPanelOpen(p !== null)
  }, [])

  const createPOI = useCallback(async (x: number, y: number) => {
    if (!currentMap) return
    const poi = await window.api.createPOI({ map_id: currentMap.id, label: 'New POI', x, y })
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
    setSelectedPOI(prev => prev?.id === id ? null : prev)
    setPoiPanelOpen(false)
  }, [])

  const optimisticMovePOI = useCallback((id: number, x: number, y: number) => {
    setPois(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
    setSelectedPOI(prev => prev?.id === id ? { ...prev, x, y } : prev)
  }, [])

  // ── Build context value ────────────────────────────────────────────────────
  const ctxValue: MapContextValue = {
    currentMap, pois, selectedPOI, poiPanelOpen, editMode,
    selectPOI, createPOI, updatePOI, deletePOI, optimisticMovePOI,
  }

  // ── Empty state (read mode, no maps) ──────────────────────────────────────
  if (maps.length === 0 && readMode) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '24px 16px', textAlign: 'center',
        border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)',
        color: 'var(--text-muted)',
      }}>
        <Map size={28} strokeWidth={1} color="var(--border-light)" />
        <span style={{ fontSize: 13 }}>No map — switch to Edit to add one</span>
      </div>
    )
  }

  return (
    <MapContext.Provider value={ctxValue}>
      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        borderBottom: '1px solid var(--border)',
        marginBottom: 0,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {maps.map(map => (
          <div
            key={map.id}
            onClick={() => handleSelectMap(map)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px 0 12px', height: 36,
              cursor: 'pointer',
              borderRight: '1px solid var(--border)',
              borderBottom: currentMap?.id === map.id ? '2px solid var(--gold)' : '2px solid transparent',
              background: currentMap?.id === map.id ? 'var(--bg-active)' : 'transparent',
              color: currentMap?.id === map.id ? 'var(--gold)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: currentMap?.id === map.id ? 600 : 400,
              transition: 'all var(--transition)', whiteSpace: 'nowrap', userSelect: 'none',
            }}
            onMouseEnter={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <Map size={11} />
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</span>
            {editMode && (
              <MapTabMenu
                map={map}
                onRename={() => setRenamingMap(map)}
                onDelete={() => handleDeleteMap(map.id)}
              />
            )}
          </div>
        ))}

        {editMode && (
          <button
            onClick={() => setShowPicker(true)}
            disabled={importing}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '0 12px', background: 'transparent', border: 'none',
              borderRight: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: 12,
              cursor: importing ? 'wait' : 'pointer',
              transition: 'color var(--transition)', whiteSpace: 'nowrap', height: 36,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >
            <Upload size={11} />
            {importing ? 'Importing…' : maps.length === 0 ? 'Import Map Image' : 'Add Map'}
          </button>
        )}
      </div>

      {/* ── Canvas + panel ── */}
      <div style={{
        height: 480, display: 'flex', overflow: 'hidden',
        border: '1px solid var(--border)', borderTop: 'none',
        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
      }}>
        {maps.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)', background: '#0a0908' }}>
            <Map size={40} strokeWidth={1} color="var(--border-light)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No map yet</div>
              <div style={{ fontSize: 12 }}>Import a PNG or JPEG map image above</div>
            </div>
          </div>
        ) : (
          <>
            <MapCanvas readMode={readMode} />
            <POIPanel readMode={readMode} />
          </>
        )}
      </div>

      {/* ── Rename modal ── */}
      {renamingMap && (
        <RenameMapModal
          map={renamingMap}
          onSave={handleRenameMap}
          onClose={() => setRenamingMap(null)}
        />
      )}

      {/* ── Map picker modal ── */}
      {showPicker && (
        <MapPickerModal
          campaignId={campaignId}
          onPickExisting={result => { setShowPicker(false); handleImport(result) }}
          onUploadNew={handleUploadNew}
          onClose={() => setShowPicker(false)}
        />
      )}
    </MapContext.Provider>
  )
}