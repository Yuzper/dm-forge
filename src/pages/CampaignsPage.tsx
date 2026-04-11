// path: src/pages/CampaignsPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import { Plus, Sword, BookOpen, ChevronRight, MoreHorizontal, Trash2, Pencil } from 'lucide-react'
import type { Campaign } from '../types'

const SYSTEMS = ['D&D 5e 2014', 'D&D 5e 2024', 'Other']

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const { createCampaign } = useStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [system, setSystem] = useState('D&D 5e 2014')
  const [saving, setSaving] = useState(false)

  const PLACEHOLDERS = [
    'The Lost Mines of Phandelver…',
    'Curse of Strahd…',
    'Storm King\'s Thunder…',
    'Tomb of Annihilation…',
    'Waterdeep: Dragon Heist…',
    'Baldur\'s Gate: Descent into Avernus…'
  ]
  const randomPlaceholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createCampaign({ name: name.trim(), description, system })
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Campaign</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Campaign Name</label>
            <input className="input" placeholder={randomPlaceholder} value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div className="input-group">
            <label className="input-label">System</label>
            <select className="input" value={system} onChange={e => setSystem(e.target.value)}>
              {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Description</label>
            <textarea className="input" placeholder="A brief overview of this campaign…" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditCampaignModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const { updateCampaign } = useStore()
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description)
  const [system, setSystem] = useState(campaign.system)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateCampaign(campaign.id, { name: name.trim(), description, system })
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit Campaign</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Campaign Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div className="input-group">
            <label className="input-label">System</label>
            <select className="input" value={system} onChange={e => setSystem(e.target.value)}>
              {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Description</label>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
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

function DeleteCampaignModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const { deleteCampaign } = useStore()
  const [input, setInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const required = 'DELETE CAMPAIGN'
  const valid = input === required

  const handleSubmit = async () => {
    if (!valid) return
    setDeleting(true)
    await deleteCampaign(campaign.id)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title" style={{ color: '#e05555' }}>Delete Campaign</div>
        <p style={{ fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          This will permanently delete <strong style={{ color: 'var(--text-primary)' }}>{campaign.name}</strong> and all its sessions, maps, POIs and wiki articles. This cannot be undone.
        </p>
        <div className="input-group">
          <label className="input-label">
            Type <strong style={{ color: '#e05555', letterSpacing: '0.05em' }}>{required}</strong> to confirm
          </label>
          <input
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={required}
            autoFocus
            style={{ borderColor: input.length > 0 ? (valid ? 'var(--teal)' : 'var(--crimson-dim)') : undefined }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={handleSubmit}
            disabled={!valid || deleting}
            style={{ opacity: valid ? 1 : 0.4 }}
          >
            {deleting ? 'Deleting…' : 'Delete Campaign'}
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

function CampaignMenu({ campaign, onEdit, onDelete }: { campaign: Campaign; onEdit: () => void; onDelete: () => void }) {
  const { selectCampaign } = useStore()
  const [open, setOpen] = useState(false)
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
          minWidth: 160, zIndex: 50, overflow: 'hidden',
        }}>
          <button onClick={() => { selectCampaign(campaign); setOpen(false) }} style={menuItemStyle}>
            <ChevronRight size={13} /> Open
          </button>
          <button onClick={() => { onEdit(); setOpen(false) }} style={menuItemStyle}>
            <Pencil size={13} /> Edit
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button onClick={() => { onDelete(); setOpen(false) }} style={{ ...menuItemStyle, color: '#e05555' }}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { selectCampaign } = useStore()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <div
        className="card card-clickable"
        style={{ padding: '20px 22px', cursor: 'pointer', position: 'relative' }}
        onClick={() => selectCampaign(campaign)}
      >
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="badge badge-gold">{campaign.system}</span>
          <CampaignMenu campaign={campaign} onEdit={() => setEditOpen(true)} onDelete={() => setDeleteOpen(true)} />
        </div>

        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '0.03em' }}>
          {campaign.name}
        </h3>

        {campaign.description && (
          <p style={{ fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {campaign.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <BookOpen size={12} />
              {campaign.session_count ?? 0} sessions
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--gold)' }}>
            Open <ChevronRight size={13} />
          </div>
        </div>
      </div>

      {editOpen && <EditCampaignModal campaign={campaign} onClose={() => setEditOpen(false)} />}
      {deleteOpen && <DeleteCampaignModal campaign={campaign} onClose={() => setDeleteOpen(false)} />}
    </>
  )
}

export default function CampaignsPage() {
  const { campaigns } = useStore()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '20px 32px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Sword size={22} color="var(--gold)" />
          <h1 style={{ fontSize: 22, letterSpacing: '0.05em' }}>Your Campaigns</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        {campaigns.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text-muted)' }}>
            <Sword size={48} strokeWidth={1} color="var(--border-light)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 6 }}>No campaigns yet</div>
              <div style={{ fontSize: 13 }}>Create your first campaign to begin your adventure</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Create Campaign
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignContent: 'start' }}>
            {campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}