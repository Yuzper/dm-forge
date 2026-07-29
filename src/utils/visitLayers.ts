// path: src/utils/visitLayers.ts
import type { MapLayer } from '../types'

// Derived display name for a visit layer: its custom name, else the sessions
// that ran it ("Sessions 13, 14"), else a fresh-visit placeholder.
export function layerLabel(l: MapLayer): string {
  if (l.name) return l.name
  const parts = (l.sessions ?? []).map(s => s.is_draft ? s.name : `${s.session_number}${s.session_sub}`)
  if (parts.length === 0) return 'Unused visit'
  return `Session${parts.length > 1 ? 's' : ''} ${parts.join(', ')}`
}

// ── Remembered visibility ─────────────────────────────────────────────────────
// Which visits you had showing on a map. Composing a view — "the place's own
// pins plus what we found last time" — is a deliberate act, so it survives
// switching map tabs, leaving the session and restarting the app.
//
// Scoped, not global: the same article map attached to two sessions is two
// different working views. `sessionScope(id)` for a session tab, ARTICLE_SCOPE
// for the map on the article itself.

export interface VisitView {
  showBaseLayer: boolean
  ghostLayerIds: number[]
}

export const ARTICLE_SCOPE = 'article'
export const sessionScope = (sessionId: number | undefined) => `session-${sessionId ?? 'none'}`

const EMPTY: VisitView = { showBaseLayer: false, ghostLayerIds: [] }
const key = (scope: string, mapId: number) => `map-visits-${scope}-${mapId}`

export function loadVisitView(scope: string, mapId: number): VisitView {
  try {
    const raw = localStorage.getItem(key(scope, mapId))
    if (!raw) return EMPTY
    const v = JSON.parse(raw)
    return {
      showBaseLayer: !!v.base,
      // Layers deleted since are simply ids that match nothing — harmless.
      ghostLayerIds: Array.isArray(v.ghosts) ? v.ghosts.filter((n: unknown) => typeof n === 'number') : [],
    }
  } catch {
    return EMPTY
  }
}

export function saveVisitView(scope: string, mapId: number, view: VisitView): void {
  localStorage.setItem(key(scope, mapId), JSON.stringify({
    base: view.showBaseLayer,
    ghosts: view.ghostLayerIds,
  }))
}
