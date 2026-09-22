// path: src/hooks/useLocalPref.ts
// A single remembered view preference — "show the counts", "sort by recent".
// Same shape as useState, but seeded from and written back to localStorage, so
// a view can keep a switch without adding a field to the store (these are
// display choices, not campaign data, and they don't belong in tab state).

import { useState } from 'react'

export function useLocalPref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved !== null) return JSON.parse(saved) as T
    } catch { /* unreadable or malformed → fall back */ }
    return fallback
  })

  const set = (next: T) => {
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* quota / private mode */ }
  }

  return [value, set]
}
