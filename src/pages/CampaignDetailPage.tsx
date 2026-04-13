// path: src/pages/CampaignDetailPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import {
  Plus, Calendar, Map, BookOpen, MoreHorizontal, Trash2, Pencil,
  ChevronRight, ArrowUpDown, ChevronDown, ChevronUp, Layers,
} from 'lucide-react'
import type { Session, Arc } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

// ── Arc colour options ─────────────────────────────────────────────────────────

const ARC_COLORS = [
  '#c8a84b', '#5bbfb0', '#49c185', '#5b9fe8',
  '#b07de8', '#e88c3a', '#e05555', '#8a8a8a',
]

// ── Shared styles ──────────────────────────────────────────────────────────────

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', background: 'none', border: 'none',
  color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-ui)',
  cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease',
}

// ── Arc colour picker ──────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ARC_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: c, border: `2px solid ${value === c ? 'var(--text-primary)' : 'transparent'}`,
            cursor: 'pointer', transition: 'border 120ms ease', padding: 0,
          }}
        />
      ))}
    </div>
  )
}

// ── Create Arc Modal ───────────────────────────────────────────────────────────

function CreateArcModal({ onClose }: { onClose: () => void }) {
  const { createArc } = useStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(ARC_COLORS[0])
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await createArc({ name: name.trim(), color })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Arc</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Arc Name</label>
            <input
              className="input"
              placeholder="Northern Expedition…"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
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
      </div>
    </div>
  )
}

// ── Edit Arc Modal ─────────────────────────────────────────────────────────────

function EditArcModal({ arc, onClose }: { arc: Arc; onClose: () => void }) {
  const { updateArc } = useStore()
  const [name, setName] = useState(arc.name)
  const [color, setColor] = useState(arc.color)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await updateArc(arc.id, { name: name.trim(), color })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit Arc</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Arc Name</label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
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
      </div>
    </div>
  )
}

// ── Create Session Modal ───────────────────────────────────────────────────────

