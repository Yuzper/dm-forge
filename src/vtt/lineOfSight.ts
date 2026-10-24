// path: src/vtt/lineOfSight.ts
// What can be seen from a point, given walls.
//
// The classic ray-casting visibility polygon: fire a ray at every wall corner
// plus one a hair either side of it, keep the nearest hit, sort the hits by
// angle, and the result is the lit region as a polygon. The pair of offset
// rays is what lets a sightline slip past a corner and carry on to whatever is
// behind it; without them the polygon snaps shut at every vertex.
//
// Everything is in percent space (0–100 across the image), the same space the
// walls are stored in. That space is anisotropic on a non-square map — a
// percent of width is not a percent of height — which does not matter here:
// the transform between percent and pixels is affine, straight lines stay
// straight and intersections are preserved, so a polygon computed in percent
// is exactly right once drawn. Only the epsilon nudge is slightly lopsided,
// and it is far too small to see.

export interface Point { x: number; y: number }
export interface Segment { x1: number; y1: number; x2: number; y2: number }

/** A hair, in percent. Large enough to clear a corner, small enough to hide. */
const EPSILON = 0.00008
/** Rays that escape everything stop here — comfortably past the map edge. */
const FAR = 400

/**
 * The four edges of the image, so a ray into open space terminates at the map
 * boundary instead of running to infinity.
 */
export function boundsSegments(): Segment[] {
  return [
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x1: 100, y1: 0, x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 0, y2: 100 },
    { x1: 0, y1: 100, x2: 0, y2: 0 },
  ]
}

/** Nearest hit along a ray, as a distance in ray units, or null. */
function castRay(origin: Point, dx: number, dy: number, segs: Segment[]): number | null {
  let best: number | null = null
  for (const s of segs) {
    const sx = s.x2 - s.x1
    const sy = s.y2 - s.y1
    const denom = dx * sy - dy * sx
    // Parallel (or a degenerate segment): no single crossing to find.
    if (Math.abs(denom) < 1e-12) continue
    const px = s.x1 - origin.x
    const py = s.y1 - origin.y
    const t = (px * sy - py * sx) / denom
    const u = (px * dy - py * dx) / denom
    if (t > 1e-9 && u >= 0 && u <= 1 && (best === null || t < best)) best = t
  }
  return best
}

/**
 * The region visible from `origin`, as a polygon in percent space.
 *
 * `segments` should already exclude anything that does not block sight —
 * open doors and windows are filtered out by the caller, since only it knows
 * the current door states.
 */
export function visibilityPolygon(origin: Point, segments: Segment[]): Point[] {
  const segs = [...segments, ...boundsSegments()]

  // One ray at each corner, plus one either side so sightlines can round it.
  const angles: number[] = []
  for (const s of segs) {
    for (const [px, py] of [[s.x1, s.y1], [s.x2, s.y2]] as const) {
      const a = Math.atan2(py - origin.y, px - origin.x)
      angles.push(a - EPSILON, a, a + EPSILON)
    }
  }
  if (angles.length === 0) return []

  const hits: { a: number; x: number; y: number }[] = []
  for (const a of angles) {
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const t = castRay(origin, dx, dy, segs) ?? FAR
    hits.push({ a, x: origin.x + dx * t, y: origin.y + dy * t })
  }

  hits.sort((p, q) => p.a - q.a)
  return hits.map(h => ({ x: h.x, y: h.y }))
}

/**
 * Which walls actually block sight right now.
 *
 * A window never does. A door does only while it is shut — that is the whole
 * point of tracking door state, and it is why opening one at the table reveals
 * the corridor beyond without the DM touching the fog.
 */
export function blockingSegments(
  walls: { x1: number; y1: number; x2: number; y2: number; kind: string; door_open?: number }[],
): Segment[] {
  const out: Segment[] = []
  for (const w of walls) {
    if (w.kind === 'window') continue
    if (w.kind === 'door' && w.door_open) continue
    out.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })
  }
  return out
}

/** `points` as an SVG polygon attribute, scaled from percent into a box. */
export function polygonAttr(points: Point[], box: { w: number; h: number }): string {
  return points
    .map(p => `${((p.x / 100) * box.w).toFixed(2)},${((p.y / 100) * box.h).toFixed(2)}`)
    .join(' ')
}
