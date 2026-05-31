// path: src/utils/timelineGeometry.ts
// Pure coordinate math shared by TimelinePage, TimelineEmbed, and InWorldDatePicker.

export const DEFAULT_BASE_YEAR = 1507

export type ZoomLevel = 'full' | 'decade' | 'year' | 'day'

export const ZOOM_LABEL: Record<ZoomLevel, string> = {
  full: 'Full', decade: '10yr', year: '1yr', day: 'Day',
}
export const ZOOM_BIN: Record<ZoomLevel, number> = {
  full: 50, decade: 10, year: 1, day: 1,
}
export const ZOOM_ORDER: ZoomLevel[] = ['full', 'decade', 'year', 'day']
export const YEAR_LENGTH = 365

export const isYearMode = (z: ZoomLevel) => z !== 'day'
export const dayToWorldYear = (day: number, baseYear: number) => baseYear + (day - 1) / YEAR_LENGTH
export const worldYearToDay = (wy: number, baseYear: number) => Math.round((wy - baseYear) * YEAR_LENGTH + 1)

// ── Bin chips ──────────────────────────────────────────────────────────────────

export interface BinItem {
  title: string
  kind: 'session' | 'event' | 'death'
}

export interface BinChip {
  startYear: number
  endYear: number
  syCount: number
  evCount: number
  items: BinItem[]
  zone: 'pre' | 'campaign'
}

export function computeBins(
  zoom: ZoomLevel,
  baseYear: number,
  sessions: { in_world_day?: number | null; name?: string; session_number?: number; session_sub?: string | null }[],
  events: { day: number; title?: string; kind?: string }[],
): BinChip[] {
  if (zoom === 'day') return []
  const binSize = ZOOM_BIN[zoom]

  const allItems = [
    ...sessions
      .filter(s => s.in_world_day != null)
      .map(s => ({
        wy: dayToWorldYear(s.in_world_day!, baseYear),
        title: s.name ? `S${s.session_number}${s.session_sub ?? ''} ${s.name}` : `Session ${s.session_number}`,
        kind: 'session' as const,
      })),
    ...events.map(e => ({
      wy: dayToWorldYear(e.day, baseYear),
      title: e.title ?? 'Untitled',
      kind: (e.kind ?? 'event') as 'event' | 'death',
    })),
  ]

  if (!allItems.length) return []

  const minBin = Math.floor(Math.min(...allItems.map(i => i.wy)) / binSize) * binSize
  const maxBin = Math.ceil(Math.max(...allItems.map(i => i.wy)) / binSize) * binSize

  const chips: BinChip[] = []
  for (let by = minBin; by < maxBin; by += binSize) {
    const end = by + binSize
    const binItems = allItems.filter(i => i.wy >= by && i.wy < end)
    if (!binItems.length) continue
    chips.push({
      startYear: by,
      endYear: end,
      syCount: binItems.filter(i => i.kind === 'session').length,
      evCount: binItems.filter(i => i.kind !== 'session').length,
      items: binItems.map(i => ({ title: i.title, kind: i.kind })),
      zone: by + binSize <= baseYear ? 'pre' : 'campaign',
    })
  }
  return chips
}

// ── Shared item types ────────────────────────────────────────────────────────

export interface SessionRenderItem {
  id: number; name: string; session_number: number; session_sub: string | null
  arc_id: number | null; in_world_day: number; in_world_day_end?: number | null
}

export interface TimelineEventItem {
  id: number; title: string; day: number; year: number
  kind: 'event' | 'death' | 'quest' | 'article'; article_type: string; color: string
  articleId?: number
}

export interface ClusterItem {
  id: number; title: string; kind: 'session' | 'event' | 'death' | 'quest' | 'article'
  day: number; color: string; article_type?: string
  // session-specific
  session_number?: number; session_sub?: string | null; arc_id?: number | null
  in_world_day_end?: number | null
}

// Named historical period rendered as a background band on the timeline.
export interface Era {
  id: string
  name: string
  startYear: number
  endYear: number
  color: string
}

// ── Axis geometry ──────────────────────────────────────────────────────────────

export interface AxisGeo {
  dx: (day: number) => number
  xToDay: (x: number) => number
  worldYearToX: (wy: number) => number
  canvasWidth: (padR: number, maxDay: number) => number
  campaignOffX: number   // px of log-compressed pre-campaign zone at left
  pxPerYear: number
}

// px per world year in campaign zone, per zoom level
const PAGE_PPY: Record<ZoomLevel, number> = { full: 14, decade: 30, year: 90, day: 0 }
const PICK_PPY: Record<ZoomLevel, number> = { full: 14, decade: 22, year: 90, day: 0 }

function buildAxisGeo(
  zoom: ZoomLevel,
  padL: number, minDay: number, pxPerDay: number, baseYear: number,
  campaignOffX: number, logK: number, pxPerYearMap: Record<ZoomLevel, number>,
): AxisGeo {
  const pxPerYear = pxPerYearMap[zoom]

  const worldYearToX = (wy: number): number => wy >= baseYear
    ? padL + campaignOffX + (wy - baseYear) * pxPerYear
    : padL + campaignOffX - logK * Math.log(1 + (baseYear - wy) / 2)

  const dx = isYearMode(zoom)
    ? (day: number) => worldYearToX(dayToWorldYear(day, baseYear))
    : (day: number) => padL + (day - minDay) * pxPerDay

  const xToDay = isYearMode(zoom)
    ? (x: number): number => {
        const wy = x >= padL + campaignOffX
          ? baseYear + (x - padL - campaignOffX) / pxPerYear
          : baseYear - 2 * (Math.exp((padL + campaignOffX - x) / logK) - 1)
        return worldYearToDay(Math.round(wy), baseYear)
      }
    : (x: number) => Math.round((x - padL) / pxPerDay) + minDay

  const canvasWidth = (padR: number, maxDay: number): number => isYearMode(zoom)
    ? padL + campaignOffX + (Math.ceil(dayToWorldYear(maxDay, baseYear)) + 1 - baseYear) * pxPerYear + padR
    : padL + (maxDay - minDay) * pxPerDay + padR

  return { dx, xToDay, worldYearToX, canvasWidth, campaignOffX, pxPerYear }
}

export const makePageAxisGeo = (
  zoom: ZoomLevel, padL: number, minDay: number, pxPerDay: number, baseYear: number,
): AxisGeo => buildAxisGeo(zoom, padL, minDay, pxPerDay, baseYear, 200, 80, PAGE_PPY)

export const makePickerAxisGeo = (
  zoom: ZoomLevel, padL: number, minDay: number, pxPerDay: number, baseYear: number,
): AxisGeo => buildAxisGeo(zoom, padL, minDay, pxPerDay, baseYear, 170, 55, PICK_PPY)
