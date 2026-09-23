// path: src/utils/inWorldDate.ts
// The stored shape of an in-world date and its parser. Lives outside the picker
// component so data code (hooks, the timeline loaders) can read dates without
// importing a React component — the picker itself re-exports both.

export interface InWorldDate {
  day: number   // 1-based day offset from campaign start
  year: number  // e.g. 1507
  label: string // human-readable e.g. "Day 22, Year 1507"
}

export function parseInWorldDate(raw: string): InWorldDate | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.day === 'number') return parsed
  } catch {}
  return null
}
