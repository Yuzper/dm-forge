// path: src/components/TimelineCanvas.tsx
// React-rendered timeline SVG shared by TimelinePage and TimelineEmbed.
//
// Replaces the old imperative `timelineSvg.ts` renderers that rebuilt the whole
// <svg> via innerHTML on every render — which tore down elements mid-interaction
// and ate clicks. Here React reconciles the SVG, so marks persist across hovers
// and clicks fire reliably. Geometry still comes from `timelineGeometry.ts`.

import {
  type ZoomLevel, type AxisGeo, type BinChip, type ClusterItem, type Era,
  isYearMode, worldYearToDay,
} from '../utils/timelineGeometry'
import type { Lifespan } from '../constants/timelineDates'

const CLUSTER_PX = 14

export interface TimelineCanvasLayout {
  axisY: number
  arcY: number
  arcH: number
  sessionDotY: number
  eventY: number
  deathY: number
  totalH: number
}

interface ArcSpan {
  arc: { id: number; name: string; color: string }
  start: number
  end: number
}

interface TimelineCanvasProps {
  zoom: ZoomLevel
  geo: AxisGeo
  layout: TimelineCanvasLayout
  width: number
  padL: number
  padR: number
  minDay: number
  maxDay: number
  maxWY: number
  baseYear: number
  pxPerDay: number
  arcSpans: ArcSpan[]
  arcMap: Record<number, { color: string; name?: string }>
  clusterItems: ClusterItem[]
  bins: BinChip[]
  eras?: Era[]
  showEras?: boolean
  lifespans?: Lifespan[]
  showLifespans?: boolean
  // Sizing for label fonts differs between the full page and the embed.
  compact?: boolean
  onItemClick: (item: ClusterItem) => void
  onClusterClick: (items: ClusterItem[], clientX: number, clientY: number) => void
  onItemHover?: (items: ClusterItem[], clientX: number, clientY: number) => void
  onLeave?: () => void
  onBinClick?: (bin: BinChip) => void
  onBinHover?: (bin: BinChip, clientX: number, clientY: number) => void
}

function clusterByPixel(items: ClusterItem[], dx: (d: number) => number): { px: number; cluster: ClusterItem[] }[] {
  const buckets = new Map<number, ClusterItem[]>()
  items.forEach(item => {
    const px = Math.round(dx(item.day) / CLUSTER_PX) * CLUSTER_PX
    buckets.set(px, [...(buckets.get(px) ?? []), item])
  })
  return [...buckets.entries()].map(([px, cluster]) => ({ px, cluster }))
}

