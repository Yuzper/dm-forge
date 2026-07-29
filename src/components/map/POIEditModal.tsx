// path: src/components/map/POIEditModal.tsx
// Edit a world-map pin. Name, description, links and the footer come from the
// shared feature editor; this file owns only what a pin has and a region
// doesn't — colour, diameter and opacity.
import { useState } from 'react'
import type { POI, Session } from '../../types'
import { extractDescription, type HubLink } from '../../utils/hubLinks'
import { getPoiIcon } from '../../constants/POITypes'
import SwatchPicker from '../SwatchPicker'
import MapFeatureEditModal from './MapFeatureEditModal'

// World-map pins carry their own size. The floor is the diameter below which a
// type glyph stops reading, so smaller pins render as plain dots instead. Pins
// created before this (default 11) grow to the floor.
export const DEFAULT_HUB_POI_SIZE = 22
export const MIN_HUB_POI_SIZE = 18

export interface POIEditResult {
  label: string
  description: string
  links: HubLink[]
  color: string
  size: number
  opacity: number
}

const sliderLabel: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', width: 52, flexShrink: 0 }
const sliderValue: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }
const sliderRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

export default function POIEditModal({
  poi, links, sessions, articles, onSave, onDelete, onClose,
}: {
  poi: POI
  links: HubLink[]
  sessions: Session[]
  articles: { id: number; title: string }[]
  onSave: (result: POIEditResult) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [color, setColor] = useState(poi.color || '#c8a84b')
  const [size, setSize] = useState(Math.max(poi.hub_size ?? DEFAULT_HUB_POI_SIZE, MIN_HUB_POI_SIZE))
  const [opacity, setOpacity] = useState(Math.round((poi.hub_opacity ?? 1) * 100))
  const PreviewIcon = getPoiIcon(poi.poi_type)

  return (
    <MapFeatureEditModal
      title="Edit location"
      initialName={poi.label}
      initialDescription={extractDescription(poi.content)}
      descriptionPlaceholder="A fortified dwarven city carved into the mountains…"
      initialLinks={links}
      sessions={sessions}
      articles={articles}
      onClose={onClose}
      onDelete={onDelete}
      onSave={({ name, description, links: edited }) => onSave({
        // A pin always needs a name on the map, so blanking it keeps the old one.
        label: name || poi.label,
        description,
        links: edited,
        color,
        size,
        opacity: opacity / 100,
      })}
      appearance={
        <>
          <div className="input-group">
            <label className="input-label">Color</label>
            <SwatchPicker value={color} onChange={setColor} size={20} />
          </div>

          <div className="input-group">
            <label className="input-label">Marker</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sliderRow}>
                  <span style={sliderLabel}>Size</span>
                  <input type="range" min={MIN_HUB_POI_SIZE} max={44} step={1} value={size}
                    onChange={e => setSize(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={sliderValue}>{size}px</span>
                </div>
                <div style={sliderRow}>
                  <span style={sliderLabel}>Opacity</span>
                  <input type="range" min={10} max={100} step={5} value={opacity}
                    onChange={e => setOpacity(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={sliderValue}>{opacity}%</span>
                </div>
              </div>

              {/* Live preview */}
              <div style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{
                  width: size, height: size, borderRadius: '50%',
                  background: 'hsla(0, 0%, 0%, 0.90)', border: `2px solid ${color}`,
                  opacity: opacity / 100,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <PreviewIcon size={Math.round(size * 0.5)} color={color} strokeWidth={2} />
                </div>
              </div>
            </div>
          </div>
        </>
      }
    />
  )
}
