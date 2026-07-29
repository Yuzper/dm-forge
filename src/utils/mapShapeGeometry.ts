// path: src/utils/mapShapeGeometry.ts
// Geometry helpers for map drawing shapes. Shapes are stored in the same 0–100
// percentage space POI x/y use — coordinates relative to the *fitted image box*,
// not the viewport — so they stay glued to the map through pan, zoom and
// container resizes without extra bookkeeping.
//
// For rendering they're converted to the image box's local pixel space rather
// than drawn with percentage attributes: SVG <polygon> has no percentage form,
// and a viewBox stretched to a non-square image would render vertex handles as
// ellipses. Local pixels keep circles circular and let stroke widths simply be
// divided by the zoom scale, matching the existing measure overlay.
import type { MapShape, MapShapeType, ShapePoint, ShapeTool } from '../types'

export const MIN_POLYGON_POINTS = 3
// Below this (in percent of the image box) a drag is treated as a stray click
// rather than an intended shape, so tapping the canvas can't litter it with
// degenerate slivers.
export const MIN_DRAG_SIZE = 0.6

const round2 = (n: number) => Math.round(n * 100) / 100

export function parsePoints(raw: string): ShapePoint[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p: any) => p && typeof p.x === 'number' && typeof p.y === 'number' && isFinite(p.x) && isFinite(p.y),
    )
  } catch {
    return []
  }
}

export function serializePoints(points: ShapePoint[]): string {
  // Two decimals is ~0.02% of the image — finer than anyone can aim, and it
  // keeps the JSON small for shapes with many vertices.
  return JSON.stringify(points.map(p => ({ x: round2(p.x), y: round2(p.y) })))
}

export const clampPercent = (n: number) => Math.max(0, Math.min(100, n))

export interface ShapeBBox { x1: number; y1: number; x2: number; y2: number }

export function bboxOf(points: ShapePoint[]): ShapeBBox | null {
  if (!points.length) return null
  let x1 = points[0].x, y1 = points[0].y, x2 = points[0].x, y2 = points[0].y
  for (const p of points) {
    if (p.x < x1) x1 = p.x
    if (p.y < y1) y1 = p.y
    if (p.x > x2) x2 = p.x
    if (p.y > y2) y2 = p.y
  }
  return { x1, y1, x2, y2 }
}

// Normalize a drag (which can run in any direction) to top-left/bottom-right.
export function normalizeBox(a: ShapePoint, b: ShapePoint): ShapeBBox {
  return {
    x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y),
  }
}

// ── Presets ───────────────────────────────────────────────────────────────────
// Every tool but 'ellipse' resolves to a plain polygon, so vertex editing,
// hit-testing and rendering only ever deal with two primitives.

export function shapeTypeForTool(tool: ShapeTool): MapShapeType {
  return tool === 'ellipse' ? 'ellipse' : 'polygon'
}

// Points for a drag-created shape, given the dragged bounding box.
export function pointsFromBox(tool: ShapeTool, box: ShapeBBox): ShapePoint[] {
  const { x1, y1, x2, y2 } = box
  switch (tool) {
    case 'triangle':
      // Apex centred on the top edge — isosceles within the drag box.
      return [{ x: (x1 + x2) / 2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
    case 'ellipse':
      // Stored as two bbox corners rather than centre+radii: percent space is
      // anisotropic on non-square images, so a single "radius" would render as
      // the wrong shape. A box round-trips exactly.
      return [{ x: x1, y: y1 }, { x: x2, y: y2 }]
    case 'rect':
    default:
      return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
  }
}

export function boxIsTooSmall(box: ShapeBBox): boolean {
  return (box.x2 - box.x1) < MIN_DRAG_SIZE && (box.y2 - box.y1) < MIN_DRAG_SIZE
}

// ── Derived geometry ──────────────────────────────────────────────────────────

// Area-weighted centroid, used to anchor the label. Falls back to the bbox
// centre for degenerate (zero-area, e.g. collinear) polygons, which the
// shoelace formula can't handle.
export function centroidOf(shapeType: MapShapeType, points: ShapePoint[]): ShapePoint | null {
  if (!points.length) return null
  const box = bboxOf(points)!
  const boxCentre = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 }
  if (shapeType === 'ellipse') return boxCentre

  let area = 0, cx = 0, cy = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    const cross = p.x * q.y - q.x * p.y
    area += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  area *= 0.5
  if (Math.abs(area) < 1e-9) return boxCentre
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

// Midpoints of each edge — where the "insert a vertex here" handles sit.
export function edgeMidpoints(points: ShapePoint[]): ShapePoint[] {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length]
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
  })
}

