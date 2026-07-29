// path: src/components/map/MapFeatureEditModal.tsx
// The editor shell shared by pins and regions. Name, description, the linked
// list, the wiki/session pickers and the delete/save footer are identical for
// both; only the appearance block differs, so callers pass it as a slot and
// keep its state. That way a change to how linking works is made once.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, Scroll, Search, Trash2, X } from 'lucide-react'
import type { Session } from '../../types'
import type { HubLink } from '../../utils/hubLinks'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import { SECTION_ACCENTS } from '../../constants/sections'
import Modal from '../Modal'

const WIKI_ACCENT = SECTION_ACCENTS['wiki']

/** The fields the shell owns; appearance values come from the caller's slot. */
export interface FeatureEditFields {
  name: string
  description: string
  links: HubLink[]
}

const resultRow: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
  background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
  cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left',
}

const resultList: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  overflow: 'hidden', marginTop: 4,
}

const sessionLabel = (s: { session_number: number; session_sub?: string | null; name: string }) =>
  `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`

export default function MapFeatureEditModal({
  title, initialName, namePlaceholder, initialDescription, descriptionPlaceholder,
  initialLinks, sessions, articles, appearance, onSave, onDelete, onClose,
}: {
  title: string
  initialName: string
  namePlaceholder?: string
  initialDescription: string
  descriptionPlaceholder?: string
  initialLinks: HubLink[]
  sessions: Session[]
  articles: { id: number; title: string }[]
  /** Rendered between Name and Description — colour, size, layer, and so on. */
  appearance?: ReactNode
  onSave: (fields: FeatureEditFields) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [links, setLinks] = useState<HubLink[]>([...initialLinks])
  const [wikiSearch, setWikiSearch] = useState('')
  const [sessionSearch, setSessionSearch] = useState('')
  const { confirming: confirmingDelete, trigger: triggerDelete } = useConfirmDelete()

  const filteredArticles = articles.filter(a =>
    a.title.toLowerCase().includes(wikiSearch.toLowerCase()) &&
    !links.some(l => l.type === 'wiki' && l.article_id === a.id)
  ).slice(0, 6)

  const filteredSessions = sessions.filter(s =>
    sessionLabel(s).toLowerCase().includes(sessionSearch.toLowerCase()) &&
    !links.some(l => l.type === 'session' && l.session_id === s.id)
  ).slice(0, 6)

  const removeLink = (i: number) => setLinks(prev => prev.filter((_, idx) => idx !== i))

  return (
    <Modal title={title} onClose={onClose} style={{ maxWidth: 440, width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="input-group">
          <label className="input-label">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder={namePlaceholder} />
        </div>

        {appearance}

        <div className="input-group">
          <label className="input-label">Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <textarea className="input" value={description} onChange={e => setDescription(e.target.value)}
            style={{ minHeight: 64, resize: 'vertical', lineHeight: 1.5 }}
            placeholder={descriptionPlaceholder} />
        </div>

        {links.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Linked</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {links.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                  {l.type === 'wiki'
                    ? <BookOpen size={11} style={{ color: WIKI_ACCENT, flexShrink: 0 }} />
                    : <Scroll size={11} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {l.type === 'wiki' ? l.title : `Session ${l.session_number}${l.session_sub}: ${l.name}`}
                  </span>
                  <button onClick={() => removeLink(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1, flexShrink: 0, borderRadius: 3 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="input-group">
          <label className="input-label">Link wiki article</label>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 28 }} placeholder="Search articles…"
              value={wikiSearch} onChange={e => setWikiSearch(e.target.value)} />
          </div>
          {wikiSearch && filteredArticles.length > 0 && (
            <div style={resultList}>
              {filteredArticles.map(a => (
                <button key={a.id} className="hover-bg-elevated" style={resultRow}
                  onClick={() => { setLinks(prev => [...prev, { type: 'wiki', article_id: a.id, title: a.title }]); setWikiSearch('') }}>
                  <BookOpen size={11} style={{ color: WIKI_ACCENT }} /> {a.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="input-group">
          <label className="input-label">Link session</label>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 28 }} placeholder="Search sessions…"
              value={sessionSearch} onChange={e => setSessionSearch(e.target.value)} />
          </div>
          {sessionSearch && filteredSessions.length > 0 && (
            <div style={resultList}>
              {filteredSessions.map(s => (
                <button key={s.id} className="hover-bg-elevated" style={resultRow}
                  onClick={() => { setLinks(prev => [...prev, { type: 'session', session_id: s.id, session_number: s.session_number, session_sub: s.session_sub, name: s.name }]); setSessionSearch('') }}>
                  <Scroll size={11} style={{ color: 'var(--gold)' }} />
                  {sessionLabel(s)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <button onClick={() => triggerDelete(onDelete)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: confirmingDelete ? 'var(--danger-hover)' : 'var(--danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px' }}>
          <Trash2 size={13} /> {confirmingDelete ? 'Confirm' : 'Delete'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            onClick={() => onSave({ name: name.trim(), description, links })}>Save</button>
        </div>
      </div>
    </Modal>
  )
}
