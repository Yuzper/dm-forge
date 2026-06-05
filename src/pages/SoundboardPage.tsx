// path: src/pages/SoundboardPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store/store'
import {
  Music2, Plus, Trash2, ArrowLeft, Pencil, Check, X, FolderOpen,
  Volume2, Repeat, Link2, Play, Square,
} from 'lucide-react'
import type { SoundBoard, Sound, SoundCategory, DefaultSound, Session } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORIES: { value: SoundCategory; label: string; color: string }[] = [
  { value: 'ambience', label: 'Ambience', color: '#3b82f6' },
  { value: 'music',    label: 'Music',    color: '#10b981' },
  { value: 'effect',   label: 'Effect',   color: '#f59e0b' },
]

function categoryColor(cat: SoundCategory) {
  return CATEGORIES.find(c => c.value === cat)?.color ?? '#8a8a8a'
}
function categoryLabel(cat: SoundCategory) {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat
}
function basename(p: string) {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

// Virtual, always-present bundled default board
const DEFAULT_BOARD_ID = -1
const defaultBoard: SoundBoard = {
  id: DEFAULT_BOARD_ID, campaign_id: -1, name: 'Default Sounds', sort_order: -1, created_at: '',
}

// ── Add / Edit Sound Row ───────────────────────────────────────────────────────

function SoundFormRow({ boardId, sound, onSave, onCancel }: {
  boardId: number
  sound?: Sound
  onSave: (s: Sound) => void
  onCancel: () => void
}) {
  const [name, setName]         = useState(sound?.name ?? '')
  const [category, setCategory] = useState<SoundCategory>(sound?.category ?? 'effect')
  const [filePath, setFilePath] = useState(sound?.file_path ?? '')
  const [hotkey, setHotkey]     = useState(sound?.hotkey ?? '')
  const [volume, setVolume]     = useState(sound?.volume ?? 1)
  const [loop, setLoop]         = useState(sound ? !!sound.loop : (sound?.category ?? 'effect') !== 'effect')
  const [touchedLoop, setTouchedLoop] = useState(false)
  const [saving, setSaving]     = useState(false)

  const browsFile = async () => {
    const p = await window.api.selectAudioFile()
    if (!p) return
    setFilePath(p)
    if (!name) setName(basename(p).replace(/\.[^.]+$/, ''))
  }

  const pickCategory = (c: SoundCategory) => {
    setCategory(c)
    // For a new sound the user hasn't explicitly toggled, follow the category default
    if (!sound && !touchedLoop) setLoop(c !== 'effect')
  }

  const handleSave = async () => {
    if (!name.trim() || !filePath) return
    setSaving(true)
    const loopVal = loop ? 1 : 0
    let result: Sound
    if (sound) {
      result = await window.api.updateSound(sound.id, { name: name.trim(), category, file_path: filePath, hotkey: hotkey.trim(), volume, loop: loopVal })
    } else {
      result = await window.api.createSound({ board_id: boardId, name: name.trim(), category, file_path: filePath, hotkey: hotkey.trim(), volume, loop: loopVal })
    }
    onSave(result)
    setSaving(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px',
      background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border-light)',
    }}>
      {/* Row 1 — name, category, file, hotkey, actions */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 160px 1fr 72px auto',
        gap: 8, alignItems: 'center',
      }}>
        <input
          className="input"
          style={{ fontSize: 12 }}
          placeholder="Sound name…"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
        />

        <div style={{ display: 'flex', gap: 4 }}>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => pickCategory(c.value)}
              title={c.label}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 'var(--radius-sm)', fontSize: 10,
                cursor: 'pointer', border: `1px solid ${category === c.value ? c.color : 'var(--border-light)'}`,
                background: category === c.value ? `${c.color}20` : 'transparent',
                color: category === c.value ? c.color : 'var(--text-muted)',
                transition: 'all 120ms ease',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          onClick={browsFile}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', background: 'transparent',
            border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
            color: filePath ? 'var(--text-secondary)' : 'var(--text-muted)',
            fontSize: 12, cursor: 'pointer', overflow: 'hidden',
            transition: 'border-color var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'}
        >
          <FolderOpen size={12} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filePath ? basename(filePath) : 'Browse…'}
          </span>
        </button>

        <input
          className="input"
          style={{ fontSize: 12, textAlign: 'center' }}
          placeholder="Key"
          maxLength={1}
          value={hotkey}
          onChange={e => setHotkey(e.target.value.toUpperCase())}
          title="Optional hotkey (single key)"
        />

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!name.trim() || !filePath || saving}
          >
            <Check size={12} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Row 2 — volume + loop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 2 }}>
        <Volume2 size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          type="range" min={0} max={1} step={0.01}
          value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          style={{ width: 160, accentColor: '#3b82f6', cursor: 'pointer' }}
          title="Per-sound volume"
        />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 30 }}>
          {Math.round(volume * 100)}%
        </span>

        <button
          onClick={() => { setLoop(v => !v); setTouchedLoop(true) }}
          title={loop ? 'Loops — click to make one-shot' : 'One-shot — click to loop'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
            cursor: 'pointer', marginLeft: 'auto',
            border: `1px solid ${loop ? '#3b82f6' : 'var(--border-light)'}`,
            background: loop ? '#3b82f620' : 'transparent',
            color: loop ? '#3b82f6' : 'var(--text-muted)',
            transition: 'all 120ms ease',
          }}
        >
          <Repeat size={12} /> {loop ? 'Loop' : 'One-shot'}
        </button>
      </div>
    </div>
  )
}