export default function TimelineCanvas({
  zoom, geo, layout, width, padL, padR, minDay, maxDay, maxWY, baseYear, pxPerDay,
  arcSpans, arcMap, clusterItems, bins, eras, showEras, lifespans, showLifespans, compact,
  onItemClick, onClusterClick, onItemHover, onLeave, onBinClick, onBinHover,
}: TimelineCanvasProps) {
  const { dx, worldYearToX, campaignOffX } = geo
  const { axisY, arcY, arcH, sessionDotY, eventY, deathY, totalH } = layout
  const yearMode = isYearMode(zoom)
  const axisRight = width - padR

  // ── Era bands (background; behind everything) ───────────────────────────────
  const eraX = (wy: number) => yearMode ? worldYearToX(wy) : dx(worldYearToDay(wy, baseYear))
  const eraBands = (showEras && eras ? eras : []).map(era => {
    const x1 = eraX(era.startYear)
    const x2 = eraX(era.endYear)
    const w = x2 - x1
    if (w <= 0) return null
    return (
      <g key={`era-${era.id}`} pointerEvents="none">
        <rect x={x1} y={0} width={w} height={axisY} fill={era.color + '14'} />
        <line x1={x1} y1={0} x2={x1} y2={axisY} stroke={era.color + '55'} strokeWidth="1" strokeDasharray="3 3" />
        <line x1={x2} y1={0} x2={x2} y2={axisY} stroke={era.color + '55'} strokeWidth="1" strokeDasharray="3 3" />
        {w > 40 && <text x={x1 + w / 2} y={26} textAnchor="middle" fill={era.color + 'cc'} fontSize="9" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.04em">{era.name}</text>}
      </g>
    )
  })

  // ── Lifespan bands (founding→destruction etc.; behind everything) ───────────
  // dx() maps a day to x in both year and day modes, so this works at any zoom.
  const lifespanBands = (showLifespans && lifespans ? lifespans : []).map(ls => {
    const x1 = dx(ls.startDay), x2 = dx(ls.endDay), w = x2 - x1
    if (w <= 0) return null
    return (
      <g key={`ls-${ls.id}-${ls.startDay}`} pointerEvents="none">
        <rect x={x1} y={0} width={w} height={axisY} fill={ls.color + '0d'} stroke={ls.color + '33'} strokeWidth="1" />
        {w > 50 && <text x={x1 + 5} y={axisY - 6} fill={ls.color + '99'} fontSize="8" fontFamily="sans-serif" fontStyle="italic">{ls.title}</text>}
      </g>
    )
  })

  // ── Axis (line + arrowhead) ────────────────────────────────────────────────
  const axis = (
    <>
      <line x1={padL - 10} y1={axisY} x2={axisRight + 8} y2={axisY} stroke="#3a3828" strokeWidth="1.5" />
      <polygon points={`${axisRight + 8},${axisY} ${axisRight + 1},${axisY - 4} ${axisRight + 1},${axisY + 4}`} fill="#3a3828" />
    </>
  )

  // ── Arc tubes ──────────────────────────────────────────────────────────────
  const arcTubes = arcSpans.map(({ arc, start, end }) => {
    const x1 = dx(start), x2 = dx(end), w = Math.max(x2 - x1, 12)
    return (
      <g key={`arc-${arc.id}`}>
        <rect x={x1} y={arcY} width={w} height={arcH} rx="7" fill={arc.color + '28'} stroke={arc.color + '55'} strokeWidth="1" />
        {w > 70 && <text x={x1 + w / 2} y={arcY + arcH / 2 + 3.5} textAnchor="middle" fill={arc.color} fontSize="9" fontFamily="sans-serif" fontWeight="600">{arc.name}</text>}
      </g>
    )
  })

  // ── Year-mode pieces ─────────────────────────────────────────────────────────
  const yearBands: React.ReactNode[] = []
  const yearTicks: React.ReactNode[] = []
  if (yearMode) {
    for (let wy = baseYear; wy <= maxWY; wy++) {
      const x1 = worldYearToX(wy), x2 = worldYearToX(wy + 1)
      yearBands.push(
        <g key={`band-${wy}`}>
          <rect x={x1} y={0} width={Math.max(x2 - x1, 0)} height={axisY} fill={(wy - baseYear) % 2 === 0 ? '#c8a84b08' : '#ffffff04'} />
          <line x1={x1} y1={0} x2={x1} y2={axisY} stroke="#c8a84b18" strokeWidth="1" />
          {x2 - x1 > 18 && <text x={x1 + 4} y={12} fill="#c8a84b55" fontSize="9" fontFamily="sans-serif" fontWeight="600">{wy}</text>}
        </g>
      )
      const tx = worldYearToX(wy)
      if (tx >= padL + campaignOffX && tx <= axisRight) {
        yearTicks.push(
          <g key={`ytick-${wy}`}>
            <line x1={tx} y1={axisY} x2={tx} y2={axisY + 7} stroke="#2a2820" strokeWidth="1" />
            <text x={tx} y={axisY + 18} textAnchor="middle" fill="#4a4840" fontSize="9" fontFamily="sans-serif">{wy}</text>
          </g>
        )
      }
    }
  }

  const binChips = bins.map(bin => {
    const x1 = Math.max(worldYearToX(bin.startYear), padL)
    const x2 = worldYearToX(bin.endYear)
    const w = Math.max(x2 - x1, 8)
    const hasItems = bin.syCount > 0 || bin.evCount > 0
    const isCampaign = bin.zone === 'campaign'
    const top = arcY - 2, h = axisY - top
    const label = [bin.syCount > 0 && `${bin.syCount}s`, bin.evCount > 0 && `${bin.evCount}ev`].filter(Boolean).join(' · ')
    return (
      <g key={`bin-${bin.startYear}`} style={{ cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onBinClick?.(bin) }}
        onMouseEnter={e => onBinHover?.(bin, e.clientX, e.clientY)}
        onMouseLeave={() => onLeave?.()}>
        <rect x={x1} y={top} width={w} height={h} rx="3"
          fill={isCampaign ? '#c8a84b12' : hasItems ? '#2a2820' : '#1a1810'}
          stroke={isCampaign ? '#c8a84b44' : hasItems ? '#3a3828' : '#222018'} strokeWidth="1" />
        {w > 18 && hasItems && <text x={x1 + w / 2} y={top + h / 2 + 3.5} textAnchor="middle" fill={isCampaign ? '#c8a84baa' : '#c8a84b88'} fontSize="8" fontFamily="sans-serif">{label}</text>}
        {w > 34 && <text x={x1 + w / 2} y={top - 4} textAnchor="middle" fill={isCampaign ? '#c8a84b77' : '#3a3628'} fontSize="7" fontFamily="sans-serif">{bin.startYear}</text>}
      </g>
    )
  })

  const logBreak = yearMode && bins.some(b => b.zone === 'pre')
    ? <line x1={padL + campaignOffX} y1={0} x2={padL + campaignOffX} y2={totalH} stroke="#c8a84b33" strokeWidth="1.5" strokeDasharray="4 3" />
    : null

  // ── Day-mode pieces ──────────────────────────────────────────────────────────
  const dayTicks: React.ReactNode[] = []
  if (!yearMode) {
    const step = pxPerDay <= 6 ? 20 : pxPerDay <= 10 ? 10 : pxPerDay <= 18 ? 5 : 1
    for (let d = Math.ceil(minDay / step) * step; d <= maxDay; d += step) {
      const x = dx(d)
      dayTicks.push(
        <g key={`dtick-${d}`}>
          <line x1={x} y1={axisY} x2={x} y2={axisY + 7} stroke="#2a2820" strokeWidth="1" />
          <text x={x} y={axisY + 18} textAnchor="middle" fill={d <= 0 ? '#6b5040' : '#4a4840'} fontSize="9" fontFamily="sans-serif">{`D${d}`}</text>
        </g>
      )
    }
  }

  // ── Clustered marks (day mode) ───────────────────────────────────────────────
  const marks = !yearMode ? clusterByPixel(clusterItems, dx).map(({ px, cluster }) => {
    const isSingle = cluster.length === 1
    const item = cluster[0]
    const handlers = {
      style: { cursor: 'pointer' as const },
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); isSingle ? onItemClick(item) : onClusterClick(cluster, e.clientX, e.clientY) },
      onMouseEnter: (e: React.MouseEvent) => onItemHover?.(cluster, e.clientX, e.clientY),
      onMouseMove: (e: React.MouseEvent) => onItemHover?.(cluster, e.clientX, e.clientY),
      onMouseLeave: () => onLeave?.(),
    }

    if (isSingle && item.kind === 'session') {
      const col = arcMap[item.arc_id ?? 0]?.color ?? '#8a8a8a'
      const endDay = item.in_world_day_end ?? item.day
      const endX = dx(endDay)
      const isMultiDay = endDay > item.day
      const R = 12
      const words = item.title.split(' '), half = Math.ceil(words.length / 2)
      return (
        <g key={`m-${px}-s${item.id}`} {...handlers}>
          {isMultiDay
            ? <rect x={px} y={axisY - 22 - 9} width={endX - px} height={9} rx="5" fill={col + '22'} stroke={col} strokeWidth="1" pointerEvents="none" />
            : <line x1={px} y1={sessionDotY + R} x2={px} y2={arcY} stroke={col + '44'} strokeWidth="1" strokeDasharray="3 2" pointerEvents="none" />}
          <circle cx={px} cy={sessionDotY} r={R} fill={col + '1a'} stroke={col} strokeWidth="1.5" pointerEvents="none" />
          <text x={px} y={sessionDotY + 4} textAnchor="middle" fill={col} fontSize="9" fontWeight="600" fontFamily="sans-serif" pointerEvents="none">{`${item.session_number}${item.session_sub ?? ''}`}</text>
          <text x={px} y={sessionDotY - R - 10} textAnchor="middle" fill="#6b6558" fontSize="8" fontFamily="sans-serif" pointerEvents="none">{words.slice(0, half).join(' ')}</text>
          {words.length > half && <text x={px} y={sessionDotY - R - 2} textAnchor="middle" fill="#6b6558" fontSize="8" fontFamily="sans-serif" pointerEvents="none">{words.slice(half).join(' ')}</text>}
          <circle cx={px} cy={sessionDotY} r={R + 4} fill="transparent" />
        </g>
      )
    }

    if (isSingle && item.kind !== 'session') {
      // event / death / quest / article — all render as a diamond + label.
      const S = 7
      const yPos = item.kind === 'death' ? deathY : eventY
      return (
        <g key={`m-${px}-${item.kind}${item.id}`} {...handlers}>
          <line x1={px} y1={item.kind === 'death' ? yPos - S : yPos + S} x2={px} y2={item.kind === 'death' ? axisY : sessionDotY - 16}
            stroke={item.color + '44'} strokeWidth="1" strokeDasharray="2 3" pointerEvents="none" />
          <polygon points={`${px},${yPos - S} ${px + S},${yPos} ${px},${yPos + S} ${px - S},${yPos}`}
            fill={item.color + '1a'} stroke={item.color} strokeWidth="1.5" pointerEvents="none" />
          {item.kind === 'death' && <text x={px} y={yPos + 3.5} textAnchor="middle" fill={item.color} fontSize="7" fontFamily="sans-serif" pointerEvents="none">☠</text>}
          <text x={px} y={item.kind === 'death' ? yPos + S + 10 : yPos - S - 5} textAnchor="middle" fill={item.color} fontSize="8" fontFamily="sans-serif" pointerEvents="none">{item.title}</text>
          <circle cx={px} cy={yPos} r={S + 6} fill="transparent" />
        </g>
      )
    }

    // Cluster of multiple items — stacked diamond badge
    const S = 9
    const yPos = eventY
    const col = '#c8a84b'
    return (
      <g key={`m-${px}-cluster`} {...handlers}>
        <polygon points={`${px + 3},${yPos - S + 2} ${px + S + 3},${yPos + 2} ${px + 3},${yPos + S + 2} ${px - S + 3},${yPos + 2}`}
          fill="#2a2820" stroke="#3a3828" strokeWidth="1" pointerEvents="none" />
        <polygon points={`${px},${yPos - S} ${px + S},${yPos} ${px},${yPos + S} ${px - S},${yPos}`}
          fill={col + '22'} stroke={col} strokeWidth="1.5" pointerEvents="none" />
        <text x={px} y={yPos + 3.5} textAnchor="middle" fill={col} fontSize="8" fontWeight="700" fontFamily="sans-serif" pointerEvents="none">{cluster.length}</text>
        <line x1={px} y1={yPos + S} x2={px} y2={axisY} stroke={col + '33'} strokeWidth="1" strokeDasharray="2 3" pointerEvents="none" />
        <circle cx={px} cy={yPos} r={S + 4} fill="transparent" />
      </g>
    )
  }) : null

  void compact // reserved for future label sizing tweaks

  return (
    <>
      {yearMode ? (
        <>
          {eraBands}
          {lifespanBands}
          {logBreak}
          {yearBands}
          {axis}
          {yearTicks}
          {arcTubes}
          {binChips}
        </>
      ) : (
        <>
          {eraBands}
          {lifespanBands}
          {axis}
          {dayTicks}
          {arcTubes}
          {marks}
        </>
      )}
    </>
  )
}
