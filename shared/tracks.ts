// path: shared/tracks.ts
// Single source of truth for track vocabulary, tag derivation and per-track
// visibility defaults.
//
// This lived in three drifted copies before — the wiki UI (wikiConstants), the
// publish pipeline (publishCore) and the starter-creature seeder (store/shared)
// — and two of them had fallen behind: `Age` was excluded from tags in the UI
// but still became a `#317` tag on the published player site. Anything imported
// from here reaches the DM app and the player bundle at the same time, which is
// the point: a redaction rule that only lands on one side is worse than none.
//
// Pure TypeScript, no DOM and no node built-ins, so both the renderer and the
// electron main process can import it.

// ── Vocabulary ────────────────────────────────────────────────────────────────

// Tracks that never become tags. Date tracks hold JSON (e.g. {"day":3,...}) and
// would serialise as garbage; Age is excluded for a plainer reason — it's a bare
// number, and "#317" is noise in the tag cloud.
export const NON_TAG_TRACKS = new Set([
  'In_World_Date', 'Death_Date', 'Timeline_Milestones', 'Age',
])

// Tracks that hold several entries instead of one. Stored as a JSON array of
// strings in the same `tracks[key]` slot; a legacy plain string reads as a
// single-element list (see trackValues).
export const MULTI_TRACKS = new Set(['Allies', 'Rivals', 'Sacred_Sites', 'Domains', 'Faction'])

// Tracks that default to DM-only on the player site. `Status` says whether a
// quest failed, an order disbanded or an artefact was destroyed — knowledge the
// party usually has to earn. The DM can still publish one by setting that track
// to "Everyone" explicitly; this only moves the default.
export const DM_BY_DEFAULT_TRACKS = new Set(['Status'])

// ── Values ────────────────────────────────────────────────────────────────────

// The individual entries of a track value. Plain string → one entry; a JSON
// array (multi-value tracks) → its string members; JSON objects (date pickers,
// milestone lists) → none. Empty/blank → none.
export function trackValues(raw: string | null | undefined): string[] {
  const v = (raw ?? '').trim()
  if (!v) return []
  if (v.startsWith('[')) {
    try {
      const arr = JSON.parse(v)
      if (Array.isArray(arr)) {
        return arr
          .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
          .map(x => x.trim())
      }
    } catch { /* malformed → no entries */ }
    return []
  }
  if (v.startsWith('{')) return []
  return [v]
}

// Serialise a multi-value list back into a track slot: '' when empty, a JSON
// array otherwise. (A single entry still stores as an array so the shape is
// stable for multi-value tracks.)
export function stringifyMulti(list: string[]): string {
  const clean = list.map(s => s.trim()).filter(Boolean)
  return clean.length ? JSON.stringify(clean) : ''
}

// ── Tags ──────────────────────────────────────────────────────────────────────

// A plain enum/text track value becomes a tag; JSON values (date pickers,
// milestone lists) and any *_Date field are skipped so they never leak in.
export function isTaggableTrack(key: string, value: string): boolean {
  if (NON_TAG_TRACKS.has(key)) return false
  if (key.endsWith('_Date')) return false
  const v = value.trim()
  if (!v) return false
  if (v.startsWith('{') || v.startsWith('[')) return false
  return true
}

// Tags derived from a track set. Accepts `unknown` values because the publish
// pipeline feeds it straight off a parsed JSON blob, where a hand-edited DB row
// can hold anything; non-strings are skipped rather than crashing the export.
export function getTrackTags(tracks: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(tracks)) {
    if (typeof v !== 'string') continue
    if (NON_TAG_TRACKS.has(k) || k.endsWith('_Date')) continue
    // Expands multi-value tracks (Allies/Rivals) into one tag per entry.
    for (const val of trackValues(v)) out.push(val.toLowerCase().replace(/\s+/g, '-'))
  }
  return [...new Set(out)]
}

// ── Display ───────────────────────────────────────────────────────────────────

export function formatTrackName(key: string): string {
  if (key === 'Within') return 'Located within'
  return key.replace(/_/g, ' ')
}

// ── Player visibility defaults ────────────────────────────────────────────────

export type TrackVisMode = 'inherit' | 'dm' | 'restricted'

// The mode a track/milestone has when the DM has never touched its eye toggle.
// Milestones always inherit; tracks inherit unless they're a date (dates are
// usually spoilers) or one of DM_BY_DEFAULT_TRACKS.
//
// Both the eye control in the article editor and the publish pipeline call this,
// so what the DM sees on the row is what the exporter actually does.
export function defaultTrackMode(key: string, isMilestone = false): TrackVisMode {
  if (isMilestone) return 'inherit'
  if (key.endsWith('_Date')) return 'dm'
  if (DM_BY_DEFAULT_TRACKS.has(key)) return 'dm'
  return 'inherit'
}
