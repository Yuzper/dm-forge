// path: src/components/campaign/AmbiencePanel.tsx
// The hub's ambience rail item: which soundboard belongs to where the party
// is, and one click to put it in the player.
//
// It deliberately owns no audio, and never starts a sound: SoundboardWidget
// already handles playback, crossfading and per-sound volume, so this panel
// only asks it to switch board (store.requestSoundBoard), which brings the
// player up on that board for you to press play. Two places both holding
// <audio> elements would fight over the same files.
//
// "Here" is derived, not stored: the party's current stop is a pin linked to a
// session, and a session can already link a board (sessions.soundboard_id).
// So the board for where they stand is that session's board — no new schema,
// and linking one in the soundboard page lights this up.

import { Music2, Radio, MapPin } from 'lucide-react'
import { useStore } from '../../store/store'
import { lastVisit, type TrailStop } from '../../utils/partyTrail'

export default function AmbiencePanel({ trail }: { trail: TrailStop[] }) {
  const { soundBoards, sessions, setView } = useStore()
  const requestSoundBoard = useStore(s => s.requestSoundBoard)

  const here = trail.length > 0 ? trail[trail.length - 1] : null
  const hereSession = here ? sessions.find(s => s.id === lastVisit(here).sessionId) : undefined
  const hereBoard = hereSession?.soundboard_id != null
    ? soundBoards.find(b => b.id === hereSession.soundboard_id)
    : undefined

  const rest = soundBoards.filter(b => b.id !== hereBoard?.id)

  const boardRow = (board: { id: number; name: string; sound_count?: number }, highlight: boolean) => (
    <button
      key={board.id}
      onClick={() => requestSoundBoard(board.id)}
      title={`Load “${board.name}” in the player`}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
        background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', textAlign: 'left',
      }}
      className="hover-opacity"
    >
      <Radio size={12} style={{ color: highlight ? 'var(--section-soundboard, #4cc9d6)' : 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {board.name}
      </span>
      {board.sound_count != null && (
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
          {board.sound_count} sound{board.sound_count !== 1 ? 's' : ''}
        </span>
      )}
    </button>
  )

  if (soundBoards.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '2px 0' }}>
        No soundboards yet
      </div>
    )
  }

  return (
    <div>
      {here && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 2px' }}>
            <MapPin size={10} style={{ color: 'var(--gold)' }} /> {here.label || 'Where they are'}
          </div>
          {hereBoard
            ? boardRow(hereBoard, true)
            : (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, padding: '2px 0 6px' }}>
                No board linked to session {lastVisit(here).number}{lastVisit(here).sub}. Link one from the
                {' '}
                <button onClick={() => setView('soundboard')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--text-secondary)', textDecoration: 'underline' }}
                  className="hover-gold">
                  soundboard page
                </button>.
              </div>
            )}
        </>
      )}

      {rest.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '9px 0 2px' }}>
            {hereBoard ? 'Other boards' : 'Boards'}
          </div>
          {rest.map(b => boardRow(b, false))}
        </>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          onClick={() => setView('soundboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99,
            fontSize: 11, cursor: 'pointer', border: '1px solid var(--border-light)',
            background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
          }}
          className="hover-gold-border">
          <Music2 size={11} /> Soundboard
        </button>
        {hereBoard && (
          <button
            onClick={() => requestSoundBoard(hereBoard.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99,
              fontSize: 11, cursor: 'pointer', border: '1px solid var(--border-light)',
              background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
            }}
            className="hover-gold-border">
            <Radio size={11} /> Load here
          </button>
        )}
      </div>
    </div>
  )
}
