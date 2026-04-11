// path: src/pages/CampaignDetailPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import { Plus, Calendar, Map, BookOpen, MoreHorizontal, Trash2, Pencil, ChevronRight } from 'lucide-react'
import type { Session } from '../types'

function CreateSessionModal({ onClose }: { onClose: () => void }) {
  const { sessions, createSession } = useStore()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const nextNumber = (sessions.length > 0 ? Math.max(...sessions.map(s => s.session_number)) : 0) + 1
  const today = new Date().toISOString().slice(0, 10)

  const PLACEHOLDERS = [
    'The Road to Neverwinter…',
    'The Battle of Helm\'s Deep…',
    'The Goblin King\'s Lair…',
    'Descent into the Underdark…',
    'The Siege of Waterdeep…',
    'Curse of the Ancient Tomb…',
    'The Dragon\'s Hoard…',
    'Whispers in the Dark…',
    'Trial of the Iron Circle…',
    'The Northrend Expedition…',
    'Stormwind Under Siege…',
  ]
  const randomPlaceholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await createSession({ name: name.trim(), session_number: nextNumber, date: today })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Session</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Session Name</label>
            <input
              className="input"
              placeholder={`Session ${nextNumber}: ${randomPlaceholder}`}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? 'Creating…' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditSessionModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { updateSession } = useStore()
  const [name, setName] = useState(session.name)
  const [date, setDate] = useState(session.date ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateSession(session.id, { name: name.trim(), date: date || null })
      onClose()
    } catch (e) {
      console.error('Failed to update session:', e)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit Session</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Session Name</label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
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

function SessionMenu({ session, onEdit }: { session: Session; onEdit: () => void }) {
  const { selectSession, deleteSession } = useStore()
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteSession(session.id)
    setOpen(false)
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); setConfirmDelete(false) }}
        title="Options"
        style={{ color: 'var(--text-muted)' }}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          minWidth: 140,
          zIndex: 50,
          overflow: 'hidden',
        }}>
          <button onClick={() => { selectSession(session); setOpen(false) }} style={menuItemStyle}>
            <ChevronRight size={13} /> Select
          </button>
          <button onClick={() => { onEdit(); setOpen(false) }} style={menuItemStyle}>
            <Pencil size={13} /> Edit
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

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', background: 'none', border: 'none',
  color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-ui)',
  cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease',
}

function SessionCard({ session }: { session: Session }) {
  const { selectSession } = useStore()
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <div
        className="card card-clickable"
        style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}
        onClick={() => selectSession(session)}
      >
        <div style={{
          width: 44, height: 44,
          background: 'var(--bg-active)',
          border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 14, color: 'var(--gold)',
        }}>
          {session.session_number}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {session.date && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={11} />
                {new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Map size={11} />
              {session.map_count ?? 0} maps
            </span>
          </div>
        </div>

        <SessionMenu session={session} onEdit={() => setEditOpen(true)} />
      </div>

      {editOpen && <EditSessionModal session={session} onClose={() => setEditOpen(false)} />}
    </>
  )
}

export default function CampaignDetailPage() {
  const { currentCampaign, sessions, setView } = useStore()
  const [showCreate, setShowCreate] = useState(false)

  if (!currentCampaign) return null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span className="badge badge-gold">{currentCampaign.system}</span>
            </div>
            <h1 style={{ fontSize: 26, letterSpacing: '0.04em', marginBottom: 6 }}>{currentCampaign.name}</h1>
            {currentCampaign.description && (
              <p style={{ fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {currentCampaign.description}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn" onClick={() => setView('wiki')}>
              <BookOpen size={15} /> Wiki
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New Session
            </button>
          </div>
        </div>
      </div>

      {/* Sessions list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <BookOpen size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            {sessions.length} Session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-muted)' }}>
            <BookOpen size={40} strokeWidth={1} color="var(--border-light)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No sessions yet</div>
              <div style={{ fontSize: 13 }}>Add your first session to start planning</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Add Session
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 680 }}>
            {sessions.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}