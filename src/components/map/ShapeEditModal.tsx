// path: src/components/map/ShapeEditModal.tsx
// Edit a drawing shape. Name, description, links and the footer come from the
// shared feature editor; this file owns only what a region has and a pin
// doesn't — fill, outline, line style, label visibility and its layer.
import { useState } from 'react'
import type { MapShape, MapShapeLayer, Session } from '../../types'
import { extractDescription, makeDescriptionDoc, type HubLink } from '../../utils/hubLinks'
import SwatchPicker from '../SwatchPicker'
import MapFeatureEditModal from './MapFeatureEditModal'

export interface ShapeEditResult {
  label: string
  content: string
  hub_links: string
  fill_color: string
  fill_opacity: number
  stroke_color: string
  stroke_width: number
  stroke_style: 'solid' | 'dashed'
  show_label: number
  layer_id: number | null
}

const sliderLabel: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', width: 58, flexShrink: 0 }
const sliderValue: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }
const sliderRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

export default function ShapeEditModal({
  shape, links, layers, sessions, articles, onSave, onDelete, onClose,
}: {
  shape: MapShape
  links: HubLink[]
  layers: MapShapeLayer[]
  sessions: Session[]
  articles: { id: number; title: string }[]
  onSave: (result: ShapeEditResult) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [fillColor, setFillColor] = useState(shape.fill_color)
  const [fillOpacity, setFillOpacity] = useState(Math.round(shape.fill_opacity * 100))
  const [strokeColor, setStrokeColor] = useState(shape.stroke_color)
  const [strokeWidth, setStrokeWidth] = useState(shape.stroke_width)
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed'>(shape.stroke_style)
  const [showLabel, setShowLabel] = useState(shape.show_label === 1)
  const [layerId, setLayerId] = useState<number | null>(shape.layer_id)

  return (
    <MapFeatureEditModal
      title="Edit shape"
      initialName={shape.label}
      namePlaceholder="Kingdom of Aventar"
      initialDescription={extractDescription(shape.content)}
      descriptionPlaceholder="The old dwarven holdings, claimed since the Sundering…"
      initialLinks={links}
      sessions={sessions}
      articles={articles}
      onClose={onClose}
      onDelete={onDelete}
      onSave={({ name, description, links: edited }) => onSave({
        label: name,
        content: makeDescriptionDoc(description),
        hub_links: JSON.stringify(edited),
        fill_color: fillColor,
        fill_opacity: fillOpacity / 100,
        stroke_color: strokeColor,
        stroke_width: strokeWidth,
        stroke_style: strokeStyle,
        show_label: showLabel ? 1 : 0,
        layer_id: layerId,
      })}
      appearance={
        <>
          <div className="input-group">
            <label className="input-label">Layer</label>
            <select className="input" value={layerId ?? ''}
              onChange={e => setLayerId(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">Unfiled (always visible)</option>
              {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Fill</label>
            <SwatchPicker value={fillColor} onChange={setFillColor} size={20} />
          </div>

          <div className="input-group">
            <label className="input-label">Outline</label>
            <SwatchPicker value={strokeColor} onChange={setStrokeColor} size={20} />
          </div>

          <div className="input-group">
            <label className="input-label">Style</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sliderRow}>
                  <span style={sliderLabel}>Fill</span>
                  <input type="range" min={0} max={100} step={5} value={fillOpacity}
                    onChange={e => setFillOpacity(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={sliderValue}>{fillOpacity}%</span>
                </div>
                <div style={sliderRow}>
                  <span style={sliderLabel}>Outline</span>
                  <input type="range" min={0} max={8} step={0.5} value={strokeWidth}
                    onChange={e => setStrokeWidth(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={sliderValue}>{strokeWidth}px</span>
                </div>
                <div style={sliderRow}>
                  <span style={sliderLabel}>Line</span>
                  {(['solid', 'dashed'] as const).map(s => (
                    <button key={s} onClick={() => setStrokeStyle(s)}
                      style={{
                        flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                        background: strokeStyle === s ? 'var(--bg-active)' : 'transparent',
                        border: `1px solid ${strokeStyle === s ? 'var(--gold)' : 'var(--border)'}`,
                        color: strokeStyle === s ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}>
                      {s === 'solid' ? 'Solid' : 'Dashed'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              <div style={{ width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <svg width={40} height={40} viewBox="0 0 40 40">
                  <polygon points="20,4 36,14 30,34 10,34 4,14"
                    fill={fillColor} fillOpacity={fillOpacity / 100}
                    stroke={strokeColor} strokeWidth={strokeWidth}
                    strokeDasharray={strokeStyle === 'dashed' ? '5 4' : undefined}
                    strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showLabel} onChange={e => setShowLabel(e.target.checked)} />
            Show the name on the map
          </label>
        </>
      }
    />
  )
}
