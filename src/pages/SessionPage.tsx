// path: src/pages/SessionPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import { Map, Upload, MoreHorizontal, Trash2, Pencil, ChevronLeft, ScrollText, X } from 'lucide-react'
import MapCanvas from '../components/MapCanvas'
import POIPanel from '../components/POIPanel'
import RichEditor from '../components/RichEditor'
import type { GameMap, Session } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

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
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
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
          <button onClick={e => { e.stopPropagation(); triggerDelete(() => { deleteMap(map.id); setOpen(false) }) }} style={{ ...menuItemStyle, color: confirmDelete ? '#ff7777' : '#e05555' }}>
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

function SessionNotesPanel({ session, onClose }: { session: Session; onClose: () => void }) {
  const { updateSession } = useStore()
  const [notes, setNotes] = useState(
    session.notes && session.notes !== ''
      ? session.notes
      : '{"type":"doc","content":[]}'
  )

  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Use ref so the unmount flush always sees the latest notes value
  const notesRef = useRef(notes)
  notesRef.current = notes

  const handleChange = (v: string) => {
    setNotes(v)
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      updateSession(session.id, { notes: v })
    }, 1500)
  }

  // Flush pending save on close so no notes are lost
  useEffect(() => () => {
    if (saveRef.current) {
      clearTimeout(saveRef.current)
      updateSession(session.id, { notes: notesRef.current })
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0,
      width: 420, height: 520,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)',
      borderTop: '2px solid var(--gold-dim)',
      borderRadius: '8px 0 0 0',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex', flexDirection: 'column',
      zIndex: 100,
      animation: 'slideUp 150ms ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0, background: 'var(--bg-surface)',
        borderRadius: '8px 0 0 0',
      }}>
        <ScrollText size={13} color="var(--gold)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold)', letterSpacing: '0.03em' }}>
            Session Notes
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Session {session.session_number}{session.session_sub}: {session.name}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', padding: 4,
            borderRadius: 'var(--radius-sm)', transition: 'color 120ms ease',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <X size={14} />
        </button>
      </div>

      {/* Editor — key={session.id} reinitialises if session switches while panel is open */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <RichEditor
          key={session.id}
          content={notes}
          onChange={handleChange}
          placeholder="Jot down notes as the session unfolds… player decisions, unexpected events, NPC names, plot twists…"
        />
      </div>
    </div>
  )
}

export default function SessionPage() {
  const {
    currentSession, currentCampaign, setView, setCampaignSubView,
    maps, currentMap, selectMap, importMap, poiPanelOpen, sessionReadMode, setSessionReadMode,
  } = useStore()

  const [importing, setImporting] = useState(false)
  const [editingMap, setEditingMap] = useState<GameMap | null>(null)
  const [showNotes, setShowNotes] = useState(false)

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
          onClick={() => {
            if (!currentCampaign) return
            setView('campaign')
            setCampaignSubView('sessions')
          }}
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
            Session {currentSession.session_number}{currentSession.session_sub}
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
            ? <button className="btn btn-sm" onClick={() => setSessionReadMode(false)} style={{ fontSize: 12 }}>Edit</button>
            : <button className="btn btn-sm btn-ghost" onClick={() => setSessionReadMode(true)} style={{ fontSize: 12 }}>Done</button>
          }
        </div>
        {/* Notes toggle — highlights when panel is open */}
        <button
          onClick={() => setShowNotes(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 16px', height: '100%',
            background: showNotes ? 'var(--bg-active)' : 'transparent',
            border: 'none', borderLeft: '1px solid var(--border)',
            color: showNotes ? 'var(--gold)' : 'var(--text-muted)',
            fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'all var(--transition)', flexShrink: 0,
          }}
          onMouseEnter={e => { if (!showNotes) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { if (!showNotes) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
        >
          <ScrollText size={13} /> Notes
        </button>
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
      {showNotes && currentSession && (
        <SessionNotesPanel session={currentSession} onClose={() => setShowNotes(false)} />
      )}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}