function CreateSessionModal({ defaultArcId, onClose }: { defaultArcId: number | null; onClose: () => void }) {
  const { sessions, arcs, createSession, currentCampaign, lastUsedArcId, setLastUsedArcId } = useStore()
  const [name, setName] = useState('')
  const [sessionSub, setSessionSub] = useState('')
  const [saving, setSaving] = useState(false)

  const [arcId, setArcId] = useState<number | null>(() => {
    // If opened from "Add session to X" button, use that arc
    if (defaultArcId !== null) return defaultArcId
    // Otherwise use per-campaign last used arc
    if (currentCampaign) {
      const lastId = lastUsedArcId[currentCampaign.id]
      if (lastId && arcs.some(a => a.id === lastId)) return lastId
    }
    return arcs.find(a => a.is_default)?.id ?? null
  })

  const nextNumber = (sessions.length > 0 ? Math.max(...sessions.map(s => s.session_number)) : 0) + 1
  const today = new Date().toISOString().slice(0, 10)
  const subClean = sessionSub.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)
  const isDuplicate = sessions.some(s => s.session_number === nextNumber && s.session_sub === subClean)

  const PLACEHOLDERS = [
    'The Road to Neverwinter…', 'The Battle of Helm\'s Deep…',
    'The Goblin King\'s Lair…', 'Descent into the Underdark…',
    'The Siege of Waterdeep…', 'Curse of the Ancient Tomb…',
    'The Dragon\'s Hoard…', 'Whispers in the Dark…',
    'Trial of the Iron Circle…', 'The Northrend Expedition…',
  ]
  const randomPlaceholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]

  const handleSubmit = async () => {
    if (!name.trim() || isDuplicate) return
    setSaving(true)
    if (currentCampaign && arcId !== null) setLastUsedArcId(currentCampaign.id, arcId)
    await createSession({
      name: name.trim(),
      session_number: nextNumber,
      session_sub: subClean,
      arc_id: arcId,
      date: today,
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Session</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="input-group" style={{ flex: '0 0 80px' }}>
              <label className="input-label">Session #</label>
              <input
                className="input"
                type="number"
                value={nextNumber}
                readOnly
                style={{ textAlign: 'center', color: 'var(--gold)', fontWeight: 600 }}
              />
            </div>
            <div className="input-group" style={{ flex: '0 0 72px' }}>
              <label className="input-label">Sub (opt.)</label>
              <input
                className="input"
                placeholder="a, b…"
                value={sessionSub}
                onChange={e => setSessionSub(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3))}
                style={{ textAlign: 'center' }}
              />
            </div>
          </div>
          {isDuplicate && (
            <div style={{ fontSize: 12, color: '#e05555' }}>
              Session {nextNumber}{subClean} already exists
            </div>
          )}
          <div className="input-group">
            <label className="input-label">Session Name</label>
            <input
              className="input"
              placeholder={`Session ${nextNumber}${subClean}: ${randomPlaceholder}`}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {arcs.length > 1 && (
            <div className="input-group">
              <label className="input-label">Arc</label>
              <select
                className="input"
                value={arcId ?? ''}
                onChange={e => setArcId(e.target.value ? parseInt(e.target.value) : null)}
              >
                {arcs.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving || isDuplicate}>
            {saving ? 'Creating…' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Session Modal ─────────────────────────────────────────────────────────

function EditSessionModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { updateSession, sessions, arcs } = useStore()
  const [name, setName] = useState(session.name)
  const [sessionNumber, setSessionNumber] = useState(session.session_number)
  const [sessionSub, setSessionSub] = useState(session.session_sub ?? '')
  const [arcId, setArcId] = useState<number | null>(session.arc_id)
  const [date, setDate] = useState(session.date ?? '')
  const [saving, setSaving] = useState(false)

  const subClean = sessionSub.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)
  const isDuplicate = sessions.some(s =>
    s.id !== session.id && s.session_number === sessionNumber && s.session_sub === subClean
  )

  const handleSubmit = async () => {
    if (!name.trim() || isDuplicate) return
    setSaving(true)
    try {
      await updateSession(session.id, {
        name: name.trim(),
        session_number: sessionNumber,
        session_sub: subClean,
        arc_id: arcId,
        date: date || null,
      })
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="input-group" style={{ flex: '0 0 80px' }}>
              <label className="input-label">Session #</label>
              <input
                className="input"
                type="number"
                min={1}
                value={sessionNumber}
                onChange={e => setSessionNumber(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ textAlign: 'center', color: 'var(--gold)', fontWeight: 600 }}
              />
            </div>
            <div className="input-group" style={{ flex: '0 0 72px' }}>
              <label className="input-label">Sub (opt.)</label>
              <input
                className="input"
                placeholder="a, b…"
                value={sessionSub}
                onChange={e => setSessionSub(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3))}
                style={{ textAlign: 'center' }}
              />
            </div>
            <div style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-display)', paddingBottom: 6 }}>
              → Session {sessionNumber}{subClean}
            </div>
          </div>
          {isDuplicate && (
            <div style={{ fontSize: 12, color: '#e05555' }}>
              Session {sessionNumber}{subClean} already exists
            </div>
          )}
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
          {arcs.length > 1 && (
            <div className="input-group">
              <label className="input-label">Arc</label>
              <select
                className="input"
                value={arcId ?? ''}
                onChange={e => setArcId(e.target.value ? parseInt(e.target.value) : null)}
              >
                {arcs.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="input-group">
            <label className="input-label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving || isDuplicate}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Session Menu ───────────────────────────────────────────────────────────────

function SessionMenu({ session, onEdit }: { session: Session; onEdit: () => void }) {
  const { selectSession, deleteSession } = useStore()
  const [open, setOpen] = useState(false)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
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
          <button onClick={() => { selectSession(session); setOpen(false) }} style={menuItemStyle}>
            <ChevronRight size={13} /> Select
          </button>
          <button onClick={() => { onEdit(); setOpen(false) }} style={menuItemStyle}>
            <Pencil size={13} /> Edit
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            onClick={e => { e.stopPropagation(); triggerDelete(() => { deleteSession(session.id); setOpen(false) }) }}
            style={{ ...menuItemStyle, color: confirmDelete ? '#ff7777' : '#e05555' }}
          >
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Arc Menu ───────────────────────────────────────────────────────────────────

function ArcMenu({ arc, onEdit }: { arc: Arc; onEdit: () => void }) {
  const { deleteArc } = useStore()
  const [open, setOpen] = useState(false)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={() => setOpen(o => !o)}
        style={{ color: 'var(--text-muted)' }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 140, zIndex: 50, overflow: 'hidden',
        }}>
          <button onClick={() => { onEdit(); setOpen(false) }} style={menuItemStyle}>
            <Pencil size={13} /> Rename
          </button>
          {!arc.is_default && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button
                onClick={() => triggerDelete(() => { deleteArc(arc.id); setOpen(false) })}
                style={{ ...menuItemStyle, color: confirmDelete ? '#ff7777' : '#e05555' }}
              >
                <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Session Card ───────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: Session }) {
  const { selectSession } = useStore()
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <div
        className="card card-clickable"
        style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}
        onClick={() => selectSession(session)}
      >
        <div style={{
          width: 44, height: 44,
          background: 'var(--bg-active)', border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontFamily: 'var(--font-display)',
          fontSize: session.session_sub ? 12 : 14, color: 'var(--gold)',
        }}>
          {session.session_number}{session.session_sub}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)',
            marginBottom: 4, letterSpacing: '0.02em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
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
              <Map size={11} /> {session.map_count ?? 0} maps
            </span>
          </div>
        </div>
        <SessionMenu session={session} onEdit={() => setEditOpen(true)} />
      </div>
      {editOpen && <EditSessionModal session={session} onClose={() => setEditOpen(false)} />}
    </>
  )
}

// ── Arc Section ────────────────────────────────────────────────────────────────

function ArcSection({ arc, sessions, sortAsc, onAddSession }: {
  arc: Arc
  sessions: Session[]
  sortAsc: boolean
  onAddSession: (arcId: number) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const sorted = [...sessions].sort((a, b) => {
    const numDiff = a.session_number - b.session_number
    if (numDiff !== 0) return sortAsc ? numDiff : -numDiff
    const subDiff = (a.session_sub ?? '').localeCompare(b.session_sub ?? '')
    return sortAsc ? subDiff : -subDiff
  })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            flex: 1, textAlign: 'left', padding: 0,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: arc.color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: arc.color, letterSpacing: '0.04em' }}>
            {arc.name}
          </span>
          {arc.is_default && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>default</span>
          )}
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            background: 'var(--bg-elevated)', padding: '1px 6px',
            borderRadius: 99, border: '1px solid var(--border-light)',
          }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
          {collapsed
            ? <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            : <ChevronUp size={13} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          }
        </button>
        <ArcMenu arc={arc} onEdit={() => setEditOpen(true)} />
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, paddingLeft: 18 }}>
          {sorted.length === 0 ? (
            <div style={{
              padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)',
              border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}>
              No sessions in this arc yet
            </div>
          ) : (
            sorted.map(s => <SessionCard key={s.id} session={s} />)
          )}
          <button
            onClick={() => onAddSession(arc.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', background: 'none',
              border: '1px dashed var(--border-light)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = arc.color
              ;(e.currentTarget as HTMLElement).style.color = arc.color
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
            }}
          >
            <Plus size={11} /> Add session to {arc.name}
          </button>
        </div>
      )}

      {editOpen && <EditArcModal arc={arc} onClose={() => setEditOpen(false)} />}
    </>
  )
}

