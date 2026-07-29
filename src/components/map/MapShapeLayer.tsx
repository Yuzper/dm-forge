// path: src/components/map/MapShapeLayer.tsx
// SVG overlay that paints a map's drawing shapes. Rendered *inside* the host's
// transformed container and sized to the fitted image box, so it pans and zooms
// with the image for free.
//
// Pointer events are the crux of making this feel right: a kingdom-sized
// polygon must not swallow every click inside its borders. The <svg> itself is
// always pointer-events:none and individual shapes opt in only when the host
// says the current mode wants them (see `interactive`). Panning survives
// regardless, because pan starts on a mousedown that bubbles to the outer
// container and the host's existing hasPanned guard suppresses the stray click.
import { useMemo } from 'react'
import type { MapShape, MapShapeLayer as ShapeLayer, ShapePoint } from '../../types'
import {
  dashArrayFor, ellipseAttrs, polygonPointsAttr, centroidOf, edgeMidpoints,
  paintOrder, isRenderable, toLocalX, toLocalY,
  type PixelBox, type ShapeDraft,
} from '../../utils/mapShapeGeometry'

export interface MapShapeLayerProps {
  shapes: MapShape[]
  layers: ShapeLayer[]
  box: PixelBox
  scale: number
  /** Shapes catch clicks. False in POI-edit, measure and draw modes. */
  interactive: boolean
  selectedId?: number | null
  hoveredId?: number | null
  /** Show vertex + midpoint handles on the selected shape. */
  showHandles?: boolean
  /** Shape being drawn right now, not yet persisted. */
  draft?: ShapeDraft | null
  /** Optimistic geometry during a drag, keyed by shape id. */
  livePoints?: { id: number; points: ShapePoint[] } | null
  /** Shapes on these layers stay visible but never catch a click. */
  lockedLayerIds?: number[]
  onShapeClick?: (shape: MapShape, e: React.MouseEvent) => void
  onShapeHover?: (id: number | null) => void
  onBodyDown?: (shape: MapShape, e: React.MouseEvent) => void
  onVertexDown?: (shape: MapShape, index: number, e: React.MouseEvent) => void
  onVertexContextMenu?: (shape: MapShape, index: number, e: React.MouseEvent) => void
  onMidpointDown?: (shape: MapShape, index: number, e: React.MouseEvent) => void
}

export default function MapShapeLayer({
  shapes, layers, box, scale, interactive,
  selectedId, hoveredId, showHandles, draft, livePoints, lockedLayerIds,
  onShapeClick, onShapeHover, onBodyDown, onVertexDown, onVertexContextMenu, onMidpointDown,
}: MapShapeLayerProps) {
  // Unfiled shapes (layer_id null) are always visible; otherwise the layer's
  // own toggle decides. A shape on a deleted-but-not-yet-refetched layer is
  // treated as hidden rather than orphaned onto the canvas.
  const visibleById = useMemo(() => {
    const m = new Map<number, ShapeLayer>()
    for (const l of layers) m.set(l.id, l)
    return m
  }, [layers])

  const visible = useMemo(() => shapes.filter(s => {
    if (s.layer_id == null) return true
    const layer = visibleById.get(s.layer_id)
    return layer ? layer.visible === 1 : false
  }), [shapes, visibleById])

  const ordered = useMemo(() => paintOrder(visible), [visible])

  if (box.w <= 0 || box.h <= 0) return null

  const selected = ordered.find(r => r.shape.id === selectedId) ?? null
  // The selected shape's live geometry — mid-drag points win over the stored ones.
  const selectedPoints = selected
    ? (livePoints?.id === selected.shape.id ? livePoints.points : selected.points)
    : []

  return (
    <svg
      width={box.w}
      height={box.h}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: box.w, height: box.h,
        overflow: 'visible',
        pointerEvents: 'none',   // individual shapes opt back in below
        zIndex: 4,               // under POI markers (5+), over the image
      }}
    >
      {ordered.map(({ shape, points: stored }) => {
        const points = livePoints?.id === shape.id ? livePoints.points : stored
        if (!isRenderable(shape.shape_type, points)) return null

        // A locked layer's shapes render normally but ignore the pointer, so a
        // finished border set can't be nudged while working on top of it.
        const locked = shape.layer_id != null && !!lockedLayerIds?.includes(shape.layer_id)
        const live = interactive && !locked
        const isSelected = shape.id === selectedId
        const isHovered = shape.id === hoveredId
        // Hover and selection lift the fill so a faint region stays findable.
        const fillOpacity = isSelected ? Math.min(1, shape.fill_opacity + 0.18)
          : isHovered ? Math.min(1, shape.fill_opacity + 0.1)
          : shape.fill_opacity
        const strokeWidth = (shape.stroke_width * (isSelected ? 1.6 : 1)) / scale

        const common = {
          fill: shape.fill_color,
          fillOpacity,
          stroke: shape.stroke_color,
          strokeWidth,
          strokeDasharray: dashArrayFor(shape.stroke_style, scale),
          strokeLinejoin: 'round' as const,
          // 'all' rather than 'visiblePainted' so a fully transparent fill still
          // catches the click — an outline-only border must stay clickable.
          pointerEvents: (live ? 'all' : 'none') as 'all' | 'none',
          cursor: live ? 'pointer' : undefined,
          // Stop here: a click the shape consumed must not also register as a
          // click on the canvas underneath (which would place a POI or clear
          // the very selection just made).
          onClick: live && onShapeClick
            ? (e: React.MouseEvent) => { e.stopPropagation(); onShapeClick(shape, e) }
            : undefined,
          onMouseDown: live && onBodyDown ? (e: React.MouseEvent) => onBodyDown(shape, e) : undefined,
          onMouseEnter: live && onShapeHover ? () => onShapeHover(shape.id) : undefined,
          onMouseLeave: live && onShapeHover ? () => onShapeHover(null) : undefined,
        }

        const centre = shape.show_label === 1 && shape.label ? centroidOf(shape.shape_type, points) : null

        return (
          <g key={shape.id}>
            {shape.shape_type === 'ellipse'
              ? (() => {
                  const a = ellipseAttrs(points, box)
                  return a ? <ellipse cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry} {...common} /> : null
                })()
              : <polygon points={polygonPointsAttr(points, box)} {...common} />}

            {centre && (
              <text
                x={toLocalX(centre.x, box)}
                y={toLocalY(centre.y, box)}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
                style={{
                  fontSize: 13 / scale,
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  letterSpacing: `${0.4 / scale}px`,
                  fill: '#fff',
                  // Painting the stroke first keeps the label legible over both
                  // bright and dark map art without a background plate.
                  paintOrder: 'stroke',
                  stroke: 'rgba(0,0,0,0.75)',
                  strokeWidth: 3 / scale,
                  strokeLinejoin: 'round',
                  userSelect: 'none',
                }}
              >
                {shape.label}
              </text>
            )}
          </g>
        )
      })}

      {/* Vertex handles for the selected shape */}
      {showHandles && selected && selectedPoints.length > 0 && (
        <g>
          {/* Midpoint "insert a vertex" handles — polygons only; an ellipse is
              defined by its box, so extra points would be meaningless. */}
          {selected.shape.shape_type === 'polygon' && onMidpointDown &&
            edgeMidpoints(selectedPoints).map((m, i) => (
              <circle
                key={`m${i}`}
                cx={toLocalX(m.x, box)} cy={toLocalY(m.y, box)}
                r={3.5 / scale}
                fill="rgba(0,0,0,0.55)"
                stroke="#fff" strokeWidth={1 / scale}
                style={{ pointerEvents: 'all', cursor: 'copy' }}
                onMouseDown={e => onMidpointDown(selected.shape, i, e)}
              >
                <title>Drag to add a point</title>
              </circle>
            ))}

          {selectedPoints.map((p, i) => (
            <circle
              key={`v${i}`}
              cx={toLocalX(p.x, box)} cy={toLocalY(p.y, box)}
              r={5 / scale}
              fill="#f0c674"
              stroke="#000" strokeWidth={1.25 / scale}
              style={{ pointerEvents: 'all', cursor: 'grab' }}
              onMouseDown={e => onVertexDown?.(selected.shape, i, e)}
              onContextMenu={e => onVertexContextMenu?.(selected.shape, i, e)}
            />
          ))}
        </g>
      )}

      {/* The shape being drawn right now */}
      {draft && <DraftOverlay draft={draft} box={box} scale={scale} />}
    </svg>
  )
}

