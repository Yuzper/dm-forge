// path: src/utils/wallSnap.ts
// Snapping for hand-drawn walls.
//
// Walls only block sight where they actually meet. Drawn freehand, two
// segments that look joined on screen are routinely a fraction of a percent
// apart, and a visibility ray is happy to thread that gap — which shows up on
// the players' screen as a thin wedge of light through a solid wall. Snapping
// is what stops those gaps being created in the first place.
//
// (It is not the whole fix. Walls drawn before this existed, and imports whose
// polylines do not quite close, still need the weld in src/vtt/lineOfSight.ts.
// Snapping keeps the stored data clean; welding keeps the fog correct anyway.)
//
// An existing endpoint always wins over a grid line: if you are aiming at the
// corner of a wall you have already drawn, you mean that corner, even when a
// gridline happens to be nearer.
import type { MapWall } from '../types'

export interface SnapPoint { x: number; y: number }

export type SnapKind = 'endpoint' | 'grid' | null

export interface SnapResult extends SnapPoint {
  snappedTo: SnapKind
}

export interface GridStep {
  /** One grid square, as a percent of image width / height. */
  x: number
  y: number
}

export interface SnapOptions {
  /** How close counts as "the same point", in percent. */
  endpointTolerance?: number
  /** Present only when the map has a calibrated grid. */
  grid?: GridStep | null
  /** Skip this wall's own endpoints — dragging one should not snap to itself. */
  excludeWallId?: number
}

/**
 * Default reach, in percent of the image.
 *
 * Deliberately small. A doorway is at least a grid square across, which on a
 * typical battlemap is several percent, so there is no risk of this welding a
 * door shut — but it is comfortably larger than the hand-drawn misses it
 * exists to catch.
 */
export const ENDPOINT_SNAP_TOLERANCE = 1.2

/** A grid snap only engages within this fraction of a square. */
const GRID_SNAP_FRACTION = 0.28

export function snapWallPoint(
  point: SnapPoint,
  walls: MapWall[],
  opts: SnapOptions = {},
): SnapResult {
  const tol = opts.endpointTolerance ?? ENDPOINT_SNAP_TOLERANCE

  // 1. An endpoint of some other wall.
  let best: SnapPoint | null = null
  let bestD = tol
  for (const w of walls) {
    if (w.id === opts.excludeWallId) continue
    for (const p of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) {
      const d = Math.hypot(p.x - point.x, p.y - point.y)
      if (d < bestD) { bestD = d; best = p }
    }
  }
  if (best) return { x: best.x, y: best.y, snappedTo: 'endpoint' }

  // 2. Failing that, a grid intersection — but only if we are close to one.
  // Snapping from anywhere would make it impossible to place a wall that does
  // not sit on the grid, which plenty of map art needs.
  const g = opts.grid
  if (g && g.x > 0 && g.y > 0) {
    const gx = Math.round(point.x / g.x) * g.x
    const gy = Math.round(point.y / g.y) * g.y
    if (Math.abs(gx - point.x) <= g.x * GRID_SNAP_FRACTION &&
        Math.abs(gy - point.y) <= g.y * GRID_SNAP_FRACTION) {
      return { x: gx, y: gy, snappedTo: 'grid' }
    }
  }

  return { x: point.x, y: point.y, snappedTo: null }
}

/**
 * One grid square as a percent of the image, from the map's stored grid
 * calibration. Null when the map has never been calibrated.
 */
export function gridStepPercent(
  gridJson: string | null | undefined,
  natural: { w: number; h: number } | null,
): GridStep | null {
  if (!gridJson || !natural || natural.w <= 0 || natural.h <= 0) return null
  try {
    const g = JSON.parse(gridJson)
    const square = Number(g?.square)
    if (!Number.isFinite(square) || square <= 0) return null
    return { x: (square / natural.w) * 100, y: (square / natural.h) * 100 }
  } catch {
    return null
  }
}
