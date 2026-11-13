// path: src/components/settings/KeyboardTab.tsx
// Settings > Keyboard: see and change the app's shortcuts.
//
// Press a row's chord to record a new one. While recording, the keyboard belongs
// to this tab: a capture-phase listener stops the key reaching every other
// handler, so pressing Ctrl+K to assign it does not also open the search.
import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Group, LinkButton, SettingsButton } from './settingsShared'
import {
  BINDING_ORDER, BINDING_META, FIXED_SHORTCUTS, keybindings, eventToChord, checkChord,
  setChord, resetChord, resetAllChords, isDefaultChord, formatChord,
} from '../../utils/keybindings'
import type { BindingId } from '../../utils/keybindings'

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

export default function KeyboardTab() {
  const { chords } = keybindings.use()
  const [recording, setRecording] = useState<BindingId | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const anyChanged = BINDING_ORDER.some(id => !isDefaultChord(id))

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      // Nothing recorded here may leak to the app's own handlers.
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); setMessage(null); return }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      const chord = eventToChord(e)
      if (!chord) { setMessage(`Hold ${isMac ? 'Cmd' : 'Ctrl'} and press a key. Alt is not used.`); return }
      const verdict = checkChord(recording, chord)
      if (!verdict.ok) { setMessage(verdict.reason); return }
      setChord(recording, chord)
      setRecording(null)
      setMessage(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  return (
    <div>
      <Group title="Shortcuts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {BINDING_ORDER.map(id => {
            const meta = BINDING_META[id]
            const active = recording === id
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 2px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{meta.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{meta.hint}</div>
                </div>
                <button
                  onClick={() => { setRecording(active ? null : id); setMessage(null) }}
                  title={active ? 'Press the new keys, or Esc to cancel' : 'Click, then press the keys you want'}
                  style={{
                    minWidth: 132, padding: '5px 10px', cursor: 'pointer', textAlign: 'center',
                    fontFamily: 'var(--font-ui)', fontSize: 11.5, borderRadius: 'var(--radius-sm)',
                    background: active ? 'var(--gold-glow)' : 'var(--bg-surface)',
                    color: active ? 'var(--gold)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border)'}`,
                  }}
                >
                  {active ? 'Press keys…' : formatChord(chords[id])}
                </button>
                <span style={{ width: 44, textAlign: 'right' }}>
                  {!isDefaultChord(id) && (
                    <LinkButton onClick={() => { resetChord(id); if (recording === id) setRecording(null); setMessage(null) }}>
                      Reset
                    </LinkButton>
                  )}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{
          minHeight: 18, marginTop: 8, fontSize: 11, lineHeight: 1.45,
          color: message ? 'var(--warning)' : 'var(--text-muted)',
        }}>
          {message ?? (recording
            ? `Press the new keys. They must include ${isMac ? 'Cmd' : 'Ctrl'}. Esc cancels.`
            : `${isMac ? 'Cmd' : 'Ctrl'} is always part of a shortcut, so typing is never affected.`)}
        </div>

        {/* Always visible, greyed out while everything is already at its default. */}
        <div style={{ marginTop: 6 }}>
          <SettingsButton
            onClick={() => { resetAllChords(); setRecording(null); setMessage(null) }}
            disabled={!anyChanged}
            title={anyChanged ? 'Put every shortcut back to its original keys' : 'Every shortcut is already at its default'}
          >
            <RotateCcw size={13} />
            Default keybinds
          </SettingsButton>
        </div>
      </Group>

      <Group title="Fixed">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 12 }}>
          {FIXED_SHORTCUTS.map(f => (
            <span key={f.keys} style={{ display: 'contents' }}>
              <kbd style={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, padding: '1px 6px',
                border: '1px solid var(--border)', borderRadius: 3, background: 'var(--bg-surface)',
                color: 'var(--text-secondary)', justifySelf: 'start',
              }}>{f.keys}</kbd>
              <span style={{ color: 'var(--text-secondary)' }}>{f.what}</span>
            </span>
          ))}
        </div>
      </Group>
    </div>
  )
}
