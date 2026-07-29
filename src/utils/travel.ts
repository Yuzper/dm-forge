// path: src/utils/travel.ts
// Pure distance/travel math for the world-map measure tool. No React so the
// rules stay testable and out of the (already large) HubWorldMap component.
//
// Rules basis (D&D 5E):
//  • Travel pace, miles/hour (PHB p.182): Fast 4, Normal 3, Slow 2.
//  • Forced march (PHB p.181): a travel day is 8h; for each hour past 8 each
//    character makes a CON save (DC 10 + 1 per hour past 8) or gains a level of
//    exhaustion.
//  • Mounts (PHB "Mounted Combat" / DMG): a mount can gallop at double speed for
//    ~1 hour, then travels at a normal pace.
import type { DistanceUnit, MapScale, TravelPace } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

export const PACES: Record<TravelPace, { mph: number; perDay: number; label: string }> = {
  fast:   { mph: 4, perDay: 30, label: 'Fast' },
  normal: { mph: 3, perDay: 24, label: 'Normal' },
  slow:   { mph: 2, perDay: 18, label: 'Slow' },
}

export const HOURS_PER_DAY = 8   // a normal (non-forced) travel day
export const MI_PER_KM = 1.609344
export const FT_PER_MI = 5280
export const M_PER_MI = 1609.344

// ── Unit conversion ──────────────────────────────────────────────────────────
// Miles stay the internal currency — every 5E travel rule is expressed in them —
// and each supported unit declares how many miles one of it is worth.

const MILES_PER_UNIT: Record<DistanceUnit, number> = {
  mi: 1,
  km: 1 / MI_PER_KM,
  ft: 1 / FT_PER_MI,
  m:  1 / M_PER_MI,
}

export function toMiles(distance: number, unit: DistanceUnit): number {
  return distance * MILES_PER_UNIT[unit]
}

export function fromMiles(miles: number, unit: DistanceUnit): number {
  return miles / MILES_PER_UNIT[unit]
}

// Human-friendly distance in the requested display unit. Local units get whole
// numbers once they're past single figures — "120 ft" reads better than
// "120.4 ft" — while overland units keep a decimal until they're large.
export function formatDistance(miles: number, unit: DistanceUnit): string {
  const v = fromMiles(miles, unit)
  const local = unit === 'ft' || unit === 'm'
  const threshold = local ? 10 : 100
  const rounded = v >= threshold ? Math.round(v) : Math.round(v * 10) / 10
  return `${rounded} ${unit}`
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number }   // %coords of the fitted image box

// Distance between two %points, in natural image pixels (aspect-correct because
// the image keeps its ratio, so we scale each axis by its natural dimension).
export function pxDistance(a: Pt, b: Pt, natural: { w: number; h: number }): number {
  const dx = ((b.x - a.x) / 100) * natural.w
  const dy = ((b.y - a.y) / 100) * natural.h
  return Math.hypot(dx, dy)
}

// Miles per natural-pixel implied by the calibration line, or null if the line
// has zero length or the scale distance is non-positive.
export function milesPerPx(scale: MapScale, natural: { w: number; h: number }): number | null {
  const linePx = pxDistance({ x: scale.x1, y: scale.y1 }, { x: scale.x2, y: scale.y2 }, natural)
  if (linePx <= 0 || scale.distance <= 0) return null
  return toMiles(scale.distance, scale.unit) / linePx
}

// Per-segment miles for an ordered list of waypoints, plus the total.
export function pathMiles(
  points: Pt[],
  scale: MapScale,
  natural: { w: number; h: number },
): { segments: number[]; total: number } {
  const mpp = milesPerPx(scale, natural)
  if (mpp == null || points.length < 2) return { segments: [], total: 0 }
  const segments: number[] = []
  for (let i = 1; i < points.length; i++) {
    segments.push(pxDistance(points[i - 1], points[i], natural) * mpp)
  }
  return { segments, total: segments.reduce((a, b) => a + b, 0) }
}

// ── Travel time ──────────────────────────────────────────────────────────────

export interface TravelResult {
  hours: number
  days: number          // continuous hours / 8h travel day
  gallopMiles: number   // miles covered by the 1h mounted gallop (0 on foot)
}

// Mounted (RAW): the first hour is a gallop covering 2×pace distance; the rest
// is at the chosen pace. On foot it's simply miles / mph.
export function computeTravel(
  { miles, pace, mounted }: { miles: number; pace: TravelPace; mounted: boolean },
): TravelResult {
  const mph = PACES[pace].mph
  let hours: number
  let gallopMiles = 0
  if (mounted) {
    const gallopCap = 2 * mph            // distance one gallop hour covers
    if (miles <= gallopCap) {
      gallopMiles = miles
      hours = gallopCap > 0 ? miles / gallopCap : 0
    } else {
      gallopMiles = gallopCap
      hours = 1 + (miles - gallopCap) / mph
    }
  } else {
    hours = mph > 0 ? miles / mph : 0
  }
  return { hours, days: hours / HOURS_PER_DAY, gallopMiles }
}

// ── Forced march ─────────────────────────────────────────────────────────────

export interface ForcedMarch {
  count: number
  saves: { hour: number; dc: number }[]   // one per completed hour past 8
}

// A CON save for each completed hour beyond 8, DC 10 + hours past 8.
export function forcedMarchSaves(hours: number): ForcedMarch {
  const extra = Math.max(0, Math.floor(hours) - HOURS_PER_DAY)
  const saves = Array.from({ length: extra }, (_, i) => {
    const past = i + 1                     // 1st extra hour = hour 9
    return { hour: HOURS_PER_DAY + past, dc: 10 + past }
  })
  return { count: extra, saves }
}

// "9 h" / "1.2 days at 8 h/day" style summary of a travel time.
export function formatDuration(hours: number): string {
  if (hours <= 0) return '0 h'
  if (hours < 10) return `${Math.round(hours * 10) / 10} h`
  return `${Math.round(hours)} h`
}
