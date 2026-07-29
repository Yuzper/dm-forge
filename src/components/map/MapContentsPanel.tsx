// path: src/components/map/MapContentsPanel.tsx
// One panel for everything a map holds, replacing the separate pin list, visit
// dropdown and drawing-layer panel. Three sections, one toggle:
//
//   Points  — the pins currently drawn on the map: filter, hover to highlight,
//             click to focus. Hosts pass only the visible ones, so hiding a
//             visit removes its pins from the list as well as from the canvas.
//   Visits  — session visit layers (pins made on a night); each toggles as a ghost.
//   Layers  — hand-drawn regions; each toggles its shapes on and off.
//
// Visits and Layers are deliberately separate systems: a visit layer is created
// for you when a session runs this map, a drawing layer is one you make. They
// stay orthogonal in the data (pois.layer_id vs map_shapes.layer_id) and simply
// sit next to each other here.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, History, Layers, List, Lock, Pencil, Plus, Trash2, Unlock, X } from 'lucide-react'
import type { MapLayer, MapShape, MapShapeLayer, POI } from '../../types'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import { layerLabel } from '../../utils/visitLayers'
import { poiColor } from './MapPOIMarker'

/** The visit-layer section. Omitted on maps that no session has ever run. */
export interface VisitsSection {
  layers: MapLayer[]
  ghostLayerIds: number[]
  onToggleGhost: (id: number) => void
  /** The layer being written to tonight — shown pinned on, not toggleable. */
  currentLayerId?: number | null
  /** The place's own pins, hidden by default while a session is running. */
  base?: { label: string; shown: boolean; onToggle: () => void }
  /** Article maps let you name a visit; a session in progress does not. */
  onRename?: (id: number, name: string) => void
}

const PANEL_BG = 'rgba(0,0,0,0.62)'
const HAIRLINE = '1px solid rgba(255,255,255,0.1)'

const rowBtn: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
  transition: 'background var(--transition)',
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0,
  color: 'rgba(255,255,255,0.3)',
}

const emptyNote: React.CSSProperties = {
  padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)',
  fontStyle: 'italic', lineHeight: 1.5,
}

// ── Section shell ─────────────────────────────────────────────────────────────

// Collapse state is remembered across maps and sessions: which sections you
// care about is a working preference, not a property of one map.
const openKey = (section: string) => `map-contents-open-${section}`

function Section({ storageKey, icon, title, count, action, children, defaultOpen = true }: {
  storageKey: 'points' | 'visits' | 'layers'
  icon: ReactNode
  title: string
  count: number
  action?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(openKey(storageKey))
    return stored === null ? defaultOpen : stored === 'true'
  })
  const toggle = () => setOpen(v => {
    localStorage.setItem(openKey(storageKey), String(!v))
    return !v
  })

  return (
    <div style={{ borderBottom: HAIRLINE }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 6px' }}>
        <button onClick={toggle}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          {open
            ? <ChevronDown size={11} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
            : <ChevronRight size={11} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />}
          {icon}
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
            {title}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{count}</span>
        </button>
        {action}
      </div>
      {open && <div style={{ maxHeight: 210, overflowY: 'auto', paddingBottom: 4 }}>{children}</div>}
    </div>
  )
}

// ── Points ────────────────────────────────────────────────────────────────────

function PointsSection({ pois, title, selectedId, hoveredId, filter, onFilterChange, onHover, onFocus }: {
  pois: POI[]
  title: string
  selectedId?: number | null
  hoveredId?: number | null
  filter: string
  onFilterChange: (v: string) => void
  onHover: (id: number | null) => void
  onFocus: (poi: POI) => void
}) {
  const visible = [...pois]
    .filter(p => p.label.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <Section storageKey="points" icon={<List size={12} style={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0 }} />} title={title} count={pois.length}>
      {/* The filter only earns its space once the list is long enough. */}
      {pois.length > 6 && (
        <div style={{ padding: '2px 8px 6px' }}>
          <input
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
            placeholder="Filter…"
            style={{
              width: '100%', height: 24, fontSize: 11, padding: '0 8px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4, color: '#fff', outline: 'none',
            }}
          />
        </div>
      )}
      {visible.length === 0 ? (
        <div style={emptyNote}>{pois.length === 0 ? 'Nothing on this map yet' : 'No matches'}</div>
      ) : visible.map(poi => (
        <button
          key={poi.id}
          onMouseEnter={() => onHover(poi.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onFocus(poi)}
          style={{
            ...rowBtn,
            background: hoveredId === poi.id ? 'rgba(255,255,255,0.09)'
              : selectedId === poi.id ? 'rgba(200,115,58,0.16)' : 'none',
          }}
        >
          {/* Same colour rule as the marker, so list and map agree. */}
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: poiColor(poi), border: '1px solid rgba(0,0,0,0.4)',
          }} />
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {poi.label}
          </span>
        </button>
      ))}
    </Section>
  )
}

