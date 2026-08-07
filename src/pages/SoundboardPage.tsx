// path: src/pages/SoundboardPage.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStore } from '../store/store'
import {
  Music2, Plus, Trash2, ArrowLeft, Pencil, Check, X, FolderOpen,
  Volume2, Repeat, Link2, Play, Square, Search, Library, ListPlus,
} from 'lucide-react'
import type { SoundBoard, Sound, SoundCategory, SoundLibraryEntry, Session } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'
import Modal from '../components/Modal'
import DropdownPortal from '../components/DropdownPortal'
import {
  SOUND_CATEGORIES as CATEGORIES,
  soundCategoryColor as categoryColor,
  soundCategoryLabel as categoryLabel,
  LIBRARY_BOARD_ID, LIBRARY_BOARD,
} from '../constants/soundCategories'
import { SECTION_ACCENTS } from '../constants/sections'
import { useContextMenu } from '../hooks/useContextMenu'
import { buildSoundMenu, truncate } from '../utils/contextMenus'

// Section accent used for all soundboard-flavoured UI chrome on this page.
const ACCENT = SECTION_ACCENTS['soundboard']

function basename(p: string) {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

const matches = (q: string, ...fields: string[]) => {
  const needle = q.trim().toLowerCase()
  return !needle || fields.some(f => f.toLowerCase().includes(needle))
}

// ── Preview button ─────────────────────────────────────────────────────────────
// Plays a single file in place. Owns its own Audio element so several rows can be
// auditioned without touching the widget's playback state.

function PreviewButton({ filePath, loop, volume = 1, color, size = 26 }: {
  filePath: string
  loop: boolean
  volume?: number
  color: string
  size?: number
}) {
  const [previewing, setPreviewing] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Stop preview on unmount, and drop the element if the file behind it changed
  useEffect(() => () => { audioRef.current?.pause() }, [])
  useEffect(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setPreviewing(false)
  }, [filePath])

  const toggle = async () => {
    if (previewing) {
      audioRef.current?.pause()
      if (audioRef.current) audioRef.current.currentTime = 0
      setPreviewing(false)
      return
    }
    if (!filePath) return
    if (!audioRef.current) {
      const url = await window.api.getImagePath(filePath)
      const a = new Audio(url)
      a.onended = () => setPreviewing(false)
      a.onerror = () => setPreviewing(false)
      audioRef.current = a
    }
    audioRef.current.volume = volume
    audioRef.current.loop = loop
    audioRef.current.currentTime = 0
    audioRef.current.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false))
  }

  return (
    <button
      onClick={toggle}
      title={previewing ? 'Stop preview' : 'Preview sound'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        border: `1px solid ${previewing ? color : 'var(--border-light)'}`,
        background: previewing ? `${color}20` : 'transparent',
        color: previewing ? color : 'var(--text-secondary)',
        transition: 'all 120ms ease',
      }}
    >
      {previewing ? <Square size={size < 24 ? 9 : 11} /> : <Play size={size < 24 ? 9 : 11} />}
    </button>
  )
}

// ── Sound editor ───────────────────────────────────────────────────────────────
// Shared by library entries and board copies — same fields either way, only the
// row it writes back to differs.

export interface SoundFields {
  name: string
  category: SoundCategory
  hotkey: string
  volume: number
  loop: number
}

