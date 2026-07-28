// path: src/components/wiki/TrackVisibilityControl.tsx
// Inline per-field player-visibility control — the eye that sits on each track
// row and milestone. Replaces the old centralised modal: visibility is set right
// where the field is edited, and the icon makes hidden fields obvious at a glance.
import { useRef, useState } from 'react'
import { Eye, EyeOff, Users } from 'lucide-react'
import DropdownPortal from '../DropdownPortal'
import type { TrackVisibility, TrackVisMode } from '../../types'

// Stored mode for a field, applying the defaults: fields inherit (visible to
// anyone who can see the page) except *_Date fields, which start DM-only.
// Mirrors trackMode() in electron/main/ipc/publishCore.ts — keep them in step.
export function effectiveTrackMode(tv: TrackVisibility, key: string, isMilestone = false): TrackVisMode {
  const e = (isMilestone ? tv.milestones : tv.tracks)?.[key]
  if (e?.mode) return e.mode
  return (!isMilestone && key.endsWith('_Date')) ? 'dm' : 'inherit'
}

export function trackModePlayers(tv: TrackVisibility, key: string, isMilestone = false): number[] {
  return (isMilestone ? tv.milestones : tv.tracks)?.[key]?.players ?? []
}

const META: Record<TrackVisMode, { icon: any; color: string; label: string }> = {
  inherit:    { icon: Eye,    color: 'var(--text-muted)', label: 'Everyone' },
  dm:         { icon: EyeOff, color: '#e05555',           label: 'DM only' },
  restricted: { icon: Users,  color: 'var(--gold)',       label: 'Some players' },
}

export default function TrackVisibilityControl({ mode, players, allPlayers, onMode, onTogglePlayer }: {
  mode: TrackVisMode
  players: number[]
  allPlayers: { id: number; label: string }[]
  onMode: (m: TrackVisMode) => void
  onTogglePlayer: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const meta = META[mode]
  const Icon = meta.icon

  const summary = mode === 'restricted'
    ? `visible to ${players.length} player${players.length === 1 ? '' : 's'}`
    : mode === 'dm' ? 'hidden from players' : 'visible to anyone who can see this page'

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        title={`Player visibility: ${meta.label} — ${summary}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
          display: 'flex', alignItems: 'center', color: meta.color,
          // The default state stays quiet; anything non-default reads at a glance.
          opacity: mode === 'inherit' ? 0.4 : 1, flexShrink: 0,
        }}
      >
        <Icon size={12} />
      </button>
      {open && (
        <DropdownPortal anchor={btnRef.current} align="right" minWidth={186} onClose={() => setOpen(false)}>
          <div style={{ padding: '7px 9px' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
              Player visibility
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(['inherit', 'dm', 'restricted'] as TrackVisMode[]).map(m => {
                const M = META[m]
                const MIcon = M.icon
                const on = mode === m
                return (
                  <button key={m} onClick={() => onMode(m)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                      padding: '5px 7px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--gold-dim)' : 'transparent'}`,
                      background: on ? 'rgba(200,168,75,0.12)' : 'none',
                      color: on ? 'var(--gold)' : 'var(--text-secondary)',
                      fontSize: 12, fontFamily: 'var(--font-ui)', textAlign: 'left',
                    }}>
                    <MIcon size={12} style={{ flexShrink: 0, color: M.color }} /> {M.label}
                  </button>
                )
              })}
            </div>
            {mode === 'restricted' && (
              <div style={{ marginTop: 7, borderTop: '1px solid var(--border)', paddingTop: 7, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {allPlayers.length === 0
                  ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No players defined.</span>
                  : allPlayers.map(p => {
                      const on = players.includes(p.id)
                      return (
                        <button key={p.id} onClick={() => onTogglePlayer(p.id)}
                          style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                            border: `1px solid ${on ? 'var(--gold-dim)' : 'var(--border-light)'}`,
                            background: on ? 'rgba(200,168,75,0.12)' : 'transparent',
                            color: on ? 'var(--gold)' : 'var(--text-muted)',
                          }}>{p.label}</button>
                      )
                    })}
              </div>
            )}
          </div>
        </DropdownPortal>
      )}
    </>
  )
}
