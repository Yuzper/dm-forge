// path: src/components/wiki/TrackVisibilityPanel.tsx
// DM control for per-track / per-milestone player visibility. Centralised in one
// modal (rather than a toggle on every track row) so it doesn't disturb the
// editor's track rendering. Persists `track_visibility` straight to the DB —
// it's DM-only metadata, independent of the article's body save cycle.
import { useState } from 'react'
import { useStore } from '../../store/store'
import Modal from '../Modal'
import type { Article, TrackVisibility, TrackVisMode } from '../../types'

const effectiveMode = (tv: TrackVisibility, key: string, isMs: boolean): TrackVisMode => {
  const e = (isMs ? tv.milestones : tv.tracks)?.[key]
  if (e?.mode) return e.mode
  return (!isMs && key.endsWith('_Date')) ? 'dm' : 'inherit'
}

function ModeControl({ mode, players, allPlayers, onMode, onTogglePlayer }: {
  mode: TrackVisMode
  players: number[]
  allPlayers: { id: number; label: string }[]
  onMode: (m: TrackVisMode) => void
  onTogglePlayer: (id: number) => void
}) {
  const btn = (m: TrackVisMode, label: string) => (
    <button onClick={() => onMode(m)}
      style={{
        fontSize: 11, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
        border: `1px solid ${mode === m ? 'var(--gold-dim)' : 'var(--border-light)'}`,
        background: mode === m ? 'rgba(200,168,75,0.12)' : 'transparent',
        color: mode === m ? 'var(--gold)' : 'var(--text-muted)',
      }}>{label}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {btn('inherit', 'Everyone')}
        {btn('dm', 'DM only')}
        {btn('restricted', 'Some players')}
      </div>
      {mode === 'restricted' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
          {allPlayers.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No players defined.</span>}
          {allPlayers.map(p => {
            const on = players.includes(p.id)
            return (
              <button key={p.id} onClick={() => onTogglePlayer(p.id)}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--gold-dim)' : 'var(--border-light)'}`,
                  background: on ? 'rgba(200,168,75,0.12)' : 'transparent',
                  color: on ? 'var(--gold)' : 'var(--text-muted)' }}>{p.label}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function TrackVisibilityPanel({ article, tracks, onClose }: {
  article: Article
  tracks: Record<string, string>
  onClose: () => void
}) {
  const players = useStore(s => s.players)
  const allPlayers = players.map(p => ({ id: p.id, label: p.display_name || p.username }))

  const [tv, setTv] = useState<TrackVisibility>(() => {
    try { return JSON.parse(article.track_visibility || '{}') } catch { return {} }
  })

  const persist = (next: TrackVisibility) => {
    setTv(next)
    window.api.updateArticle(article.id, { track_visibility: JSON.stringify(next) })
  }

  const setEntry = (bucket: 'tracks' | 'milestones', key: string, patch: (prev: { mode: TrackVisMode; players?: number[] }) => { mode: TrackVisMode; players?: number[] }) => {
    const cur = { ...(tv[bucket] ?? {}) }
    const prev = cur[key] ?? { mode: effectiveMode(tv, key, bucket === 'milestones') }
    cur[key] = patch(prev)
    persist({ ...tv, [bucket]: cur })
  }
  const onMode = (bucket: 'tracks' | 'milestones', key: string) => (mode: TrackVisMode) =>
    setEntry(bucket, key, prev => ({ mode, players: prev.players ?? [] }))
  const onTogglePlayer = (bucket: 'tracks' | 'milestones', key: string) => (id: number) =>
    setEntry(bucket, key, prev => {
      const set = new Set(prev.players ?? [])
      set.has(id) ? set.delete(id) : set.add(id)
      return { mode: 'restricted', players: [...set] }
    })

  // Fields the DM has actually filled in (skip the milestones blob — shown below).
  const trackKeys = Object.entries(tracks)
    .filter(([k, v]) => k !== 'Timeline_Milestones' && typeof v === 'string' && v.trim() !== '')
    .map(([k]) => k)
  let milestones: { id: string; label: string; date: string }[] = []
  try {
    const raw = JSON.parse(tracks.Timeline_Milestones || '[]')
    if (Array.isArray(raw)) milestones = raw.filter(m => m?.id)
  } catch { /* none */ }

  const row = (key: string, label: string, bucket: 'tracks' | 'milestones') => {
    const mode = effectiveMode(tv, key, bucket === 'milestones')
    const players = (bucket === 'milestones' ? tv.milestones : tv.tracks)?.[key]?.players ?? []
    return (
      <div key={bucket + key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', paddingTop: 3 }}>{label || '(untitled)'}</span>
        <ModeControl mode={mode} players={players} allPlayers={allPlayers}
          onMode={onMode(bucket, key)} onTogglePlayer={onTogglePlayer(bucket, key)} />
      </div>
    )
  }

  return (
    <Modal title="Field visibility" onClose={onClose} style={{ width: 560, maxWidth: '92vw' }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
        Controls which info-box fields and timeline milestones each player sees on this page
        (only matters for players who can already see the page). Fields default to <em>Everyone</em>;
        date fields default to <em>DM only</em>. Hidden fields never leak — not even as a tag.
      </p>

      {trackKeys.length === 0 && milestones.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This page has no track fields or milestones yet.</div>
      )}

      {trackKeys.map(k => row(k, k.replace(/_/g, ' '), 'tracks'))}

      {milestones.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Timeline milestones</div>
          {milestones.map(m => row(m.id, m.label, 'milestones'))}
        </div>
      )}
    </Modal>
  )
}
