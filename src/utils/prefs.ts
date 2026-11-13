// path: src/utils/prefs.ts
// A tiny persisted-preference helper for settings that are not part of the
// Appearance record: map defaults, cast defaults, saved templates, key bindings.
//
// Each preference is one localStorage key holding a JSON object. `clean` is the
// single place a value is validated, and it runs on every read and write, so a
// hand-edited or older-build value can never put the app in an impossible state.
// The same object serves React (`use`, via useSyncExternalStore) and plain code
// like an event handler (`get`), which always sees the latest value without
// needing to re-subscribe.
import { useSyncExternalStore } from 'react'

export interface Pref<T> {
  /** The current value. Stable (same object) until something changes. */
  get: () => T
  set: (patch: Partial<T>) => void
  reset: () => void
  subscribe: (listener: () => void) => () => void
  /** Hook form of get. */
  use: () => T
}

export function createPref<T extends object>(key: string, clean: (raw: Partial<T>) => T): Pref<T> {
  let cache: T | null = null
  const listeners = new Set<() => void>()

  const read = (): T => {
    if (cache) return cache
    let raw: Partial<T> = {}
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object') raw = parsed
      }
    } catch { /* unreadable: fall back to defaults */ }
    cache = clean(raw)
    return cache
  }

  const emit = () => listeners.forEach(l => l())
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  return {
    get: read,
    set(patch) {
      cache = clean({ ...read(), ...patch })
      try { localStorage.setItem(key, JSON.stringify(cache)) } catch { /* private mode: lasts this session */ }
      emit()
    },
    reset() {
      cache = null
      try { localStorage.removeItem(key) } catch { /* nothing to do */ }
      emit()
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, read),
  }
}

/** A #rrggbb colour, or the fallback. */
export function cleanHex(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback
}

export function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
