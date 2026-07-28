// path: src/components/campaign/SessionsView.tsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '../../store/store'
import {
  Plus, Calendar, Map, MoreHorizontal, Trash2, Pencil,
  ChevronRight, ArrowUpDown, ChevronDown, ChevronUp, Layers,
  Scroll, ArrowLeft, X, Search, GripVertical,
  PanelRight, ArrowUpToLine, Hammer, BookOpen,
} from 'lucide-react'
import type { Session, Arc } from '../../types'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import { useMenuClose } from '../../hooks/useMenuClose'
import { parseDay, todayISO } from '../../utils/dates'
import { richTextToPlain } from '../../utils/richText'
import Modal from '../Modal'
import EmptyState from '../EmptyState'
import { InWorldDatePicker } from '../InWorldDatePicker'
import SwatchPicker from '../SwatchPicker'
import { STANDARD_PALETTE } from '../../constants/palettes'

// Extend Session with in_world_day / in_world_day_end which exist in DB but not the shared type yet
type SessionExt = Session & { in_world_day?: number | null; in_world_day_end?: number | null }

// Tab-count label: image maps, mapless scenes and wiki-attached maps counted
// separately, e.g. "2 maps · 1 scene · 1 linked", or "No maps" when empty.
function mapCountLabel(session: any): string {
  const maps = session.map_count ?? 0
  const scenes = session.scene_count ?? 0
  const attached = session.attached_count ?? 0
  const parts: string[] = []
  if (maps > 0) parts.push(`${maps} map${maps !== 1 ? 's' : ''}`)
  if (scenes > 0) parts.push(`${scenes} scene${scenes !== 1 ? 's' : ''}`)
  if (attached > 0) parts.push(`${attached} linked`)
  return parts.length > 0 ? parts.join(' · ') : 'No maps'
}

// ── Constants ──────────────────────────────────────────────────────────────────

const extractAllText = (json: string) => richTextToPlain(json).toLowerCase()

// ── Arc Modals ─────────────────────────────────────────────────────────────────

