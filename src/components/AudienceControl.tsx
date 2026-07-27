// path: src/components/AudienceControl.tsx
// "Visible to" control for the player-facing pages: sets which players (or the
// whole party) can see a given entity. Deny-by-default — no grant = Hidden.
import { useRef, useState } from 'react'
import { Eye, EyeOff, Users, Check, UserCog } from 'lucide-react'
import { useStore } from '../store/store'
import DropdownPortal from './DropdownPortal'
import type { VisibilityEntityType, Grantee } from '../types'

export default function AudienceControl({ entityType, entityId }: {
  entityType: VisibilityEntityType
  entityId: number
}) {
  const players = useStore(s => s.players)
  const grants = useStore(s => s.grants)
  const setEntityAudience = useStore(s => s.setEntityAudience)
  const setPlayersManagerOpen = useStore(s => s.setPlayersManagerOpen)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const entityGrants = grants.filter(g => g.entity_type === entityType && g.entity_id === entityId)
  const hasParty = entityGrants.some(g => g.player_id === null)
  const grantedIds = entityGrants.filter(g => g.player_id !== null).map(g => g.player_id as number)

  const nameFor = (id: number) => {
    const p = players.find(pl => pl.id === id)
    return p ? (p.display_name || p.username) : 'Unknown'
  }

  // Label + colour reflect the current audience at a glance.
  let label: string
  if (hasParty) label = 'All players'
  else if (grantedIds.length === 1) label = nameFor(grantedIds[0])
  else if (grantedIds.length > 1) label = `${grantedIds.length} players`
  else label = 'Hidden'
  const shared = hasParty || grantedIds.length > 0

  const apply = (grantees: Grantee[]) => setEntityAudience(entityType, entityId, grantees)

  const toggleParty = () => apply(hasParty ? [] : [null])
  const togglePlayer = (id: number) => {
    if (hasParty) return // party already covers everyone
    apply(grantedIds.includes(id) ? grantedIds.filter(x => x !== id) : [...grantedIds, id])
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '7px 11px', background: 'transparent', border: 'none',
    color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', textAlign: 'left',
  }
  const box = (on: boolean) => (
    <span style={{
      width: 14, height: 14, flexShrink: 0, borderRadius: 3,
      border: `1px solid ${on ? 'var(--gold)' : 'var(--border-light)'}`,
      background: on ? 'var(--gold)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {on && <Check size={10} color="var(--bg-base)" />}
    </span>
  )

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title="Choose which players can see this"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99,
          fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 120ms ease',
          background: shared ? 'rgba(200,168,75,0.12)' : 'transparent',
          border: `1px solid ${shared ? 'var(--gold-dim)' : 'var(--border-light)'}`,
          color: shared ? 'var(--gold)' : 'var(--text-muted)',
        }}
        className="hover-gold-border"
      >
        {shared ? <Eye size={11} /> : <EyeOff size={11} />} {label}
      </button>

      {open && (
        <DropdownPortal anchor={btnRef.current} align="right" minWidth={210} onClose={() => setOpen(false)}>
          <div style={{ padding: '7px 11px 5px', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Visible to
          </div>

          <button onClick={toggleParty} style={rowStyle} className="hover-bg">
            {box(hasParty)}
            <Users size={13} style={{ opacity: 0.8 }} />
            <span style={{ flex: 1 }}>Whole party</span>
          </button>

          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />

          {players.length === 0 ? (
            <div style={{ padding: '7px 11px', fontSize: 11, color: 'var(--text-muted)' }}>No players yet.</div>
          ) : (
            players.map(p => {
              const on = hasParty || grantedIds.includes(p.id)
              return (
                <button key={p.id} onClick={() => togglePlayer(p.id)} style={{ ...rowStyle, opacity: hasParty ? 0.55 : 1, cursor: hasParty ? 'default' : 'pointer' }} className={hasParty ? '' : 'hover-bg'}>
                  {box(on)}
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.display_name || p.username}
                  </span>
                </button>
              )
            })
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button
            onClick={() => { setOpen(false); setPlayersManagerOpen(true) }}
            style={{ ...rowStyle, color: 'var(--text-muted)' }}
            className="hover-bg"
          >
            <UserCog size={13} /> <span>Manage players…</span>
          </button>
        </DropdownPortal>
      )}
    </>
  )
}