// Move every vertex by the same delta, keeping the shape inside the image. The
// clamp applies to the delta rather than per-point, so dragging a shape against
// an edge slides it instead of collapsing it.
export function translatePoints(points: ShapePoint[], dx: number, dy: number): ShapePoint[] {
  const box = bboxOf(points)
  if (!box) return points
  const clampedDx = Math.max(-box.x1, Math.min(100 - box.x2, dx))
  const clampedDy = Math.max(-box.y1, Math.min(100 - box.y2, dy))
  return points.map(p => ({ x: p.x + clampedDx, y: p.y + clampedDy }))
}

// A shape is drawable once it has enough points to enclose an area.
export function isRenderable(shapeType: MapShapeType, points: ShapePoint[]): boolean {
  return shapeType === 'ellipse' ? points.length >= 2 : points.length >= MIN_POLYGON_POINTS
}

// ── Percent → local pixel conversion ──────────────────────────────────────────
// `box` is the fitted image box in CSS pixels (imgBounds.w / imgBounds.h). The
// SVG overlay is sized to that box, so these are its user-space coordinates.

export interface PixelBox { w: number; h: number }

export const toLocalX = (x: number, box: PixelBox) => x / 100 * box.w
export const toLocalY = (y: number, box: PixelBox) => y / 100 * box.h

export function polygonPointsAttr(points: ShapePoint[], box: PixelBox): string {
  return points.map(p => `${round2(toLocalX(p.x, box))},${round2(toLocalY(p.y, box))}`).join(' ')
}

export interface EllipseAttrs { cx: number; cy: number; rx: number; ry: number }

// In local pixels, so the result is a true ellipse on screen.
export function ellipseAttrs(points: ShapePoint[], box: PixelBox): EllipseAttrs | null {
  const bb = bboxOf(points)
  if (!bb) return null
  return {
    cx: toLocalX((bb.x1 + bb.x2) / 2, box),
    cy: toLocalY((bb.y1 + bb.y2) / 2, box),
    rx: Math.max(0, toLocalX((bb.x2 - bb.x1) / 2, box)),
    ry: Math.max(0, toLocalY((bb.y2 - bb.y1) / 2, box)),
  }
}

// Dashes live in local pixels like the stroke, so dividing by zoom keeps the
// rhythm looking identical at every zoom level.
export function dashArrayFor(style: string, scale: number): string | undefined {
  return style === 'dashed' ? `${7 / scale} ${5 / scale}` : undefined
}

// Distance in *screen* pixels between two percent-space points, for
// "did I click the first vertex?" tests where the threshold is a pixel radius.
export function screenDistance(a: ShapePoint, b: ShapePoint, box: PixelBox, scale: number): number {
  const dx = toLocalX(a.x - b.x, box) * scale
  const dy = toLocalY(a.y - b.y, box) * scale
  return Math.hypot(dx, dy)
}

// ── Ordering ──────────────────────────────────────────────────────────────────

// Bounding-box area in percent².
export function shapeArea(points: ShapePoint[]): number {
  const box = bboxOf(points)
  if (!box) return 0
  return (box.x2 - box.x1) * (box.y2 - box.y1)
}

export interface ResolvedShape { shape: MapShape; points: ShapePoint[]; area: number }

// Paint order is largest-first, so a district drawn inside a kingdom ends up on
// top and wins both the click (SVG hit-tests the topmost painted element) and
// the visual stacking — without the user ever managing z-order. sort_order and
// id only break ties, keeping the order stable across reloads.
export function paintOrder(shapes: MapShape[]): ResolvedShape[] {
  return shapes
    .map(shape => {
      const points = parsePoints(shape.points)
      return { shape, points, area: shapeArea(points) }
    })
    .sort((a, b) =>
      (b.area - a.area) ||
      (a.shape.sort_order - b.shape.sort_order) ||
      (a.shape.id - b.shape.id))
}

// ── In-progress drawing ───────────────────────────────────────────────────────

// The shape currently being drawn, before it exists in the database.
export interface ShapeDraft {
  tool: ShapeTool
  shapeType: MapShapeType
  points: ShapePoint[]
  // Rubber-band target: the live cursor for polygons, the far corner of the
  // drag for box tools. Null once neither applies.
  cursor: ShapePoint | null
  fillColor: string
  strokeColor: string
}
