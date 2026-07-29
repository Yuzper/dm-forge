// path: src/components/map/ShapePopup.tsx
// A region's view-mode popup — the shared feature popup with a square swatch,
// so clicking a kingdom border behaves exactly like clicking its capital.
import type { MapShape } from '../../types'
import { extractDescription, type HubLink } from '../../utils/hubLinks'
import MapFeaturePopup from './MapFeaturePopup'

export default function ShapePopup({
  shape, links, editMode, onClose, onEdit, onNavigateWiki, onNavigateSession,
}: {
  shape: MapShape
  links: HubLink[]
  editMode: boolean
  onClose: () => void
  onEdit: () => void
  onNavigateWiki: (title: string) => void
  onNavigateSession: (sessionId: number) => void
}) {
  return (
    <MapFeaturePopup
      title={shape.label || 'Untitled shape'}
      swatch={<div style={{
        width: 9, height: 9, borderRadius: 2, flexShrink: 0,
        background: shape.fill_color, border: `1px solid ${shape.stroke_color}`,
      }} />}
      description={extractDescription(shape.content)}
      links={links}
      editMode={editMode}
      onClose={onClose}
      onEdit={onEdit}
      onNavigateWiki={onNavigateWiki}
      onNavigateSession={onNavigateSession}
    />
  )
}