// ── Sound Row ──────────────────────────────────────────────────────────────────

function SoundRow({ sound, onEdit, onDelete }: {
  sound: Sound
  onEdit: () => void
  onDelete: () => void
}) {
  const { confirming, trigger } = useConfirmDelete()
  const color = categoryColor(sound.category)
  const [previewing, setPreviewing] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Stop preview on unmount
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const togglePreview = async () => {
    if (previewing) {
      audioRef.current?.pause()
      if (audioRef.current) audioRef.current.currentTime = 0
      setPreviewing(false)
      return
    }
    if (!sound.file_path) return
    if (!audioRef.current) {
      const url = await window.api.getImagePath(sound.file_path)
      const a = new Audio(url)
      a.volume = sound.volume ?? 1
      a.onended = () => setPreviewing(false)
      a.onerror = () => setPreviewing(false)
      audioRef.current = a
    }
    audioRef.current.loop = !!sound.loop
    audioRef.current.currentTime = 0
    audioRef.current.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false))
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr 90px 1fr 72px auto',
      gap: 8, padding: '7px 12px', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
      transition: 'background 120ms ease',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      <button
        onClick={togglePreview}
        title={previewing ? 'Stop preview' : 'Preview sound'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          border: `1px solid ${previewing ? color : 'var(--border-light)'}`,
          background: previewing ? `${color}20` : 'transparent',
          color: previewing ? color : 'var(--text-secondary)',
          transition: 'all 120ms ease',
        }}
      >
        {previewing ? <Square size={11} /> : <Play size={11} />}
      </button>

      <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sound.name}
        </span>
        {!!sound.loop && (
          <Repeat size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} aria-label="Loops" />
        )}
        {sound.volume < 1 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
            {Math.round(sound.volume * 100)}%
          </span>
        )}
      </span>

      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, padding: '2px 8px', borderRadius: 99,
        border: `1px solid ${color}50`, background: `${color}15`, color,
        letterSpacing: '0.03em',
      }}>
        {categoryLabel(sound.category)}
      </span>

      <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={sound.file_path}>
        {basename(sound.file_path)}
      </span>

      <div style={{ textAlign: 'center' }}>
        {sound.hotkey ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 4, fontSize: 11, fontWeight: 600,
            border: '1px solid var(--border-light)', background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}>
            {sound.hotkey}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--border-light)' }}>—</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} title="Edit">
          <Pencil size={12} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => trigger(onDelete)}
          title={confirming ? 'Click again to confirm' : 'Delete'}
          style={{ color: confirming ? 'var(--danger-hover)' : undefined }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Board Panel ────────────────────────────────────────────────────────────────

function BoardPanel({ board, onBoardUpdate, onBoardDelete }: {
  board: SoundBoard
  onBoardUpdate: (b: SoundBoard) => void
  onBoardDelete: () => void
}) {
  const { currentCampaign, updateSession } = useStore()
  const [sounds, setSounds]         = useState<Sound[]>([])
  const [editingName, setEditingName] = useState(false)
  const [name, setName]             = useState(board.name)
  const [addingSound, setAddingSound] = useState(false)
  const [editingSound, setEditingSound] = useState<Sound | null>(null)
  const [sessions, setSessions]     = useState<Session[]>([])
  const [linkOpen, setLinkOpen]     = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const { confirming, trigger }     = useConfirmDelete()

  const sessionLabel = (s: Session) =>
    s.is_draft ? s.name : `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`
  const filteredSessions = sessions.filter(s =>
    sessionLabel(s).toLowerCase().includes(sessionSearch.trim().toLowerCase())
  )

  const linkedSessions = sessions.filter(s => s.soundboard_id === board.id)

  const toggleSessionLink = async (session: Session) => {
    const next = session.soundboard_id === board.id ? null : board.id
    // Route through the store so a currently-open session's widget updates instantly
    await updateSession(session.id, { soundboard_id: next })
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, soundboard_id: next } : s))
  }

  useEffect(() => {
    window.api.getSounds(board.id).then(setSounds)
  }, [board.id])

  useEffect(() => {
    if (currentCampaign) window.api.getSessions(currentCampaign.id).then(setSessions)
  }, [currentCampaign?.id])

  useEffect(() => {
    setName(board.name)
  }, [board.id, board.name])

  const saveName = useCallback(async () => {
    if (!name.trim() || name.trim() === board.name) { setEditingName(false); return }
    const updated = await window.api.updateSoundBoard(board.id, { name: name.trim() })
    onBoardUpdate(updated)
    setEditingName(false)
  }, [board.id, board.name, name])

  const handleSoundSaved = (s: Sound) => {
    setSounds(prev => {
      const idx = prev.findIndex(x => x.id === s.id)
      return idx >= 0 ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]
    })
    setAddingSound(false)
    setEditingSound(null)
  }

  const handleSoundDelete = async (id: number) => {
    await window.api.deleteSound(id)
    setSounds(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        minHeight: 52, flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        {editingName ? (
          <input
            className="input"
            style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500 }}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(board.name); setEditingName(false) } }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'text', textAlign: 'left',
              fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500,
              color: 'var(--text-primary)', letterSpacing: '0.03em',
              padding: '0', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {board.name}
            <Pencil size={11} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          </button>
        )}

        <button
          onClick={() => setAddingSound(true)}
          className="btn btn-primary btn-sm"
          disabled={addingSound}
        >
          <Plus size={13} /> Add Sound
        </button>

        {/* Session linker */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setLinkOpen(v => !v)}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}
            title="Link sessions — this board auto-loads when you open them"
          >
            <Link2 size={13} color={linkedSessions.length > 0 ? '#3b82f6' : 'currentColor'} />
            {linkedSessions.length > 0 ? `${linkedSessions.length} linked` : 'Link sessions'}
          </button>
          {linkOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setLinkOpen(false)} />
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 21,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                width: 280, maxHeight: 360, display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ padding: '8px 12px', fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  Auto-load for sessions
                </div>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                  <input
                    className="input"
                    style={{ fontSize: 12, width: '100%' }}
                    placeholder="Search sessions…"
                    value={sessionSearch}
                    onChange={e => setSessionSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div style={{ overflow: 'auto' }}>
                {sessions.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No sessions yet</div>
                ) : filteredSessions.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No matches</div>
                ) : filteredSessions.map(s => {
                  const linkedHere  = s.soundboard_id === board.id
                  const linkedOther = s.soundboard_id != null && s.soundboard_id !== board.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSessionLink(s)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                        padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer',
                        color: linkedHere ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12,
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: `1px solid ${linkedHere ? '#3b82f6' : 'var(--border-light)'}`,
                        background: linkedHere ? '#3b82f6' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {linkedHere && <Check size={10} color="#fff" />}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sessionLabel(s)}
                      </span>
                      {linkedOther && (
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }} title="Linked to another board">
                          other
                        </span>
                      )}
                    </button>
                  )
                })}
                </div>
              </div>
            </>
          )}
        </div>


        <button
          onClick={() => trigger(onBoardDelete)}
          className="btn btn-ghost btn-sm"
          style={{ color: confirming ? 'var(--danger-hover)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
          title={confirming ? 'Click again to confirm' : 'Delete board'}
        >
          <Trash2 size={13} /> {confirming ? 'Confirm' : 'Delete'}
        </button>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr 90px 1fr 72px auto',
        gap: 8, padding: '6px 12px',
        background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {[<span key="p" style={{ width: 26, display: 'inline-block' }} />, 'NAME', 'CATEGORY', 'FILE', 'HOTKEY', ''].map((h, i) => (
          <span key={i} style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '1.2px', fontWeight: 600 }}>{h}</span>
        ))}
      </div>

      {/* Sounds list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sounds.length === 0 && !addingSound && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No sounds yet.{' '}
            <button
              onClick={() => setAddingSound(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 13 }}
            >
              Add your first sound
            </button>
          </div>
        )}

        {sounds.map(s =>
          editingSound?.id === s.id ? (
            <div key={s.id} style={{ padding: '6px 12px' }}>
              <SoundFormRow
                boardId={board.id}
                sound={s}
                onSave={handleSoundSaved}
                onCancel={() => setEditingSound(null)}
              />
            </div>
          ) : (
            <SoundRow
              key={s.id}
              sound={s}
              onEdit={() => { setAddingSound(false); setEditingSound(s) }}
              onDelete={() => handleSoundDelete(s.id)}
            />
          )
        )}

        {addingSound && (
          <div style={{ padding: '6px 12px', marginTop: sounds.length > 0 ? 4 : 0 }}>
            <SoundFormRow
              boardId={board.id}
              onSave={handleSoundSaved}
              onCancel={() => setAddingSound(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Default Sound Row (read-only, with preview) ────────────────────────────────

function DefaultSoundRow({ sound, color, boards }: {
  sound: DefaultSound
  color: string
  boards: SoundBoard[]
}) {
  const [previewing, setPreviewing] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const togglePreview = () => {
    if (previewing) {
      audioRef.current?.pause()
      if (audioRef.current) audioRef.current.currentTime = 0
      setPreviewing(false)
      return
    }
    if (!audioRef.current) {
      const a = new Audio(sound.url)
      a.volume = 1
      a.onended = () => setPreviewing(false)
      a.onerror = () => setPreviewing(false)
      audioRef.current = a
    }
    audioRef.current.loop = sound.category !== 'effect'
    audioRef.current.currentTime = 0
    audioRef.current.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false))
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 20px', borderBottom: '1px solid var(--border)',
    }}>
      <button
        onClick={togglePreview}
        title={previewing ? 'Stop preview' : 'Preview sound'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          border: `1px solid ${previewing ? color : 'var(--border-light)'}`,
          background: previewing ? `${color}20` : 'transparent',
          color: previewing ? color : 'var(--text-secondary)',
          transition: 'all 120ms ease',
        }}
      >
        {previewing ? <Square size={10} /> : <Play size={10} />}
      </button>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sound.name}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={sound.url}>
        {basename(sound.url)}
      </span>
      <AddToBoardButton sound={sound} boards={boards} />
    </div>
  )
}

// ── Add-to-board control (for default sounds) ────────────────────────────────────

function AddToBoardButton({ sound, boards }: { sound: DefaultSound; boards: SoundBoard[] }) {
  const [open, setOpen]   = useState(false)
  const [added, setAdded] = useState(false)

  const addTo = async (boardId: number) => {
    await window.api.createSound({
      board_id: boardId,
      name: sound.name,
      category: sound.category,
      file_path: sound.ref,           // reference — resolves to the bundled file
      hotkey: '',
      volume: 1,
      loop: sound.category === 'effect' ? 0 : 1,
    })
    setOpen(false)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  if (boards.length === 0) {
    return (
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, fontStyle: 'italic' }}>
        no boards
      </span>
    )
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 11, color: added ? 'var(--success)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}
        title="Add this default to one of your soundboards"
      >
        {added ? <><Check size={12} /> Added</> : <><Plus size={12} /> Add to another soundboard</>}
      </button>
      {open && (
        <>
          {/* click-away backdrop */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 21,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
            minWidth: 160, maxHeight: 220, overflow: 'auto',
          }}>
            {boards.map(b => (
              <button
                key={b.id}
                onClick={() => addTo(b.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-ui)',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
              >
                {b.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Default Board Panel (read-only) ──────────────────────────────────────────────

function DefaultBoardPanel({ boards }: { boards: SoundBoard[] }) {
  const [defaults, setDefaults] = useState<DefaultSound[]>([])

  useEffect(() => {
    window.api.getDefaultSounds().then(setDefaults)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        minHeight: 52, flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500,
          color: 'var(--text-primary)', letterSpacing: '0.03em',
        }}>
          Default Sounds
        </span>
        <span style={{
          fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--gold-dim)', border: '1px solid var(--border-gold)',
          borderRadius: 2, padding: '1px 5px',
        }}>
          bundled · read-only
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {defaults.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, fontFamily: 'var(--font-body)' }}>
            No default sounds bundled yet.
            <br />
            <span style={{ fontSize: 12 }}>
              Drop audio files into <code style={{ color: 'var(--text-secondary)' }}>src/data/soundboard/{'{ambient,music,effects}'}</code> and relaunch.
            </span>
          </div>
        ) : (
          (['ambience', 'music', 'effect'] as SoundCategory[]).map(cat => {
            const catSounds = defaults.filter(d => d.category === cat)
            if (catSounds.length === 0) return null
            const color = categoryColor(cat)
            return (
              <div key={cat} style={{ padding: '4px 0' }}>
                <div style={{
                  padding: '8px 20px 4px', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase',
                  fontFamily: 'var(--font-display)', color,
                }}>
                  {categoryLabel(cat)} <span style={{ color: 'var(--text-muted)' }}>· {catSounds.length}</span>
                </div>
                {catSounds.map((d, i) => (
                  <DefaultSoundRow key={`${cat}-${i}`} sound={d} color={color} boards={boards} />
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Board List Item ────────────────────────────────────────────────────────────

function BoardListItem({ board, isActive, onClick }: {
  board: SoundBoard
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '7px 10px', borderRadius: 'var(--radius-sm)',
        cursor: isActive ? 'default' : 'pointer',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isActive ? '#3b82f640' : 'transparent'}`,
        transition: 'all 120ms ease',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <Music2 size={11} style={{ color: isActive ? '#3b82f6' : 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)',
      }}>
        {board.name}
      </span>
      {board.id === DEFAULT_BOARD_ID ? (
        <span style={{
          fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--gold-dim)', border: '1px solid var(--border-gold)',
          borderRadius: 2, padding: '0 4px', flexShrink: 0,
        }}>
          default
        </span>
      ) : (board.sound_count ?? 0) > 0 && (
        <span style={{
          fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-elevated)',
          padding: '1px 5px', borderRadius: 99, border: '1px solid var(--border-light)', flexShrink: 0,
        }}>
          {board.sound_count}
        </span>
      )}
    </div>
  )
}

// ── Soundboard Page ────────────────────────────────────────────────────────────

export default function SoundboardPage() {
  const { currentCampaign, setView, setCampaignSubView, setHintContext } = useStore()
  useEffect(() => { setHintContext('soundboard'); return () => setHintContext(null) }, [setHintContext])
  const [boards, setBoards]             = useState<SoundBoard[]>([])
  const [activeBoard, setActiveBoard]   = useState<SoundBoard | null>(null)
  const [creating, setCreating]         = useState(false)
  const [newBoardName, setNewBoardName] = useState('')

  const loadBoards = useCallback(async () => {
    if (!currentCampaign) return
    const bs = await window.api.getSoundBoards(currentCampaign.id)
    setBoards(bs)
    return bs
  }, [currentCampaign?.id])

  useEffect(() => {
    loadBoards().then(bs => {
      if (bs && bs.length > 0 && !activeBoard) setActiveBoard(bs[0])
    })
  }, [currentCampaign?.id])

  const handleCreateBoard = async () => {
    if (!currentCampaign || !newBoardName.trim()) return
    const b = await window.api.createSoundBoard({ campaign_id: currentCampaign.id, name: newBoardName.trim() })
    setBoards(prev => [...prev, b])
    setActiveBoard(b)
    setNewBoardName('')
    setCreating(false)
  }

  const handleBoardUpdate = (updated: SoundBoard) => {
    setBoards(prev => prev.map(b => b.id === updated.id ? updated : b))
    if (activeBoard?.id === updated.id) setActiveBoard(updated)
  }

  const handleBoardDelete = async () => {
    if (!activeBoard) return
    await window.api.deleteSoundBoard(activeBoard.id)
    const remaining = boards.filter(b => b.id !== activeBoard.id)
    setBoards(remaining)
    setActiveBoard(remaining.length > 0 ? remaining[0] : null)
  }

  if (!currentCampaign) return null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        padding: '0 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        minHeight: 48, flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        <button
          onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 12px 0 0', background: 'transparent', border: 'none',
            borderRight: '1px solid var(--border)', height: '100%', minHeight: 48,
            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            transition: 'color var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <Music2 size={13} color="#3b82f6" />
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500,
          color: 'var(--text-primary)', letterSpacing: '0.03em', flex: 1,
        }}>
          Soundboard
        </span>
        <button
          onClick={() => { setCreating(true); setNewBoardName('') }}
          className="btn btn-primary btn-sm"
          disabled={creating}
        >
          <Plus size={13} /> New Board
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar — board list */}
        <div style={{
          width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 8px' }}>

            {/* Inline create form */}
            {creating && (
              <div style={{ marginBottom: 6, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <input
                  className="input"
                  style={{ fontSize: 12, marginBottom: 6 }}
                  placeholder="Board name…"
                  value={newBoardName}
                  onChange={e => setNewBoardName(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateBoard(); if (e.key === 'Escape') setCreating(false) }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleCreateBoard} disabled={!newBoardName.trim()}>
                    <Check size={11} /> Create
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>
                    <X size={11} />
                  </button>
                </div>
              </div>
            )}

            {/* Bundled default board — always pinned at top */}
            <BoardListItem
              board={defaultBoard}
              isActive={activeBoard?.id === DEFAULT_BOARD_ID}
              onClick={() => setActiveBoard(defaultBoard)}
            />

            {boards.length === 0 && !creating ? (
              <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
                No campaign boards yet.
                <br />
                <button
                  onClick={() => setCreating(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12, marginTop: 4 }}
                >
                  Create your first board
                </button>
              </div>
            ) : (
              boards.map(b => (
                <BoardListItem
                  key={b.id}
                  board={b}
                  isActive={activeBoard?.id === b.id}
                  onClick={() => setActiveBoard(b)}
                />
              ))
            )}
          </div>
        </div>

        {/* Board panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeBoard?.id === DEFAULT_BOARD_ID ? (
            <DefaultBoardPanel boards={boards} />
          ) : activeBoard ? (
            <BoardPanel
              key={activeBoard.id}
              board={activeBoard}
              onBoardUpdate={handleBoardUpdate}
              onBoardDelete={handleBoardDelete}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
              <Music2 size={40} strokeWidth={1} color="var(--border-light)" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No board selected</div>
                <div style={{ fontSize: 13 }}>Create a board and add sounds to it</div>
              </div>
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={14} /> New Board
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
