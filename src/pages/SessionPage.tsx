// path: src/pages/SessionPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import { Map, Upload, MoreHorizontal, Trash2, Pencil, ChevronLeft } from 'lucide-react'
import MapCanvas from '../components/MapCanvas'
import POIPanel from '../components/POIPanel'
import type { GameMap } from '../types'

function EditMapModal({ map, onClose }: { map: GameMap; onClose: () => void }) {
  const { updateMap } = useStore()
  const [name, setName] = useState(map.name)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateMap(map.id, { name: name.trim() })
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Rename Map</div>
        <div className="input-group">
          <label className="input-label">Map Name</label>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', background: 'none', border: 'none',
  color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-ui)',
  cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease',
}

function MapTabMenu({ map, onEdit }: { map: GameMap; onEdit: () => void }) {
  const { deleteMap, selectMap } = useStore()
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

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

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const rect = btnRef.current!.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
    setConfirmDelete(false)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteMap(map.id)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          background: 'none', border: 'none', padding: '2px 3px',
          cursor: 'pointer', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', borderRadius: 3,
          transition: 'color var(--transition)',
        }}
        title="Map options"
      >
        <MoreHorizontal size={13} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            minWidth: 150,
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <button onClick={() => { selectMap(map); setOpen(false) }} style={menuItemStyle}>
            <Map size={13} /> Select
          </button>
          <button onClick={() => { onEdit(); setOpen(false) }} style={menuItemStyle}>
            <Pencil size={13} /> Rename
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button onClick={handleDelete} style={{ ...menuItemStyle, color: confirmDelete ? '#ff7777' : '#e05555' }}>
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function SessionPage() {
  const {
    currentSession, currentCampaign, selectCampaign,
    maps, currentMap, selectMap,
    importMap, poiPanelOpen,
    sessionReadMode, setSessionReadMode,
  } = useStore()

  const [importing, setImporting] = useState(false)
  const [editingMap, setEditingMap] = useState<GameMap | null>(null)

  if (!currentSession) return null

  const handleImportMap = async () => {
    if (!currentSession) return
    setImporting(true)
    await importMap(currentSession.id)
    setImporting(false)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
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
        {/* Back button */}
        <button
          onClick={() => currentCampaign && selectCampaign(currentCampaign)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 16px',
            background: 'transparent', border: 'none',
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

        {/* Session title + Edit/Done toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold)', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            Session {currentSession.session_number}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentSession.name}
          </div>
        </div>

        {/* Map tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1, overflowX: 'auto', overflowY: 'visible' }}>
          {maps.map(map => (
            <div
              key={map.id}
              onClick={() => selectMap(map)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px 0 14px',
                cursor: 'pointer',
                borderRight: '1px solid var(--border)',
                borderBottom: currentMap?.id === map.id ? '2px solid var(--gold)' : '2px solid transparent',
                background: currentMap?.id === map.id ? 'var(--bg-active)' : 'transparent',
                color: currentMap?.id === map.id ? 'var(--gold)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: currentMap?.id === map.id ? 600 : 400,
                transition: 'all var(--transition)',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
              
              onMouseEnter={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }} >
              <Map size={12} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</span>
              {!sessionReadMode && <MapTabMenu map={map} onEdit={() => setEditingMap(map)} />}
            </div>
          ))}


          {/* Import map button — edit mode only */}
          {!sessionReadMode && (
            <button
              onClick={handleImportMap}
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
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
            >
              <Upload size={12} />
              {importing ? 'Importing…' : 'Import Map'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
          {sessionReadMode
            ? <button className="btn btn-sm" onClick={() => setSessionReadMode(false)}>Edit</button>
            : <button className="btn btn-sm btn-ghost" onClick={() => setSessionReadMode(true)}>Done</button>
          }
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {maps.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-muted)' }}>
            <Map size={52} strokeWidth={1} color="var(--border-light)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 6 }}>No maps yet</div>
              <div style={{ fontSize: 13 }}>Import a PNG or JPEG map image to get started</div>
            </div>
            {!sessionReadMode && (
              <button className="btn btn-primary" onClick={handleImportMap} disabled={importing}>
                <Upload size={14} /> {importing ? 'Importing…' : 'Import Map Image'}
              </button>
            )}
          </div>
        ) : (
          <>
            <MapCanvas readMode={sessionReadMode} />
            {poiPanelOpen && <POIPanel readMode={sessionReadMode} />}
          </>
        )}
      </div>

      {editingMap && <EditMapModal map={editingMap} onClose={() => setEditingMap(null)} />}
    </div>
  )
}
