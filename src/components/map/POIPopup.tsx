// path: src/components/map/POIPopup.tsx
// A pin's view-mode popup — the shared feature popup with a round swatch.
import type { POI } from '../../types'
import { extractDescription, type HubLink } from '../../utils/hubLinks'
import { poiColor } from './MapPOIMarker'
import MapFeaturePopup from './MapFeaturePopup'

export default function POIPopup({
  poi, links, editMode, onClose, onEdit, onNavigateWiki, onNavigateSession,
}: {
  poi: POI
  links: HubLink[]
  editMode: boolean
  onClose: () => void
  onEdit: () => void
  onNavigateWiki: (title: string) => void
  onNavigateSession: (sessionId: number) => void
}) {
  return (
    <MapFeaturePopup
      title={poi.label}
      // Same colour rule as the marker and the list, so all three agree.
      swatch={<div style={{ width: 8, height: 8, borderRadius: '50%', background: poiColor(poi), flexShrink: 0 }} />}
      description={extractDescription(poi.content)}
      links={links}
      editMode={editMode}
      onClose={onClose}
      onEdit={onEdit}
      onNavigateWiki={onNavigateWiki}
      onNavigateSession={onNavigateSession}
    />
  )
}
