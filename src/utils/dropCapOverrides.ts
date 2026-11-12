// path: src/utils/dropCapOverrides.ts
// Per-page drop-cap overrides. Settings → Appearance decides where drop caps
// appear (articles, or notes too); any single page can say "always" or "never"
// regardless. Stored on this device, like the rest of Appearance, keyed by a
// page id such as `article:12` or `dmnote:4`.
import { useSyncExternalStore, useCallback } from 'react'

export type DropCapOverride = 'on' | 'off'
/** Where a rich editor sits: wiki article bodies, or any kind of note. */
export type DropCapKind = 'article' | 'note'

const KEY = 'dmforge:dropcap-overrides'
const listeners = new Set<() => void>()
let cache: Record<string, DropCapOverride> | null = null

function read(): Record<string, DropCapOverride> {
  if (cache) return cache
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    cache = raw && typeof raw === 'object' ? raw : {}
  } catch { cache = {} }
  return cache!
}

export function setDropCapOverride(id: string, value: DropCapOverride | null): void {
  const next = { ...read() }
  if (value) next[id] = value
  else delete next[id]
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage full or blocked: keep in memory */ }
  listeners.forEach(l => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The page's own override, if it has one, and a setter (null clears it). */
export function useDropCapOverride(id: string | undefined): [DropCapOverride | undefined, (v: DropCapOverride | null) => void] {
  const value = useSyncExternalStore(subscribe, () => (id ? read()[id] : undefined))
  const set = useCallback((v: DropCapOverride | null) => { if (id) setDropCapOverride(id, v) }, [id])
  return [value, set]
}