// ── Visits ────────────────────────────────────────────────────────────────────

function VisitRow({ layer, on, onToggle, onRename }: {
  layer: MapLayer
  on: boolean
  onToggle: () => void
  onRename?: (id: number, name: string) => void
}) {
  const [renaming, setRenaming] = useState(false)

  // The rename field replaces the row rather than nesting inside its button —
  // an input inside a <button> is invalid and swallows clicks unpredictably.
  if (renaming && onRename) {
    return (
      <div style={{ ...rowBtn, cursor: 'default' }}>
        <Pencil size={12} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.4)' }} />
        <input
          autoFocus
          defaultValue={layer.name}
          placeholder={layerLabel({ ...layer, name: '' })}
          onBlur={e => { onRename(layer.id, e.target.value); setRenaming(false) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { onRename(layer.id, (e.target as HTMLInputElement).value); setRenaming(false) }
            if (e.key === 'Escape') setRenaming(false)
          }}
          style={{
            flex: 1, minWidth: 0, height: 20, fontSize: 11, padding: '0 5px',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 3, color: '#fff', outline: 'none',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <button
        onClick={onToggle}
        title={on ? 'Hide this visit' : 'Show this visit (ghosted)'}
        style={{ ...rowBtn, flex: 1, minWidth: 0 }}
      >
        {on
          ? <Eye size={12} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.75)' }} />
          : <EyeOff size={12} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.28)' }} />}
        <span style={{ flex: 1, fontSize: 12, color: on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {layerLabel(layer)}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{layer.poi_count ?? 0}</span>
      </button>
      {onRename && (
        <button onClick={() => setRenaming(true)} title="Rename visit"
          style={{ ...iconBtn, padding: '5px 10px 5px 6px' }}>
          <Pencil size={11} />
        </button>
      )}
    </div>
  )
}

function VisitsSectionView({ visits }: { visits: VisitsSection }) {
  const others = visits.layers.filter(l => l.id !== visits.currentLayerId)
  const current = visits.currentLayerId != null
    ? visits.layers.find(l => l.id === visits.currentLayerId)
    : undefined

  return (
    <Section
      storageKey="visits"
      icon={<History size={12} style={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0 }} />}
      title="Visits"
      count={visits.layers.length}
    >
      {visits.base && (
        <button
          onClick={visits.base.onToggle}
          title={visits.base.shown ? "Hide the place's pins" : "Show the place's pins"}
          style={{ ...rowBtn }}
        >
          {visits.base.shown
            ? <Eye size={12} style={{ flexShrink: 0, color: 'var(--gold-dim)' }} />
            : <EyeOff size={12} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.28)' }} />}
          <span style={{ flex: 1, fontSize: 12, color: visits.base.shown ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}>
            {visits.base.label}
          </span>
        </button>
      )}

      {current && (
        <div style={{ ...rowBtn, cursor: 'default' }}>
          <Eye size={12} style={{ flexShrink: 0, color: 'var(--gold)' }} />
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {layerLabel(current)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--gold-dim)', flexShrink: 0 }}>current</span>
        </div>
      )}

      {others.length === 0
        ? <div style={emptyNote}>{current ? 'No other visits yet' : 'No session has run this map yet'}</div>
        : others.map(l => (
            <VisitRow
              key={l.id}
              layer={l}
              on={visits.ghostLayerIds.includes(l.id)}
              onToggle={() => visits.onToggleGhost(l.id)}
              onRename={visits.onRename}
            />
          ))}
    </Section>
  )
}

// ── Drawing layers ────────────────────────────────────────────────────────────

// Deleting a layer takes its shapes with it (DB cascade), so the count is worth
// spelling out on the confirm step.
function DeleteLayerButton({ layer, count, onDelete }: {
  layer: MapShapeLayer; count: number; onDelete: (l: MapShapeLayer) => void
}) {
  const { confirming, trigger } = useConfirmDelete()
  return (
    <button
      onClick={() => trigger(() => onDelete(layer))}
      title={confirming
        ? `Confirm — also deletes ${count} shape${count === 1 ? '' : 's'}`
        : 'Delete layer'}
      style={{ ...iconBtn, color: confirming ? 'var(--danger-hover)' : 'rgba(255,255,255,0.3)' }}
    >
      <Trash2 size={11} />
    </button>
  )
}

function ShapeRow({ shape, indent, onSelect }: {
  shape: MapShape; indent: boolean; onSelect: (s: MapShape) => void
}) {
  return (
    <button onClick={() => onSelect(shape)}
      style={{ ...rowBtn, padding: indent ? '3px 10px 3px 26px' : '4px 10px' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: shape.fill_color, border: `1px solid ${shape.stroke_color}`, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shape.label || <em style={{ color: 'rgba(255,255,255,0.35)' }}>Untitled</em>}
      </span>
    </button>
  )
}

function DrawingLayersSection({
  layers, shapes, activeLayerId, editable,
  onSetActive, onToggleVisible, onToggleLocked, onRename, onDelete, onCreate, onSelectShape,
}: {
  layers: MapShapeLayer[]
  shapes: MapShape[]
  activeLayerId: number | null
  editable: boolean
  onSetActive: (id: number | null) => void
  onToggleVisible: (layer: MapShapeLayer) => void
  onToggleLocked: (layer: MapShapeLayer) => void
  onRename: (layer: MapShapeLayer, name: string) => void
  onDelete: (layer: MapShapeLayer) => void
  onCreate: () => void
  onSelectShape: (shape: MapShape) => void
}) {
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const unfiled = shapes.filter(s => s.layer_id == null)

  return (
    <Section
      storageKey="layers"
      icon={<Layers size={12} style={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0 }} />}
      title="Layers"
      count={layers.length}
      action={editable ? (
        <button onClick={onCreate} title="New drawing layer"
          style={{ ...iconBtn, color: 'rgba(255,255,255,0.5)', padding: 2 }}>
          <Plus size={13} />
        </button>
      ) : undefined}
    >
      {layers.length === 0 && unfiled.length === 0 && (
        <div style={emptyNote}>
          {editable
            ? 'No drawing layers yet. Add one, then draw kingdom borders or districts onto it.'
            : 'No drawing layers on this map'}
        </div>
      )}

      {layers.map(layer => {
        const layerShapes = shapes.filter(s => s.layer_id === layer.id)
        const isActive = activeLayerId === layer.id
        const expanded = expandedId === layer.id
        return (
          <div key={layer.id}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
              background: isActive ? 'rgba(200,115,58,0.16)' : 'transparent',
              borderLeft: `2px solid ${isActive ? '#c8733a' : 'transparent'}`,
            }}>
              <button
                onClick={() => onToggleVisible(layer)}
                title={layer.visible === 1 ? 'Hide layer' : 'Show layer'}
                style={{ ...iconBtn, color: layer.visible === 1 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)' }}
              >
                {layer.visible === 1 ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>

              {renamingId === layer.id ? (
                <input
                  autoFocus
                  defaultValue={layer.name}
                  onBlur={e => { onRename(layer, e.target.value); setRenamingId(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onRename(layer, (e.target as HTMLInputElement).value); setRenamingId(null) }
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  style={{
                    flex: 1, minWidth: 0, height: 20, fontSize: 11, padding: '0 5px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 3, color: '#fff', outline: 'none',
                  }}
                />
              ) : (
                <button
                  onClick={() => { if (editable) onSetActive(isActive ? null : layer.id); setExpandedId(expanded ? null : layer.id) }}
                  title={editable ? 'Draw onto this layer' : layer.name}
                  style={{
                    flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0,
                    fontSize: 12, fontWeight: isActive ? 600 : 400,
                    color: layer.visible === 1 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {layer.name}
                </button>
              )}

              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{layerShapes.length}</span>

              {editable && (
                <>
                  <button onClick={() => onToggleLocked(layer)} title={layer.locked === 1 ? 'Unlock layer' : 'Lock layer'}
                    style={{ ...iconBtn, color: layer.locked === 1 ? 'var(--gold)' : 'rgba(255,255,255,0.3)' }}>
                    {layer.locked === 1 ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                  <button onClick={() => setRenamingId(layer.id)} title="Rename" style={iconBtn}>
                    <Pencil size={11} />
                  </button>
                  <DeleteLayerButton layer={layer} count={layerShapes.length} onDelete={onDelete} />
                </>
              )}
            </div>

            {/* Shapes on this layer — click to select and focus one */}
            {expanded && layerShapes.length > 0 && (
              <div style={{ paddingBottom: 2 }}>
                {layerShapes.map(s => <ShapeRow key={s.id} shape={s} indent onSelect={onSelectShape} />)}
              </div>
            )}
          </div>
        )
      })}

      {/* Shapes drawn before any layer existed still need a home in the list. */}
      {unfiled.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4, paddingTop: 4 }}>
          <div style={{ padding: '3px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.35)' }}>
            Unfiled · {unfiled.length}
          </div>
          {unfiled.map(s => <ShapeRow key={s.id} shape={s} indent={false} onSelect={onSelectShape} />)}
        </div>
      )}
    </Section>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function MapContentsPanel({
  stacked, floatSide = 'left', onClose,
  pois, pointsTitle = 'Points', selectedPoiId, hoveredPoiId, poiFilter,
  onPoiFilterChange, onPoiHover, onPoiFocus,
  visits,
  layers, shapes, activeLayerId, editable,
  onSetActiveLayer, onToggleLayerVisible, onToggleLayerLocked,
  onRenameLayer, onDeleteLayer, onCreateLayer, onSelectShape,
}: {
  /** Rendered in a panel column (static flow) rather than floating. */
  stacked: boolean
  floatSide?: 'left' | 'right'
  onClose: () => void

  pois: POI[]
  pointsTitle?: string
  selectedPoiId?: number | null
  hoveredPoiId?: number | null
  poiFilter: string
  onPoiFilterChange: (v: string) => void
  onPoiHover: (id: number | null) => void
  onPoiFocus: (poi: POI) => void

  /** Omitted on maps with no visit history (the campaign world map). */
  visits?: VisitsSection | null

  layers: MapShapeLayer[]
  shapes: MapShape[]
  activeLayerId: number | null
  editable: boolean
  onSetActiveLayer: (id: number | null) => void
  onToggleLayerVisible: (layer: MapShapeLayer) => void
  onToggleLayerLocked: (layer: MapShapeLayer) => void
  onRenameLayer: (layer: MapShapeLayer, name: string) => void
  onDeleteLayer: (layer: MapShapeLayer) => void
  onCreateLayer: () => void
  onSelectShape: (shape: MapShape) => void
}) {
  return (
    <div
      // Every section scrolls; the map must not zoom out from under them.
      data-map-overlay
      style={{
        width: 220, display: 'flex', flexDirection: 'column', zIndex: 16,
        background: PANEL_BG, backdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, overflow: 'hidden',
        ...(stacked
          ? { maxHeight: 520 }
          : {
              position: 'absolute', top: 42, maxHeight: 'calc(100% - 84px)',
              ...(floatSide === 'right' ? { right: 10 } : { left: 10 }),
            }),
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: HAIRLINE }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
          Contents
        </span>
        <button onClick={onClose} title="Hide contents"
          style={{ ...iconBtn, color: 'rgba(255,255,255,0.4)', padding: 2 }}>
          <X size={12} />
        </button>
      </div>

      <div style={{ overflowY: 'auto' }}>
        <PointsSection
          pois={pois}
          title={pointsTitle}
          selectedId={selectedPoiId}
          hoveredId={hoveredPoiId}
          filter={poiFilter}
          onFilterChange={onPoiFilterChange}
          onHover={onPoiHover}
          onFocus={onPoiFocus}
        />

        {visits && <VisitsSectionView visits={visits} />}

        <DrawingLayersSection
          layers={layers}
          shapes={shapes}
          activeLayerId={activeLayerId}
          editable={editable}
          onSetActive={onSetActiveLayer}
          onToggleVisible={onToggleLayerVisible}
          onToggleLocked={onToggleLayerLocked}
          onRename={onRenameLayer}
          onDelete={onDeleteLayer}
          onCreate={onCreateLayer}
          onSelectShape={onSelectShape}
        />
      </div>

      {editable && layers.length > 0 && (
        <div style={{ padding: '5px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
          {activeLayerId != null
            ? 'New shapes go on the highlighted layer'
            : 'Pick a layer to draw onto'}
        </div>
      )}
    </div>
  )
}
