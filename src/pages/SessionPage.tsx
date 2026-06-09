// path: src/pages/SessionPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import { Map, Upload, MoreHorizontal, Trash2, Pencil, ChevronLeft, ScrollText, X, ImageIcon, Clock, ArrowRightLeft } from 'lucide-react'
import MapCanvas from '../components/MapCanvas'
import POIPanel from '../components/POIPanel'
import RichEditor from '../components/RichEditor'
import { StoreMapProvider } from '../context/MapContext'
import { InWorldDatePicker } from '../components/InWorldDatePicker'
import type { GameMap, Session } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'
import { useMenuClose } from '../hooks/useMenuClose'
import { parseDay } from '../utils/dates'
import Modal from '../components/Modal'

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
    <Modal title="Rename Map" onClose={onClose}>
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
    </Modal>
  )
}

function MoveMapModal({ map, onClose }: { map: GameMap; onClose: () => void }) {
  const { sessions, currentSession, moveMapToSession } = useStore()
  const [moving, setMoving] = useState(false)
  const targets = sessions.filter(s => s.id !== currentSession?.id)

  const handleMove = async (sessionId: number) => {
    setMoving(true)
    try {
      await moveMapToSession(map.id, sessionId)
      onClose()
    } catch {
      setMoving(false)
    }
  }

  return (
    <Modal title={`Move "${map.name}" to…`} onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        The map and all its POIs move with it.
      </div>
      {targets.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
          No other sessions in this campaign yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
          {targets.map(s => (
            <button
              key={s.id}
              className="menu-item"
              disabled={moving}
              onClick={() => handleMove(s.id)}
              style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
            >
              <Map size={13} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Session {s.session_number}{s.session_sub}: {s.name}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function MapTabMenu({ map, onEdit, onReplace, onMove }: { map: GameMap; onEdit: () => void; onReplace: () => void; onMove: () => void }) {
  const { deleteMap, selectMap } = useStore()
  const [open, setOpen] = useState(false)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useMenuClose(open, menuRef, setOpen)

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
            minWidth: 160,
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <button onClick={() => { selectMap(map); setOpen(false) }} className="menu-item">
            <Map size={13} /> Select
          </button>
          <button onClick={() => { onEdit(); setOpen(false) }} className="menu-item">
            <Pencil size={13} /> Rename
          </button>
          <button onClick={() => { onReplace(); setOpen(false) }} className="menu-item">
            <ImageIcon size={13} /> Replace image
          </button>
          <button onClick={() => { onMove(); setOpen(false) }} className="menu-item">
            <ArrowRightLeft size={13} /> Move to session…
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button onClick={e => { e.stopPropagation(); triggerDelete(() => { deleteMap(map.id); setOpen(false) }) }} className={`menu-item menu-item-danger${confirmDelete ? '' : ''}`} style={confirmDelete ? { color: 'var(--danger-hover)' } : undefined}>
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── In-world date header section ──────────────────────────────────────────────

function InWorldDateHeader({ session, readMode }: { session: Session; readMode: boolean }) {
  const { updateSession, currentCampaign } = useStore()
  const [open, setOpen] = useState(false)
  const [startRaw, setStartRaw] = useState('')
  const [endRaw, setEndRaw] = useState('')
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const s = session as any
  const startDay: number | null = s.in_world_day ?? null
  const endDay: number | null = s.in_world_day_end ?? null
  const year: number = (currentCampaign as any)?.timeline_base_year ?? 1507

  useMenuClose(open, containerRef, setOpen)

  const openEditor = () => {
    setStartRaw(startDay ? JSON.stringify({ day: startDay, year, label: '' }) : '')
    setEndRaw(endDay ? JSON.stringify({ day: endDay, year, label: '' }) : '')
    setOpen(true)
  }

  const handleStartChange = (raw: string) => {
    setStartRaw(raw)
    const sd = parseDay(raw)
    const ed = parseDay(endRaw)
    // Default end to start if unset or earlier
    if (sd !== null && (ed === null || ed < sd)) {
      setEndRaw(raw)
    }
  }

  const handleEndChange = (raw: string) => {
    const sd = parseDay(startRaw)
    const ed = parseDay(raw)
    // Clamp end to start if earlier
    if (sd !== null && ed !== null && ed < sd) {
      setEndRaw(startRaw)
    } else {
      setEndRaw(raw)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const sd = parseDay(startRaw)
    const ed = parseDay(endRaw)
    const safeEnd = sd !== null && ed !== null && ed < sd ? sd : ed
    await updateSession(session.id, { in_world_day: sd, in_world_day_end: safeEnd } as any)
    setSaving(false)
    setOpen(false)
  }

  const handleClear = async () => {
    await updateSession(session.id, { in_world_day: null, in_world_day_end: null } as any)
    setOpen(false)
  }

  // Build display label
  const dateLabel = (() => {
    if (!startDay) return null
    if (endDay && endDay !== startDay) return `Day ${startDay}–${endDay}, Year ${year}`
    return `Day ${startDay}, Year ${year}`
  })()

  if (readMode) {
    if (!dateLabel) return null
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 14px', borderRight: '1px solid var(--border)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        <Clock size={11} color="#e88c3a" />
        <span style={{ fontSize: 11, color: '#e88c3a', fontFamily: 'var(--font-ui)' }}>{dateLabel}</span>
      </div>
    )
  }

  // Edit mode
  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'stretch', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
      <button
        onClick={open ? () => setOpen(false) : openEditor}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 14px', background: open ? 'var(--bg-active)' : 'transparent',
          border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12,
          color: dateLabel ? '#e88c3a' : 'var(--text-muted)',
          transition: 'all var(--transition)',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.color = '#e88c3a' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.color = dateLabel ? '#e88c3a' : 'var(--text-muted)' }}
      >
        <Clock size={12} />
        {dateLabel ?? 'Set in-world date'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          zIndex: 200, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
          minWidth: 320,
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <InWorldDatePicker value={startRaw} onChange={handleStartChange} label="Start day" />
            </div>
            <div style={{ flex: 1 }}>
              <InWorldDatePicker value={endRaw} onChange={handleEndChange} label="End day (optional)" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            {startDay && (
              <button onClick={handleClear}
                style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                Clear dates
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
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
  const notesRef = useRef(notes)
  notesRef.current = notes

  const handleChange = (v: string) => {
    setNotes(v)
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      updateSession(session.id, { notes: v })
    }, 1500)
  }

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
    maps, currentMap, selectMap, importMap, reorderMaps, sessionReadMode, setSessionReadMode,
    setHintContext,
  } = useStore()

  useEffect(() => { setHintContext('session'); return () => setHintContext(null) }, [setHintContext])

  const [importing, setImporting] = useState(false)
  const [editingMap, setEditingMap] = useState<GameMap | null>(null)
  const [movingMap, setMovingMap] = useState<GameMap | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const handleTabDrop = (targetIndex: number) => {
    if (dragId === null) { setDropIndex(null); return }
    const from = maps.findIndex(m => m.id === dragId)
    setDragId(null)
    setDropIndex(null)
    if (from === -1 || from === targetIndex) return
    const next = [...maps]
    const [moved] = next.splice(from, 1)
    next.splice(targetIndex, 0, moved)
    reorderMaps(next.map((m, i) => ({ id: m.id, sort_order: i })))
  }

  if (!currentSession) return null

  const handleImportMap = async () => {
    if (!currentSession) return
    setImporting(true)
    await importMap(currentSession.id)
    setImporting(false)
  }

  const handleReplaceMapImage = async (map: GameMap) => {
    const result = await window.api.replaceMapImage(map.id)
    if (!result) return
    await window.api.updateMap(map.id, { image_path: result.path })
    useStore.setState(s => ({
      maps: s.maps.map(m => m.id === map.id ? { ...m, image_path: result.path } : m),
      currentMap: s.currentMap?.id === map.id ? { ...s.currentMap, image_path: result.path } : s.currentMap,
    }))
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

        {/* Session title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 400 }}>
            {(currentSession as any).is_draft
              ? <>Future Session · {currentSession.name}</>
              : <>Session {currentSession.session_number}{currentSession.session_sub} · {currentSession.name}</>}
          </div>
        </div>

        {/* In-world date */}
        <InWorldDateHeader session={currentSession} readMode={sessionReadMode} />

        {/* Map tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1, overflowX: 'auto', overflowY: 'visible' }}>
          {maps.map((map, index) => (
            <div
              key={map.id}
              draggable={!sessionReadMode}
              onClick={() => selectMap(map)}
              onDragStart={e => { if (sessionReadMode) return; setDragId(map.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={e => { if (dragId === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropIndex(index) }}
              onDrop={e => { e.preventDefault(); handleTabDrop(index) }}
              onDragEnd={() => { setDragId(null); setDropIndex(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px 0 14px',
                cursor: sessionReadMode ? 'pointer' : 'grab',
                borderRight: '1px solid var(--border)',
                borderLeft: dropIndex === index && dragId !== null && dragId !== map.id ? '2px solid var(--gold)' : '2px solid transparent',
                borderBottom: currentMap?.id === map.id ? '2px solid var(--gold)' : '2px solid transparent',
                background: currentMap?.id === map.id ? 'var(--bg-active)' : 'transparent',
                color: currentMap?.id === map.id ? 'var(--gold)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: currentMap?.id === map.id ? 600 : 400,
                opacity: dragId === map.id ? 0.4 : 1,
                transition: 'background var(--transition), color var(--transition), opacity var(--transition)',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
              onMouseEnter={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Map size={12} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</span>
              {!sessionReadMode && (
                <MapTabMenu
                  map={map}
                  onEdit={() => setEditingMap(map)}
                  onReplace={() => handleReplaceMapImage(map)}
                  onMove={() => setMovingMap(map)}
                />
              )}
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
          <StoreMapProvider>
            <MapCanvas readMode={sessionReadMode} />
            <POIPanel readMode={sessionReadMode} />
          </StoreMapProvider>
        )}
      </div>

      {editingMap && <EditMapModal map={editingMap} onClose={() => setEditingMap(null)} />}
      {movingMap && <MoveMapModal map={movingMap} onClose={() => setMovingMap(null)} />}
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