function CreateArcModal({ onClose }: { onClose: () => void }) {
  const { createArc } = useStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(STANDARD_PALETTE[2])
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
          <SwatchPicker value={color} onChange={setColor} />
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
          <SwatchPicker value={color} onChange={setColor} />
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
  const isDraft = !!(session as any).is_draft
  const subClean = sessionSub.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)
  const isDuplicate = !isDraft && sessions.some(s => s.id !== session.id && s.session_number === sessionNumber && s.session_sub === subClean)

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
    <Modal title={isDraft ? 'Edit Future Session' : 'Edit Session'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!isDraft && (
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
        )}
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
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 120ms ease', position: 'relative', '--hover-accent': arc.color } as React.CSSProperties}
        className="hover-border-accent hover-bg-elevated"
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
            <Map size={10} /> {mapCountLabel(session)}
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
                className="menu-item menu-item-danger" style={confirmDelete ? { color: 'var(--danger-hover)' } : undefined}>
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
            <Pencil size={13} /> Edit Arc
          </button>
          {!arc.is_default && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button onClick={() => triggerDelete(() => { deleteArc(arc.id); setOpen(false) })}
                className="menu-item menu-item-danger" style={confirmDelete ? { color: 'var(--danger-hover)' } : undefined}>
                <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ArcSection({ arc, sessions, sortAsc, onAddSession, dragEnabled = false, isDragging = false, dropLineAbove = false, onDragStart, onDragEnd, onSectionDragOver, onSectionDrop }: {
  arc: Arc; sessions: Session[]; sortAsc: boolean; onAddSession: (arcId: number) => void
  dragEnabled?: boolean
  isDragging?: boolean
  dropLineAbove?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onSectionDragOver?: (e: React.DragEvent) => void
  onSectionDrop?: () => void
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(`dmforge:arc-collapsed:${arc.id}`) === '1' } catch { return false }
  })
  const toggleCollapsed = () => {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem(`dmforge:arc-collapsed:${arc.id}`, next ? '1' : '0') } catch {}
      return next
    })
  }
  const [editOpen, setEditOpen] = useState(false)
  const sorted = [...sessions].sort((a, b) => {
    const numDiff = a.session_number - b.session_number
    if (numDiff !== 0) return sortAsc ? numDiff : -numDiff
    return sortAsc ? (a.session_sub ?? '').localeCompare(b.session_sub ?? '') : (b.session_sub ?? '').localeCompare(a.session_sub ?? '')
  })
  return (
    <div
      style={{ opacity: isDragging ? 0.4 : 1, borderTop: dropLineAbove ? '2px solid var(--gold)' : '2px solid transparent', transition: 'opacity 120ms ease' }}
      onDragOver={onSectionDragOver}
      onDrop={() => onSectionDrop?.()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px' }}>
        {dragEnabled && (
          <span
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
            onDragEnd={() => onDragEnd?.()}
            title="Drag to reorder arc"
            style={{ display: 'flex', alignItems: 'center', cursor: 'grab', color: 'var(--text-muted)', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </span>
        )}
        <button onClick={toggleCollapsed}
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
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'none', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', transition: 'all 120ms ease', '--hover-accent': arc.color } as React.CSSProperties}
            className="hover-accent-border">
            <Plus size={11} /> Add session to {arc.name}
          </button>
        </div>
      )}
      {editOpen && <EditArcModal arc={arc} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

// ── Create Session Modal ───────────────────────────────────────────────────────

function CreateSessionModal({ defaultArcId, onClose, draft = false }: { defaultArcId: number | null; onClose: () => void; draft?: boolean }) {
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
  // Defaults to today — sessions are usually created the day they're played.
  const [date, setDate] = useState(todayISO)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await createSession({
      name: name.trim(),
      session_number: draft ? 0 : sessionNumber,
      session_sub: draft ? '' : sessionSub.trim(),
      arc_id: arcId, date: date || undefined,
      ...(draft ? { is_draft: 1 } : {}),
    })
    onClose()
  }

  return (
    <Modal title={draft ? 'Prep Future Session' : 'New Session'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {draft && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Prep this session now — maps, POIs, combats, notes. Promote it later to drop it into the timeline with a number.
          </div>
        )}
        {draft ? (
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" placeholder="The Iron Gate…" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
        ) : (
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
        )}
        <div className="input-group">
          <label className="input-label">Arc</label>
          <select className="input" value={arcId ?? ''} onChange={e => setArcId(e.target.value ? parseInt(e.target.value) : null)}>
            {arcs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {!draft && (
          <div className="input-group">
            <label className="input-label">Date <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
          {saving ? (draft ? 'Prepping…' : 'Creating…') : (draft ? 'Prep Session' : 'Create Session')}
        </button>
      </div>
    </Modal>
  )
}

// ── Future Sessions (prep) panel ─────────────────────────────────────────────

function DraftRow({ session, index, dragId, dropIndex, onDragStart, onDragOver, onDrop, onDragEnd }: {
  session: Session
  index: number
  dragId: number | null
  dropIndex: number | null
  onDragStart: (id: number) => void
  onDragOver: (index: number) => void
  onDrop: (index: number) => void
  onDragEnd: () => void
}) {
  const { selectSession, deleteSession, promoteSession, arcs } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  useMenuClose(menuOpen, menuRef, setMenuOpen)
  const arc = arcs.find(a => a.id === session.arc_id) ?? arcs.find(a => a.is_default)
  const color = arc?.color ?? '#8a8a8a'
  const isDropTarget = dropIndex === index && dragId !== null && dragId !== session.id

  return (
    <>
      <div
        draggable
        onClick={() => selectSession(session)}
        onDragStart={e => { onDragStart(session.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragOver={e => { if (dragId === null) return; e.preventDefault(); onDragOver(index) }}
        onDrop={e => { e.preventDefault(); onDrop(index) }}
        onDragEnd={onDragEnd}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderTop: isDropTarget ? '2px solid var(--gold)' : '1px solid var(--border)',
          borderRadius: 'var(--radius)', cursor: 'grab', position: 'relative',
          opacity: dragId === session.id ? 0.4 : 1, transition: 'opacity 120ms ease, border-color 120ms ease',
          '--hover-accent': color,
        } as React.CSSProperties}
        className="hover-border-accent"
      >
        <GripVertical size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>
            <Map size={10} /> {mapCountLabel(session)}
            {arc && <span style={{ color }}>· {arc.name}</span>}
          </div>
        </div>
        <button
          title="Promote to numbered session"
          onClick={e => { e.stopPropagation(); promoteSession(session.id) }}
          className="btn btn-ghost btn-icon btn-sm"
          style={{ color: 'var(--gold)', flexShrink: 0 }}
        >
          <ArrowUpToLine size={14} />
        </button>
        <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '3px 2px' }}>
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 170, zIndex: 50, overflow: 'hidden' }}>
              <button onClick={() => { promoteSession(session.id); setMenuOpen(false) }} className="menu-item">
                <ArrowUpToLine size={13} /> Promote to session
              </button>
              <button onClick={() => { setEditOpen(true); setMenuOpen(false) }} className="menu-item">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={e => { e.stopPropagation(); triggerDelete(() => { deleteSession(session.id); setMenuOpen(false) }) }}
                className="menu-item menu-item-danger" style={confirmDelete ? { color: 'var(--danger-hover)' } : undefined}>
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

function PrepPanel({ onClose }: { onClose: () => void }) {
  const { drafts, reorderDrafts } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const handleDrop = (targetIndex: number) => {
    if (dragId === null) { setDropIndex(null); return }
    const from = drafts.findIndex(d => d.id === dragId)
    setDragId(null); setDropIndex(null)
    if (from === -1 || from === targetIndex) return
    const next = [...drafts]
    const [moved] = next.splice(from, 1)
    next.splice(targetIndex > from ? targetIndex - 1 : targetIndex, 0, moved)
    reorderDrafts(next.map((d, i) => ({ id: d.id, sort_order: i })))
  }

  return (
    <div style={{ width: 380, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Hammer size={15} color="var(--gold)" />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)', letterSpacing: '0.03em', flex: 1 }}>Future Sessions</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '1px 7px', borderRadius: 99, border: '1px solid var(--border-light)' }}>{drafts.length}</span>
          <button onClick={onClose} title="Hide prep panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 3 }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          Prep sessions before they're scheduled. Drag to reorder; promote one to drop it into the timeline with a number.
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}
        onDragOver={e => { if (dragId !== null) { e.preventDefault(); setDropIndex(drafts.length) } }}
        onDrop={() => handleDrop(drafts.length)}
      >
        {drafts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-muted)' }}>
            <Hammer size={34} strokeWidth={1} color="var(--border-light)" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>Nothing prepped yet</div>
            <div style={{ fontSize: 12 }}>Build sessions ahead of time, then promote them when you're ready to run.</div>
          </div>
        ) : drafts.map((d, i) => (
          <DraftRow
            key={d.id}
            session={d}
            index={i}
            dragId={dragId}
            dropIndex={dropIndex}
            onDragStart={setDragId}
            onDragOver={setDropIndex}
            onDrop={handleDrop}
            onDragEnd={() => { setDragId(null); setDropIndex(null) }}
          />
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Prep new session
        </button>
      </div>
      {showCreate && <CreateSessionModal defaultArcId={null} draft onClose={() => setShowCreate(false)} />}
    </div>
  )
}

// ── Sessions View ──────────────────────────────────────────────────────────────

export default function SessionsView({ onBack }: { onBack: () => void }) {
  const { currentCampaign, sessions, drafts, arcs, reorderArcs } = useStore()
  // ── Arc drag-reorder ──────────────────────────────────────────────────────────
  const [dragArcId, setDragArcId] = useState<number | null>(null)
  // The arc id we'd insert *before*; null = drop at the end of the list.
  const [dropBeforeArc, setDropBeforeArc] = useState<number | null | undefined>(undefined)
  const [showCreate, setShowCreate] = useState(false)
  const [createArcOpen, setCreateArcOpen] = useState(false)
  const [preselectedArcId, setPreselectedArcId] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState<boolean>(() => {
    try { return localStorage.getItem('dmforge:session-sort') !== 'desc' } catch { return true }
  })
  const [prepOpen, setPrepOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('dmforge:prep-panel') === 'open' } catch { return false }
  })
  const togglePrep = (open: boolean) => {
    setPrepOpen(open)
    try { localStorage.setItem('dmforge:prep-panel', open ? 'open' : 'closed') } catch {}
  }

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
  const sortedArcs = [...arcs].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const sessionsForArc = (arcId: number) =>
    filteredSessions.filter(s => s.arc_id === arcId || (s.arc_id === null && arcId === defaultArc?.id))

  const isSearching = query.trim().length > 0
  const arcsWithResults = isSearching ? sortedArcs.filter(arc => sessionsForArc(arc.id).length > 0) : sortedArcs

  const commitArcDrop = () => {
    if (dragArcId != null && dropBeforeArc !== undefined) {
      const ids = sortedArcs.map(a => a.id).filter(id => id !== dragArcId)
      const insertAt = dropBeforeArc === null ? ids.length : ids.indexOf(dropBeforeArc)
      ids.splice(insertAt < 0 ? ids.length : insertAt, 0, dragArcId)
      reorderArcs(ids.map((id, i) => ({ id, sort_order: i })))
    }
    setDragArcId(null); setDropBeforeArc(undefined)
  }
  const onArcDragOver = (arcId: number, e: React.DragEvent) => {
    if (dragArcId == null) return
    e.preventDefault(); e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    const idx = sortedArcs.findIndex(a => a.id === arcId)
    const next = sortedArcs[idx + 1]
    setDropBeforeArc(after ? (next ? next.id : null) : arcId)
  }
  // Arc reorder only makes sense in the unfiltered list.
  const arcDragEnabled = !isSearching && sortedArcs.length > 1


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
            <button
              className="btn"
              onClick={() => togglePrep(!prepOpen)}
              title={prepOpen ? 'Hide future sessions' : 'Show future sessions'}
              style={prepOpen ? { color: 'var(--gold)', borderColor: 'var(--border-gold)' } : undefined}
            >
              <PanelRight size={15} /> Future
              {drafts.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--gold)', background: 'rgba(200,168,75,0.12)', padding: '0 6px', borderRadius: 99, marginLeft: 2 }}>{drafts.length}</span>
              )}
            </button>
            <button className="btn" onClick={() => setCreateArcOpen(true)}><Layers size={15} /> New Arc</button>
            <button className="btn btn-primary" onClick={() => { setPreselectedArcId(null); setShowCreate(true) }}>
              <Plus size={15} /> New Session
            </button>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>

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
            className="hover-gold-border">
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
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}
            onDragOver={e => { if (dragArcId != null) { e.preventDefault(); setDropBeforeArc(null) } }}
            onDrop={() => { if (dragArcId != null) commitArcDrop() }}
          >
            {arcsWithResults.map(arc => (
              <ArcSection
                key={arc.id}
                arc={arc}
                sessions={sessionsForArc(arc.id)}
                sortAsc={sortAsc}
                onAddSession={handleAddSession}
                dragEnabled={arcDragEnabled}
                isDragging={dragArcId === arc.id}
                dropLineAbove={dragArcId != null && dropBeforeArc === arc.id}
                onDragStart={() => setDragArcId(arc.id)}
                onDragEnd={() => { setDragArcId(null); setDropBeforeArc(undefined) }}
                onSectionDragOver={e => onArcDragOver(arc.id, e)}
                onSectionDrop={commitArcDrop}
              />
            ))}
          </div>
        )}
          </div>
        </div>
        {prepOpen && <PrepPanel onClose={() => togglePrep(false)} />}
      </div>
      {showCreate && <CreateSessionModal defaultArcId={preselectedArcId} onClose={() => { setShowCreate(false); setPreselectedArcId(null) }} />}
      {createArcOpen && <CreateArcModal onClose={() => setCreateArcOpen(false)} />}
    </div>
  )
}