function SoundEditModal({ title, initial, fileLabel, onSave, onClose }: {
  title: string
  initial: SoundFields
  fileLabel?: string
  onSave: (v: SoundFields) => Promise<void> | void
  onClose: () => void
}) {
  const [name, setName]         = useState(initial.name)
  const [category, setCategory] = useState<SoundCategory>(initial.category)
  const [hotkey, setHotkey]     = useState(initial.hotkey)
  const [volume, setVolume]     = useState(initial.volume)
  const [loop, setLoop]         = useState(!!initial.loop)
  const [saving, setSaving]     = useState(false)

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    await onSave({ name: name.trim(), category, hotkey: hotkey.trim(), volume, loop: loop ? 1 : 0 })
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose} style={{ width: 420 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="input-label" style={{ display: 'block', marginBottom: 6 }}>Name</label>
          <input
            className="input"
            style={{ width: '100%' }}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save() }}
          />
        </div>

        <div>
          <label className="input-label" style={{ display: 'block', marginBottom: 6 }}>Category</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 'var(--radius-sm)', fontSize: 12,
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
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ width: 90 }}>
            <label className="input-label" style={{ display: 'block', marginBottom: 6 }}>Hotkey</label>
            <input
              className="input"
              style={{ width: '100%', textAlign: 'center' }}
              placeholder="—"
              maxLength={1}
              value={hotkey}
              onChange={e => setHotkey(e.target.value.toUpperCase())}
              title="Optional single-key shortcut while the widget is open"
            />
          </div>
          <button
            onClick={() => setLoop(v => !v)}
            title={loop ? 'Loops — click to make one-shot' : 'One-shot — click to loop'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 32,
              padding: '0 12px', borderRadius: 'var(--radius-sm)', fontSize: 12,
              cursor: 'pointer',
              border: `1px solid ${loop ? ACCENT : 'var(--border-light)'}`,
              background: loop ? `${ACCENT}20` : 'transparent',
              color: loop ? ACCENT : 'var(--text-muted)',
              transition: 'all 120ms ease',
            }}
          >
            <Repeat size={13} /> {loop ? 'Loop' : 'One-shot'}
          </button>
        </div>

        <div>
          <label className="input-label" style={{ display: 'block', marginBottom: 6 }}>Volume</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Volume2 size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              type="range" min={0} max={1} step={0.01}
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: ACCENT, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 34, textAlign: 'right' }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {fileLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            <FolderOpen size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileLabel}>
              {basename(fileLabel)}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim() || saving}>
            <Check size={13} /> Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Add-to-board control ───────────────────────────────────────────────────────

type LibraryLike = { name: string; category: SoundCategory; file_path: string; hotkey?: string; volume?: number; loop?: number }

/** Copy a library entry onto a board. Shared by the button and the row's menu. */
async function addSoundToBoard(boardId: number, entry: LibraryLike) {
  await window.api.createSound({
    board_id: boardId,
    name: entry.name,
    category: entry.category,
    file_path: entry.file_path,
    hotkey: entry.hotkey ?? '',
    volume: entry.volume ?? 1,
    loop: entry.loop ?? (entry.category === 'effect' ? 0 : 1),
  })
}

function AddToBoardButton({ entry, boards, onAdded, compact }: {
  entry: LibraryLike
  boards: SoundBoard[]
  onAdded?: () => void
  compact?: boolean
}) {
  const bumpSoundsVersion = useStore(s => s.bumpSoundsVersion)
  const [open, setOpen]   = useState(false)
  const [added, setAdded] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const addTo = async (boardId: number) => {
    await addSoundToBoard(boardId, entry)
    setOpen(false)
    setAdded(true)
    onAdded?.()
    bumpSoundsVersion()
    setTimeout(() => setAdded(false), 1500)
  }

  if (boards.length === 0) {
    return compact ? null : (
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, fontStyle: 'italic' }}>
        no boards
      </span>
    )
  }

  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => setOpen(v => !v)}
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 11, color: added ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }}
        title="Add this sound to one of your soundboards"
      >
        {added ? <Check size={12} /> : <ListPlus size={12} />}
        {!compact && (added ? ' Added' : ' Add to soundboard')}
      </button>
      {open && (
        <DropdownPortal anchor={anchorRef.current} align="right" minWidth={170} onClose={() => setOpen(false)}>
          <div style={{
            padding: '6px 12px', fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase',
            color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
          }}>
            Add to
          </div>
          {boards.map(b => (
            <button
              key={b.id}
              onClick={() => addTo(b.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-ui)',
              }}
              className="hover-bg"
            >
              {b.name}
            </button>
          ))}
        </DropdownPortal>
      )}
    </>
  )
}