// ── Campaign Detail Page ───────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { currentCampaign, sessions, arcs, setView } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [createArcOpen, setCreateArcOpen] = useState(false)
  const [preselectedArcId, setPreselectedArcId] = useState<number | null>(null)

  const [sortAsc, setSortAsc] = useState<boolean>(() => {
    try { return localStorage.getItem('dmforge:session-sort') !== 'desc' } catch { return true }
  })

  const toggleSort = () => {
    const next = !sortAsc
    setSortAsc(next)
    try { localStorage.setItem('dmforge:session-sort', next ? 'asc' : 'desc') } catch {}
  }

  const handleAddSession = (arcId: number) => {
    setPreselectedArcId(arcId)
    setShowCreate(true)
  }

  if (!currentCampaign) return null

  const defaultArc = arcs.find(a => a.is_default)
  const sortedArcs = [...arcs].sort((a, b) => a.name.localeCompare(b.name))
  const sessionsForArc = (arcId: number) =>
    sessions.filter(s => s.arc_id === arcId || (s.arc_id === null && arcId === defaultArc?.id))

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
            <button className="btn" onClick={() => setCreateArcOpen(true)}>
              <Layers size={15} /> New Arc
            </button>
            <button className="btn btn-primary" onClick={() => { setPreselectedArcId(null); setShowCreate(true) }}>
              <Plus size={15} /> New Session
            </button>
          </div>
        </div>
      </div>

      {/* Sessions list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <BookOpen size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, flex: 1 }}>
            {sessions.length} Session{sessions.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={toggleSort}
            title={sortAsc ? 'Sessions oldest first within arc' : 'Sessions newest first within arc'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 99, fontSize: 11,
              background: 'transparent', border: '1px solid var(--border-light)',
              color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}
          >
            <ArrowUpDown size={11} /> Sessions {sortAsc ? '↑' : '↓'}
          </button>
        </div>

        {sessions.length === 0 && arcs.length <= 1 ? (
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}>
            {sortedArcs.map(arc => (
              <ArcSection
                key={arc.id}
                arc={arc}
                sessions={sessionsForArc(arc.id)}
                sortAsc={sortAsc}
                onAddSession={handleAddSession}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateSessionModal
          defaultArcId={preselectedArcId}
          onClose={() => { setShowCreate(false); setPreselectedArcId(null) }}
        />
      )}
      {createArcOpen && <CreateArcModal onClose={() => setCreateArcOpen(false)} />}
    </div>
  )
}