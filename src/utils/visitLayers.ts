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
