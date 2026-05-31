// path: src/utils/timelineGeometry.ts
// Pure coordinate math shared by TimelinePage, TimelineEmbed, and InWorldDatePicker.

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
  items: BinItem[]   // all items in the bin, for tooltip listing
}

export function computeBins(
  zoom: ZoomLevel,
  baseYear: number,
  sessions: { in_world_day?: number | null; name?: string; session_number?: number; session_sub?: string | null }[],
  events: { day: number; title?: string; kind?: string }[],
): BinChip[] {
  const binSize = ZOOM_BIN[zoom]
  const preDays = [
    ...sessions.map(s => s.in_world_day).filter((d): d is number => d != null && d < 1),
    ...events.filter(e => e.day < 1).map(e => e.day),
  ]
  if (!preDays.length) return []
  const startBin = Math.floor(Math.floor(dayToWorldYear(Math.min(...preDays), baseYear)) / binSize) * binSize
  const chips: BinChip[] = []
  for (let by = startBin; by < baseYear; by += binSize) {
    const end = Math.min(by + binSize, baseYear)
    const inBin = (d: number) => { const wy = dayToWorldYear(d, baseYear); return wy >= by && wy < end }
    const binSessions = sessions.filter(s => s.in_world_day != null && inBin(s.in_world_day))
    const binEvents = events.filter(e => inBin(e.day))
    const items: BinItem[] = [
      ...binSessions.map(s => ({ title: s.name ? `S${s.session_number}${s.session_sub ?? ''} ${s.name}` : `Session ${s.session_number}`, kind: 'session' as const })),
      ...binEvents.map(e => ({ title: e.title ?? 'Untitled', kind: (e.kind ?? 'event') as 'event' | 'death' })),
    ]
    chips.push({ startYear: by, endYear: end, syCount: binSessions.length, evCount: binEvents.length, items })
  }
  return chips
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
const PICK_PPY: Record<ZoomLevel, number> = { full: 14, decade: 22, year: 0, day: 0 }

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