// ── Library row ────────────────────────────────────────────────────────────────

function LibraryRow({ entry, boards, onEdit, onDelete, onAddedToBoard }: {
  entry: SoundLibraryEntry
  boards: SoundBoard[]
  onEdit: () => void
  onDelete: () => void
  onAddedToBoard: () => void
}) {
  const { confirming, trigger } = useConfirmDelete()
  const bumpSoundsVersion = useStore(s => s.bumpSoundsVersion)
  const showMenu = useContextMenu()
  const color = categoryColor(entry.category)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 8px', borderBottom: '1px solid var(--border)',
        transition: 'background 120ms ease',
      }}
      className="hover-bg"
      onContextMenu={e => showMenu(e, buildSoundMenu(entry, {
        edit: onEdit,
        boards,
        onAddToBoard: async (boardId) => {
          await addSoundToBoard(boardId, entry)
          onAddedToBoard()
          bumpSoundsVersion()
        },
        onDelete,
        deleteLabel: `Remove “${truncate(entry.name)}” from the library`,
      }))}
    >
      <PreviewButton filePath={entry.file_path} loop={!!entry.loop} volume={entry.volume ?? 1} color={color} size={22} />

      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={`${entry.name} · ${basename(entry.file_path)}`}
        >
          {entry.name}
        </span>
        {!!entry.loop && <Repeat size={10} color="var(--text-muted)" style={{ flexShrink: 0 }} aria-label="Loops" />}
        {entry.hotkey && (
          <span style={{
            fontSize: 9, color: 'var(--text-muted)', border: '1px solid var(--border-light)',
            borderRadius: 2, padding: '0 3px', flexShrink: 0, lineHeight: '13px',
          }}>
            {entry.hotkey}
          </span>
        )}
      </span>

      <AddToBoardButton entry={entry} boards={boards} onAdded={onAddedToBoard} compact />
      <button className="btn btn-ghost btn-sm" onClick={onEdit} title="Edit" style={{ color: 'var(--text-muted)' }}>
        <Pencil size={12} />
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => trigger(onDelete)}
        title={confirming ? 'Click again to confirm — removes it from the library' : 'Remove from library'}
        style={{ color: confirming ? 'var(--danger-hover)' : 'var(--text-muted)' }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── Sound Library panel ────────────────────────────────────────────────────────
// One shelf for every sound in the app: the bundled starters plus everything the
// user imports. Boards pull their copies from here.

function SoundLibraryPanel({ boards, entries, setEntries, onBoardsChanged }: {
  boards: SoundBoard[]
  entries: SoundLibraryEntry[]
  setEntries: React.Dispatch<React.SetStateAction<SoundLibraryEntry[]>>
  onBoardsChanged: () => void
}) {
  const bumpSoundsVersion = useStore(s => s.bumpSoundsVersion)
  const [search, setSearch]   = useState('')
  const [editing, setEditing] = useState<SoundLibraryEntry | null>(null)
  const [importing, setImporting] = useState(false)

  const importInto = async (category: SoundCategory) => {
    if (importing) return
    setImporting(true)
    try {
      const picked = await window.api.selectAudioFiles()
      for (const p of picked) {
        const created = await window.api.createLibrarySound({
          name: p.name, category, file_path: p.file_path,
        })
        setEntries(prev => [...prev, created])
      }
      if (picked.length > 0) bumpSoundsVersion()
    } finally {
      setImporting(false)
    }
  }

  const saveEdit = async (id: number, v: SoundFields) => {
    const updated = await window.api.updateLibrarySound(id, v)
    setEntries(prev => prev.map(e => e.id === id ? updated : e))
    bumpSoundsVersion()
  }

  const remove = async (id: number) => {
    await window.api.deleteLibrarySound(id)
    setEntries(prev => prev.filter(e => e.id !== id))
    bumpSoundsVersion()
  }

  const filtered = entries.filter(e => matches(search, e.name, basename(e.file_path)))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        minHeight: 52, flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        <Library size={14} color={ACCENT} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500,
          color: 'var(--text-primary)', letterSpacing: '0.03em',
        }}>
          Sound Library
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {entries.length} sound{entries.length === 1 ? '' : 's'}
        </span>

        <div style={{ position: 'relative', marginLeft: 'auto', width: 220 }}>
          <Search size={12} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            className="input"
            style={{ fontSize: 12, width: '100%', paddingLeft: 26 }}
            placeholder="Search sounds…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Three columns — one per category */}
      <div style={{
        flex: 1, overflow: 'hidden', display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      }}>
        {CATEGORIES.map((cat, i) => {
          const catEntries = filtered.filter(e => e.category === cat.value)
          const total      = entries.filter(e => e.category === cat.value).length
          return (
            <div
              key={cat.value}
              style={{
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                borderRight: i < CATEGORIES.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 10px 8px', flexShrink: 0,
                borderBottom: `1px solid ${cat.color}35`, background: 'var(--bg-elevated)',
              }}>
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '1.6px',
                  textTransform: 'uppercase', color: cat.color, flex: 1,
                }}>
                  {cat.label}
                  <span style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>
                    {' · '}{search ? `${catEntries.length}/${total}` : total}
                  </span>
                </span>
                <button
                  onClick={() => importInto(cat.value)}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, color: cat.color }}
                  disabled={importing}
                  title={`Import audio files as ${cat.label.toLowerCase()}`}
                >
                  <Plus size={12} /> Import
                </button>
              </div>

              {/* Rows */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {catEntries.length === 0 ? (
                  <div style={{
                    padding: '28px 14px', textAlign: 'center', fontSize: 12,
                    color: 'var(--text-muted)', lineHeight: 1.6, fontStyle: 'italic',
                  }}>
                    {search ? 'No matches' : (
                      <>
                        Nothing here yet.
                        <br />
                        <button
                          onClick={() => importInto(cat.value)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: cat.color, fontSize: 12, fontStyle: 'normal' }}
                        >
                          Import {cat.label.toLowerCase()}
                        </button>
                      </>
                    )}
                  </div>
                ) : catEntries.map(e => (
                  <LibraryRow
                    key={e.id}
                    entry={e}
                    boards={boards}
                    onEdit={() => setEditing(e)}
                    onDelete={() => remove(e.id)}
                    onAddedToBoard={onBoardsChanged}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <SoundEditModal
          title="Edit sound"
          initial={{ name: editing.name, category: editing.category, hotkey: editing.hotkey ?? '', volume: editing.volume ?? 1, loop: editing.loop }}
          fileLabel={editing.file_path}
          onSave={v => saveEdit(editing.id, v)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ── Library picker ─────────────────────────────────────────────────────────────
// How sounds get onto a board: pick any number of library entries at once.

function LibraryPickerModal({ entries, existingPaths, onAdd, onClose }: {
  entries: SoundLibraryEntry[]
  existingPaths: Set<string>
  onAdd: (picked: SoundLibraryEntry[]) => Promise<void>
  onClose: () => void
}) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving]     = useState(false)

  const filtered = entries.filter(e => matches(search, e.name, basename(e.file_path)))

  const toggle = (id: number) => setSelected(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const confirm = async () => {
    if (selected.size === 0 || saving) return
    setSaving(true)
    await onAdd(entries.filter(e => selected.has(e.id)))
    onClose()
  }

  return (
    <Modal title="Add sounds from library" onClose={onClose} style={{ width: 520 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          className="input"
          style={{ width: '100%', fontSize: 13 }}
          placeholder="Search the library…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />

        <div style={{
          maxHeight: 340, overflow: 'auto',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {entries.length === 0 ? 'Your library is empty — import sounds first.' : 'No matches'}
            </div>
          ) : filtered.map(e => {
            const color   = categoryColor(e.category)
            const checked = selected.has(e.id)
            const already = existingPaths.has(e.file_path)
            return (
              <div
                key={e.id}
                onClick={() => toggle(e.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  padding: '6px 10px', borderBottom: '1px solid var(--border)',
                  background: checked ? `${ACCENT}12` : 'transparent',
                }}
                className={checked ? '' : 'hover-bg'}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1px solid ${checked ? ACCENT : 'var(--border-light)'}`,
                  background: checked ? ACCENT : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <Check size={10} color="#fff" />}
                </span>
                <span style={{
                  flex: 1, fontSize: 12, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {e.name}
                </span>
                {already && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }} title="Already on this board">
                    on board
                  </span>
                )}
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 99, flexShrink: 0,
                  border: `1px solid ${color}50`, background: `${color}15`, color,
                }}>
                  {categoryLabel(e.category)}
                </span>
                <div onClick={ev => ev.stopPropagation()} style={{ display: 'flex' }}>
                  <PreviewButton filePath={e.file_path} loop={!!e.loop} volume={e.volume ?? 1} color={color} size={20} />
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
            {selected.size > 0 ? `${selected.size} selected` : 'Select one or more sounds'}
          </span>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm} disabled={selected.size === 0 || saving}>
            <Plus size={13} /> Add{selected.size > 0 ? ` ${selected.size}` : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Board sound row ────────────────────────────────────────────────────────────

function SoundRow({ sound, onEdit, onDelete }: {
  sound: Sound
  onEdit: () => void
  onDelete: () => void
}) {
  const { confirming, trigger } = useConfirmDelete()
  const showMenu = useContextMenu()
  const color = categoryColor(sound.category)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr 90px 1fr 72px auto',
      gap: 8, padding: '7px 12px', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
      transition: 'background 120ms ease',
    }}
      className="hover-bg"
      onContextMenu={e => showMenu(e, buildSoundMenu(sound, {
        edit: onEdit,
        onDelete,
        deleteLabel: `Remove “${truncate(sound.name)}” from this board`,
      }))}
    >
      <PreviewButton filePath={sound.file_path} loop={!!sound.loop} volume={sound.volume ?? 1} color={color} />

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

function BoardPanel({ board, library, onSoundsChanged }: {
  board: SoundBoard
  library: SoundLibraryEntry[]
  onSoundsChanged: () => void
}) {
  const { sessions, drafts, updateSession, updateSoundBoard, deleteSoundBoard, bumpSoundsVersion } = useStore()
  const [sounds, setSounds]           = useState<Sound[]>([])
  const [editingName, setEditingName] = useState(false)
  const [name, setName]               = useState(board.name)
  const [picking, setPicking]         = useState(false)
  const [editingSound, setEditingSound] = useState<Sound | null>(null)
  const [search, setSearch]           = useState('')
  const [linkOpen, setLinkOpen]       = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const linkAnchorRef = useRef<HTMLButtonElement>(null)
  const { confirming, trigger }       = useConfirmDelete()

  // Drafts can be linked too — they run like any other session.
  const allSessions = useMemo(() => [...sessions, ...drafts], [sessions, drafts])
  const sessionLabel = (s: Session) =>
    s.is_draft ? s.name : `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`
  const filteredSessions = allSessions.filter(s => matches(sessionSearch, sessionLabel(s)))
  const linkedSessions   = allSessions.filter(s => s.soundboard_id === board.id)

  const toggleSessionLink = async (session: Session) => {
    const next = session.soundboard_id === board.id ? null : board.id
    // Route through the store so a currently-open session's widget updates instantly
    await updateSession(session.id, { soundboard_id: next })
  }

  useEffect(() => {
    window.api.getSounds(board.id).then(setSounds)
  }, [board.id])

  useEffect(() => {
    setName(board.name)
  }, [board.id, board.name])

  const saveName = useCallback(async () => {
    if (!name.trim() || name.trim() === board.name) { setEditingName(false); return }
    await updateSoundBoard(board.id, { name: name.trim() })
    setEditingName(false)
  }, [board.id, board.name, name, updateSoundBoard])

  const addFromLibrary = async (picked: SoundLibraryEntry[]) => {
    const created: Sound[] = []
    for (const e of picked) {
      created.push(await window.api.createSound({
        board_id: board.id, name: e.name, category: e.category,
        file_path: e.file_path, hotkey: e.hotkey ?? '', volume: e.volume ?? 1, loop: e.loop,
      }))
    }
    setSounds(prev => [...prev, ...created])
    onSoundsChanged()
    bumpSoundsVersion()
  }

  const saveSoundEdit = async (id: number, v: SoundFields) => {
    const updated = await window.api.updateSound(id, v)
    setSounds(prev => prev.map(s => s.id === id ? updated : s))
    bumpSoundsVersion()
  }

  const handleSoundDelete = async (id: number) => {
    await window.api.deleteSound(id)
    setSounds(prev => prev.filter(s => s.id !== id))
    onSoundsChanged()
    bumpSoundsVersion()
  }

  const filtered = sounds.filter(s => matches(search, s.name, basename(s.file_path)))

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

        <div style={{ position: 'relative', width: 180 }}>
          <Search size={12} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            className="input"
            style={{ fontSize: 12, width: '100%', paddingLeft: 26 }}
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <button
          onClick={() => setPicking(true)}
          className="btn btn-primary btn-sm"
        >
          <Plus size={13} /> Add Sounds
        </button>

        {/* Session linker */}
        <button
          ref={linkAnchorRef}
          onClick={() => setLinkOpen(v => !v)}
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}
          title="Link sessions — this board auto-loads when you open them"
        >
          <Link2 size={13} color={linkedSessions.length > 0 ? ACCENT : 'currentColor'} />
          {linkedSessions.length > 0 ? `${linkedSessions.length} linked` : 'Link sessions'}
        </button>
        {linkOpen && (
          <DropdownPortal anchor={linkAnchorRef.current} align="right" minWidth={280} onClose={() => setLinkOpen(false)}>
            <div style={{ width: 280, maxHeight: 360, display: 'flex', flexDirection: 'column' }}>
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
                {allSessions.length === 0 ? (
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
                      className="hover-bg"
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: `1px solid ${linkedHere ? ACCENT : 'var(--border-light)'}`,
                        background: linkedHere ? ACCENT : 'transparent',
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
          </DropdownPortal>
        )}

        <button
          onClick={() => trigger(() => deleteSoundBoard(board.id))}
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
        {sounds.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No sounds on this board yet.{' '}
            <button
              onClick={() => setPicking(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 13 }}
            >
              Add some from the library
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            No sounds match “{search}”
          </div>
        ) : filtered.map(s => (
          <SoundRow
            key={s.id}
            sound={s}
            onEdit={() => setEditingSound(s)}
            onDelete={() => handleSoundDelete(s.id)}
          />
        ))}
      </div>

      {picking && (
        <LibraryPickerModal
          entries={library}
          existingPaths={new Set(sounds.map(s => s.file_path))}
          onAdd={addFromLibrary}
          onClose={() => setPicking(false)}
        />
      )}

      {editingSound && (
        <SoundEditModal
          title="Edit sound"
          initial={{
            name: editingSound.name, category: editingSound.category,
            hotkey: editingSound.hotkey ?? '', volume: editingSound.volume ?? 1, loop: editingSound.loop,
          }}
          fileLabel={editingSound.file_path}
          onSave={v => saveSoundEdit(editingSound.id, v)}
          onClose={() => setEditingSound(null)}
        />
      )}
    </div>
  )
}

// ── Board List Item ────────────────────────────────────────────────────────────

function BoardListItem({ board, isActive, count, onClick }: {
  board: SoundBoard
  isActive: boolean
  count?: number
  onClick: () => void
}) {
  const isLibrary = board.id === LIBRARY_BOARD_ID
  return (
    <div
      onClick={onClick}
      style={{
        padding: '7px 10px', borderRadius: 'var(--radius-sm)',
        cursor: isActive ? 'default' : 'pointer',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isActive ? `${ACCENT}40` : 'transparent'}`,
        transition: 'all 120ms ease',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
      className={(!isActive) ? 'hover-bg' : ''}
    >
      {isLibrary
        ? <Library size={11} style={{ color: isActive ? ACCENT : 'var(--text-muted)', flexShrink: 0 }} />
        : <Music2 size={11} style={{ color: isActive ? ACCENT : 'var(--text-muted)', flexShrink: 0 }} />}
      <span style={{
        flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)',
      }}>
        {board.name}
      </span>
      {(count ?? 0) > 0 && (
        <span style={{
          fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-elevated)',
          padding: '1px 5px', borderRadius: 99, border: `1px solid ${isLibrary ? 'var(--border-gold)' : 'var(--border-light)'}`, flexShrink: 0,
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

// ── Soundboard Page ────────────────────────────────────────────────────────────

export default function SoundboardPage() {
  const {
    currentCampaign, setView, setCampaignSubView, setHintContext,
    soundBoards: boards, loadSoundBoards, createSoundBoard,
  } = useStore()
  useEffect(() => { setHintContext('soundboard'); return () => setHintContext(null) }, [setHintContext])

  const [activeBoardId, setActiveBoardId] = useState<number>(LIBRARY_BOARD_ID)
  const [library, setLibrary]             = useState<SoundLibraryEntry[]>([])
  const [creating, setCreating]           = useState(false)
  const [newBoardName, setNewBoardName]   = useState('')

  useEffect(() => {
    window.api.getSoundLibrary().then(setLibrary)
  }, [])

  useEffect(() => {
    if (currentCampaign) loadSoundBoards(currentCampaign.id)
  }, [currentCampaign?.id, loadSoundBoards])

  // A deleted board falls back to the library rather than an empty pane
  useEffect(() => {
    if (activeBoardId !== LIBRARY_BOARD_ID && !boards.some(b => b.id === activeBoardId)) {
      setActiveBoardId(LIBRARY_BOARD_ID)
    }
  }, [boards, activeBoardId])

  const refreshBoards = useCallback(() => {
    if (currentCampaign) loadSoundBoards(currentCampaign.id)
  }, [currentCampaign?.id, loadSoundBoards])

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return
    const b = await createSoundBoard(newBoardName.trim())
    if (b) setActiveBoardId(b.id)
    setNewBoardName('')
    setCreating(false)
  }

  if (!currentCampaign) return null

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? null

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
          className="hover-text"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <Music2 size={13} color={ACCENT} />
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

            {/* The shelf everything comes from — always first */}
            <BoardListItem
              board={LIBRARY_BOARD}
              isActive={activeBoardId === LIBRARY_BOARD_ID}
              count={library.length}
              onClick={() => setActiveBoardId(LIBRARY_BOARD_ID)}
            />

            <div style={{
              margin: '10px 2px 6px', fontSize: 9, letterSpacing: '1.4px',
              textTransform: 'uppercase', color: 'var(--text-muted)',
            }}>
              Soundboards
            </div>

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

            {boards.length === 0 && !creating ? (
              <div style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
                No boards yet.
                <br />
                <button
                  onClick={() => setCreating(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 12, marginTop: 4 }}
                >
                  Create your first board
                </button>
              </div>
            ) : (
              boards.map(b => (
                <BoardListItem
                  key={b.id}
                  board={b}
                  isActive={activeBoardId === b.id}
                  count={b.sound_count}
                  onClick={() => setActiveBoardId(b.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Board panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeBoard ? (
            <BoardPanel
              key={activeBoard.id}
              board={activeBoard}
              library={library}
              onSoundsChanged={refreshBoards}
            />
          ) : (
            <SoundLibraryPanel
              boards={boards}
              entries={library}
              setEntries={setLibrary}
              onBoardsChanged={refreshBoards}
            />
          )}
        </div>
      </div>
    </div>
  )
}
