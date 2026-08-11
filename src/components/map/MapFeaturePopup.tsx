// path: src/components/map/MapFeaturePopup.tsx
// The view-mode popup shared by every clickable thing on a map — a pin, a
// kingdom border, a district. Everything below the swatch is identical between
// them, so only the swatch is supplied by the caller.
import type { ReactNode } from 'react'
import { BookOpen, ExternalLink, Pencil, Scroll, X } from 'lucide-react'
import type { HubLink } from '../../utils/hubLinks'
import { SECTION_ACCENTS } from '../../constants/sections'

// Read during render — see the note in constants/sections.ts.

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
  display: 'flex', padding: '2px 3px', borderRadius: 3, transition: 'color var(--transition)',
}

const linkBtn: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 5px',
  margin: '0 -5px', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer',
  fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left',
  transition: 'background var(--transition)',
}

const groupLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 4,
}

export default function MapFeaturePopup({
  title, swatch, description, links, editMode,
  onClose, onEdit, onNavigateWiki, onNavigateSession,
}: {
  title: string
  /** Round for a pin, square for a region — the only thing that differs. */
  swatch: ReactNode
  description: string
  links: HubLink[]
  editMode: boolean
  onClose: () => void
  onEdit: () => void
  onNavigateWiki: (title: string) => void
  onNavigateSession: (sessionId: number) => void
}) {
  const WIKI_ACCENT = SECTION_ACCENTS['wiki']
  const wikis = links.filter(l => l.type === 'wiki')
  const sessions = links.filter(l => l.type === 'session')

  return (
    <div
      // Keeps the map's wheel-to-zoom off the description and link list.
      data-map-overlay
      style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', width: 220,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)', overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: '9px 11px 7px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {swatch}
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {editMode && (
              <button onClick={onEdit} className="hover-text" title="Edit" style={iconBtn}>
                <Pencil size={11} />
              </button>
            )}
            <button onClick={onClose} className="hover-text" title="Close" style={iconBtn}>
              <X size={11} />
            </button>
          </div>
        </div>
        {description && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>
            {description}
          </div>
        )}
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 220 }}>
        {wikis.length > 0 && (
          <div style={{ padding: '6px 11px', borderBottom: sessions.length > 0 ? '1px solid var(--border)' : 'none' }}>
            <div style={groupLabel}>Wiki</div>
            {wikis.map((l, i) => (
              <button key={i} onClick={() => onNavigateWiki(l.title!)} className="hover-bg-active" style={linkBtn}>
                <BookOpen size={11} style={{ color: WIKI_ACCENT, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                <ExternalLink size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {sessions.length > 0 && (
          <div style={{ padding: '6px 11px' }}>
            <div style={groupLabel}>Sessions</div>
            {sessions.map((l, i) => (
              <button key={i} onClick={() => onNavigateSession(l.session_id!)} className="hover-bg-active" style={linkBtn}>
                <Scroll size={11} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Session {l.session_number}{l.session_sub}: {l.name}
                </span>
                <ExternalLink size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {wikis.length === 0 && sessions.length === 0 && (
          <div style={{ padding: '8px 11px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {editMode ? 'Click the pencil to add links' : 'No links yet'}
          </div>
        )}
      </div>
    </div>
  )
}
