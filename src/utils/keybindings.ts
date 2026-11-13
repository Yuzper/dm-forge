// path: src/utils/keybindings.ts
// The keyboard shortcuts the DM can change (Settings > Keyboard).
//
// Every remappable chord is Ctrl (Cmd on a Mac) plus an optional Shift and one
// key. Requiring the modifier keeps them out of the way of typing; Alt is left
// out because Alt+letter produces characters on some keyboard layouts.
//
// Handlers call `matchesBinding(e, id)` at event time. That reads the current
// value, so a rebinding takes effect immediately with no re-subscribing.
import { createPref } from './prefs'

export type BindingId = 'search' | 'find' | 'newTab' | 'closeTab' | 'nextTab' | 'prevTab'

export interface Chord {
  /** Lower-case letter or digit, or an event key name such as "Tab" or "F2". */
  key: string
  shift: boolean
}

export const BINDING_ORDER: BindingId[] = ['search', 'find', 'newTab', 'closeTab', 'nextTab', 'prevTab']

export const BINDING_META: Record<BindingId, { label: string; hint: string; fallback: Chord }> = {
  search:   { label: 'Search the campaign', hint: 'Articles, sessions, DM notes and map pins', fallback: { key: 'k', shift: false } },
  find:     { label: 'Find in page',        hint: 'Highlight a word in the open page',          fallback: { key: 'f', shift: false } },
  newTab:   { label: 'New tab',             hint: 'Opens the campaign hub in a new tab',        fallback: { key: 't', shift: false } },
  closeTab: { label: 'Close tab',           hint: 'Closes the current tab',                     fallback: { key: 'w', shift: false } },
  nextTab:  { label: 'Next tab',            hint: 'Works even while typing in an editor',       fallback: { key: 'Tab', shift: false } },
  prevTab:  { label: 'Previous tab',        hint: 'Works even while typing in an editor',       fallback: { key: 'Tab', shift: true } },
}

/** Shown in the tab but not changeable. */
export const FIXED_SHORTCUTS: { keys: string; what: string }[] = [
  { keys: 'Ctrl+1 … 8', what: 'Jump to that tab' },
  { keys: 'Ctrl+9', what: 'Jump to the last tab' },
  { keys: 'Esc', what: 'Close a panel, menu or search' },
]

// Chords the editor or the app menu already owns. Letting one be rebound would
// either do nothing (the menu wins) or break typing.
const RESERVED: Chord[] = [
  ...['c', 'v', 'x', 'a', 'z', 'y', 'r', 'b', 'i', 'u', '0', '=', '-', '+']
    .map(key => ({ key, shift: false })),
  ...['z', 'r', 'i', 'l', 'c', 'v'].map(key => ({ key, shift: true })),
]

const sameChord = (a: Chord, b: Chord) => a.key === b.key && a.shift === b.shift

function cleanChord(v: unknown, fallback: Chord): Chord {
  const c = v as Partial<Chord> | null
  if (c && typeof c.key === 'string' && c.key.length > 0 && c.key.length <= 12) {
    return { key: c.key, shift: !!c.shift }
  }
  return fallback
}

export interface Bindings { chords: Record<BindingId, Chord> }

export const keybindings = createPref<Bindings>('dmforge:keybindings', raw => {
  const stored = (raw.chords ?? {}) as Partial<Record<BindingId, unknown>>
  const chords = {} as Record<BindingId, Chord>
  for (const id of BINDING_ORDER) chords[id] = cleanChord(stored[id], BINDING_META[id].fallback)
  return { chords }
})

export const chordFor = (id: BindingId): Chord => keybindings.get().chords[id]

/** The chord a key event represents, or null if it is not a Ctrl/Cmd chord. */
export function eventToChord(e: KeyboardEvent): Chord | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return null
  // Letters and digits come from the physical key: with Shift held, e.key is
  // "K" or "!" and would never equal what was stored.
  const code = e.code
  let key: string
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3).toLowerCase()
  else if (/^Digit\d$/.test(code)) key = code.slice(5)
  else key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  return { key, shift: e.shiftKey }
}

export function matchesBinding(e: KeyboardEvent, id: BindingId): boolean {
  const got = eventToChord(e)
  return !!got && sameChord(got, chordFor(id))
}

export function formatChord(c: Chord): string {
  const key = c.key.length === 1 ? c.key.toUpperCase() : c.key
  return ['Ctrl', c.shift ? 'Shift' : null, key].filter(Boolean).join('+')
}

export type ChordCheck = { ok: true } | { ok: false; reason: string }

/** Whether `chord` may be assigned to `id`. */
export function checkChord(id: BindingId, chord: Chord): ChordCheck {
  if (/^\d$/.test(chord.key)) return { ok: false, reason: 'Ctrl+digit jumps between tabs and cannot be reassigned.' }
  if (chord.key === 'Escape') return { ok: false, reason: 'Esc is used to close panels.' }
  if (RESERVED.some(r => sameChord(r, chord))) {
    return { ok: false, reason: `${formatChord(chord)} is already used for editing or by the app menu.` }
  }
  const chords = keybindings.get().chords
  for (const other of BINDING_ORDER) {
    if (other !== id && sameChord(chords[other], chord)) {
      return { ok: false, reason: `${formatChord(chord)} is already “${BINDING_META[other].label}”.` }
    }
  }
  return { ok: true }
}

export function setChord(id: BindingId, chord: Chord) {
  keybindings.set({ chords: { ...keybindings.get().chords, [id]: chord } })
}

export function resetChord(id: BindingId) {
  setChord(id, BINDING_META[id].fallback)
}

export const resetAllChords = () => keybindings.reset()

export const isDefaultChord = (id: BindingId) => sameChord(chordFor(id), BINDING_META[id].fallback)