// ── Draft rendering ───────────────────────────────────────────────────────────
// Deliberately non-interactive: while drawing, every click must reach the
// canvas underneath to place the next vertex.

function DraftOverlay({ draft, box, scale }: { draft: ShapeDraft; box: PixelBox; scale: number }) {
  const { points, cursor, shapeType } = draft
  if (!points.length) return null

  const dash = `${5 / scale} ${4 / scale}`
  const common = {
    fill: draft.fillColor,
    fillOpacity: 0.18,
    stroke: draft.strokeColor,
    strokeWidth: 2 / scale,
    strokeDasharray: dash,
    strokeLinejoin: 'round' as const,
    pointerEvents: 'none' as const,
  }

  // Box tools preview as the finished primitive; a polygon previews as the
  // open chain drawn so far plus a rubber band to the cursor.
  if (shapeType === 'ellipse' || draft.tool !== 'polygon') {
    if (points.length < 2) return null
    if (shapeType === 'ellipse') {
      const a = ellipseAttrs(points, box)
      return a ? <ellipse cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry} {...common} /> : null
    }
    return <polygon points={polygonPointsAttr(points, box)} {...common} />
  }

  const chain = cursor ? [...points, cursor] : points
  return (
    <g pointerEvents="none">
      {chain.length >= 3 && (
        <polygon
          points={polygonPointsAttr(chain, box)}
          fill={draft.fillColor} fillOpacity={0.14}
          stroke="none"
        />
      )}
      <polyline
        points={polygonPointsAttr(chain, box)}
        fill="none"
        stroke={draft.strokeColor}
        strokeWidth={2 / scale}
        strokeDasharray={dash}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Closing hint: dotted line back to the first vertex once a close is legal */}
      {chain.length >= 3 && (
        <line
          x1={toLocalX(chain[chain.length - 1].x, box)} y1={toLocalY(chain[chain.length - 1].y, box)}
          x2={toLocalX(points[0].x, box)} y2={toLocalY(points[0].y, box)}
          stroke={draft.strokeColor} strokeOpacity={0.5}
          strokeWidth={1.5 / scale} strokeDasharray={`${2 / scale} ${3 / scale}`}
        />
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={toLocalX(p.x, box)} cy={toLocalY(p.y, box)}
          r={(i === 0 ? 5.5 : 4) / scale}
          fill={i === 0 ? '#fff' : draft.strokeColor}
          stroke="#000" strokeWidth={1 / scale}
        />
      ))}
    </g>
  )
}
