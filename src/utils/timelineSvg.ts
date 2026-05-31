// path: src/utils/timelineSvg.ts
// Shared imperative SVG rendering helpers for timeline views.

import type { BinChip } from './timelineGeometry'

const NS = 'http://www.w3.org/2000/svg'

export function svgEl(tag: string, attrs: Record<string, string | number>, parent?: SVGElement): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)))
  if (parent) parent.appendChild(e)
  return e
}

export function svgTxt(str: string, attrs: Record<string, string | number>, parent: SVGElement): SVGElement {
  const e = document.createElementNS(NS, 'text') as SVGElement
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)))
  e.textContent = str
  parent.appendChild(e)
  return e
}

// ── Axis ───────────────────────────────────────────────────────────────────────

export function renderAxis(svg: SVGElement, x1: number, axisY: number, x2: number): void {
  svgEl('line', { x1, y1: axisY, x2: x2 + 8, y2: axisY, stroke: '#3a3828', 'stroke-width': '1.5' }, svg)
  svgEl('polygon', { points: `${x2 + 8},${axisY} ${x2 + 1},${axisY - 4} ${x2 + 1},${axisY + 4}`, fill: '#3a3828' }, svg)
}

export function renderDayTicks(
  svg: SVGElement, minDay: number, maxDay: number, axisY: number,
  dx: (d: number) => number, pxPerDay: number,
): void {
  const step = pxPerDay <= 6 ? 20 : pxPerDay <= 10 ? 10 : pxPerDay <= 18 ? 5 : 1
  for (let d = Math.ceil(minDay / step) * step; d <= maxDay; d += step) {
    const x = dx(d)
    svgEl('line', { x1: x, y1: axisY, x2: x, y2: axisY + 7, stroke: '#2a2820', 'stroke-width': '1' }, svg)
    svgTxt(`D${d}`, { x, y: axisY + 18, 'text-anchor': 'middle', fill: d <= 0 ? '#6b5040' : '#4a4840', 'font-size': '9', 'font-family': 'sans-serif' }, svg)
  }
}

export function renderPreCampaignShade(svg: SVGElement, x1: number, x2: number, totalH: number, axisY: number): void {
  svgEl('rect', { x: x1, y: 0, width: x2 - x1, height: totalH, fill: '#e88c3a08' }, svg)
  svgEl('line', { x1: x2, y1: 0, x2: x2, y2: totalH, stroke: '#e88c3a22', 'stroke-width': '1', 'stroke-dasharray': '4 3' }, svg)
  svgTxt('Pre-campaign', { x: x1 + (x2 - x1) / 2, y: axisY + 44, 'text-anchor': 'middle', fill: '#e88c3a55', 'font-size': '9', 'font-family': 'sans-serif' }, svg)
}

export function renderLogBreak(svg: SVGElement, x: number, totalH: number): void {
  svgEl('line', { x1: x, y1: 0, x2: x, y2: totalH, stroke: '#c8a84b33', 'stroke-width': '1.5', 'stroke-dasharray': '4 3' }, svg)
}

export function renderYearBands(
  svg: SVGElement, axisY: number, baseYear: number, maxWY: number,
  worldYearToX: (wy: number) => number,
): void {
  for (let wy = baseYear; wy <= maxWY; wy++) {
    const x1 = worldYearToX(wy), x2 = worldYearToX(wy + 1)
    svgEl('rect', { x: x1, y: 0, width: Math.max(x2 - x1, 0), height: axisY,
      fill: (wy - baseYear) % 2 === 0 ? '#c8a84b08' : '#ffffff04' }, svg)
    svgEl('line', { x1, y1: 0, x2: x1, y2: axisY, stroke: '#c8a84b18', 'stroke-width': '1' }, svg)
    if (x2 - x1 > 18) svgTxt(String(wy), { x: x1 + 4, y: 12, fill: '#c8a84b55', 'font-size': '9', 'font-family': 'sans-serif', 'font-weight': '600' }, svg)
  }
}

export function renderYearTicks(
  svg: SVGElement, baseYear: number, maxWY: number, axisY: number,
  worldYearToX: (wy: number) => number, minX: number, maxX: number,
): void {
  for (let wy = baseYear; wy <= maxWY; wy++) {
    const x = worldYearToX(wy)
    if (x < minX || x > maxX) continue
    svgEl('line', { x1: x, y1: axisY, x2: x, y2: axisY + 7, stroke: '#2a2820', 'stroke-width': '1' }, svg)
    svgTxt(String(wy), { x, y: axisY + 18, 'text-anchor': 'middle', fill: '#4a4840', 'font-size': '9', 'font-family': 'sans-serif' }, svg)
  }
}

// ── Bin chips ──────────────────────────────────────────────────────────────────

export interface BinRenderOpts {
  axisY: number
  arcY: number
  onHover?: (chip: BinChip, clientX: number, clientY: number) => void
  onLeave?: () => void
  onClick?: (chip: BinChip) => void
}

export function renderBinChips(
  svg: SVGElement,
  bins: BinChip[],
  worldYearToX: (wy: number) => number,
  padL: number,
  { axisY, arcY, onHover, onLeave, onClick }: BinRenderOpts,
): void {
  bins.forEach(bin => {
    const x1 = Math.max(worldYearToX(bin.startYear), padL)
    const x2 = worldYearToX(bin.endYear)
    const w = Math.max(x2 - x1, 8)
    const hasItems = bin.syCount > 0 || bin.evCount > 0
    const isCampaign = bin.zone === 'campaign'
    const top = arcY - 2, h = axisY - top
    const g = svgEl('g', { style: 'cursor:pointer' }, svg)

    if (isCampaign) {
      svgEl('rect', { x: x1, y: top, width: w, height: h, rx: '3',
        fill: '#c8a84b12', stroke: '#c8a84b44', 'stroke-width': '1' }, g)
      if (w > 18 && hasItems) {
        const label = [bin.syCount > 0 && `${bin.syCount}s`, bin.evCount > 0 && `${bin.evCount}ev`].filter(Boolean).join(' · ')
        svgTxt(label, { x: x1 + w / 2, y: top + h / 2 + 3.5, 'text-anchor': 'middle', fill: '#c8a84baa', 'font-size': '8', 'font-family': 'sans-serif' }, g)
      }
      if (w > 34) svgTxt(String(bin.startYear), { x: x1 + w / 2, y: top - 4, 'text-anchor': 'middle', fill: '#c8a84b77', 'font-size': '7', 'font-family': 'sans-serif' }, g)
    } else {
      svgEl('rect', { x: x1, y: top, width: w, height: h, rx: '3',
        fill: hasItems ? '#2a2820' : '#1a1810', stroke: hasItems ? '#3a3828' : '#222018', 'stroke-width': '1' }, g)
      if (w > 18 && hasItems) {
        const label = [bin.syCount > 0 && `${bin.syCount}s`, bin.evCount > 0 && `${bin.evCount}ev`].filter(Boolean).join(' · ')
        svgTxt(label, { x: x1 + w / 2, y: top + h / 2 + 3.5, 'text-anchor': 'middle', fill: '#c8a84b88', 'font-size': '8', 'font-family': 'sans-serif' }, g)
      }
      if (w > 34) svgTxt(String(bin.startYear), { x: x1 + w / 2, y: top - 4, 'text-anchor': 'middle', fill: '#3a3628', 'font-size': '7', 'font-family': 'sans-serif' }, g)
    }

    if (onHover) g.addEventListener('mouseenter', e => onHover(bin, (e as MouseEvent).clientX, (e as MouseEvent).clientY))
    if (onLeave) g.addEventListener('mouseleave', onLeave)
    if (onClick) g.addEventListener('click', e => { e.stopPropagation(); onClick(bin) })
  })
}

// ── Arc tubes ─────────────────────────────────────────────────────────────────

export function renderArcTubes(
  svg: SVGElement,
  arcSpans: { arc: { id: number; name: string; color: string }; start: number; end: number }[],
  dx: (d: number) => number,
  arcY: number, arcH: number,
): void {
  arcSpans.forEach(({ arc, start, end }) => {
    const x1 = dx(start), x2 = dx(end), w = Math.max(x2 - x1, 12)
    const g = svgEl('g', {}, svg)
    svgEl('rect', { x: x1, y: arcY, width: w, height: arcH, rx: '7',
      fill: arc.color + '28', stroke: arc.color + '55', 'stroke-width': '1' }, g)
    if (w > 70) svgTxt(arc.name, { x: x1 + w / 2, y: arcY + arcH / 2 + 3.5,
      'text-anchor': 'middle', fill: arc.color, 'font-size': '9', 'font-family': 'sans-serif', 'font-weight': '600' }, g)
  })
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionRenderItem {
  id: number; name: string; session_number: number; session_sub: string | null
  arc_id: number | null; in_world_day: number; in_world_day_end?: number | null
}

export interface SessionLayout {
  sessionDotY: number; sessionPillY: number; sessionPillH: number; arcY: number; axisY: number
}

export interface SessionRenderOpts {
  isHighlighted: (id: number) => boolean
  onClick: (s: SessionRenderItem) => void
  onHover?: (s: SessionRenderItem, e: MouseEvent, container: Element) => void
  onLeave?: () => void
}

export function renderSessions(
  svg: SVGElement,
  sessions: SessionRenderItem[],
  arcMap: Record<number, { id: number; name: string; color: string }>,
  dx: (d: number) => number,
  layout: SessionLayout,
  opts: SessionRenderOpts,
): void {
  const { sessionDotY, sessionPillY, sessionPillH, arcY } = layout
  const sorted = [...sessions].sort((a, b) => a.in_world_day - b.in_world_day)

  sorted.forEach(s => {
    const arc = arcMap[s.arc_id ?? 0]
    const color = arc?.color ?? '#8a8a8a'
    const startX = dx(s.in_world_day)
    const endDay = s.in_world_day_end ?? s.in_world_day
    const endX = dx(endDay)
    const isMultiDay = endDay > s.in_world_day
    const hl = opts.isHighlighted(s.id)
    const R = hl ? 15 : 12

    const g = svgEl('g', { style: 'cursor:pointer', 'pointer-events': 'bounding-box' }, svg)
    g.addEventListener('click', () => opts.onClick(s))
    if (opts.onHover) {
      const container = svg.parentElement!
      g.addEventListener('mouseenter', e => opts.onHover!(s, e as MouseEvent, container))
      g.addEventListener('mousemove', e => opts.onHover!(s, e as MouseEvent, container))
    }
    if (opts.onLeave) g.addEventListener('mouseleave', opts.onLeave)

    if (isMultiDay) {
      svgEl('rect', { x: startX, y: sessionPillY, width: endX - startX, height: sessionPillH, rx: '5',
        fill: hl ? color + '44' : color + '22', stroke: color, 'stroke-width': hl ? '2' : '1', 'pointer-events': 'none' }, g)
      svgEl('line', { x1: startX, y1: sessionDotY + R, x2: startX, y2: sessionPillY,
        stroke: color + '55', 'stroke-width': '1', 'stroke-dasharray': '2 2', 'pointer-events': 'none' }, g)
    } else {
      svgEl('line', { x1: startX, y1: sessionDotY + R, x2: startX, y2: arcY,
        stroke: color + '44', 'stroke-width': '1', 'stroke-dasharray': '3 2', 'pointer-events': 'none' }, g)
    }
    svgEl('circle', { cx: startX, cy: sessionDotY, r: R,
      fill: hl ? color + '44' : color + '1a', stroke: color, 'stroke-width': hl ? '2' : '1.5', 'pointer-events': 'none' }, g)
    svgTxt(`${s.session_number}${s.session_sub ?? ''}`, { x: startX, y: sessionDotY + 4,
      'text-anchor': 'middle', fill: color, 'font-size': '9', 'font-weight': '600', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)

    const words = s.name.split(' '), half = Math.ceil(words.length / 2)
    svgTxt(words.slice(0, half).join(' '), { x: startX, y: sessionDotY - R - 10,
      'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
    if (words.length > half) svgTxt(words.slice(half).join(' '), { x: startX, y: sessionDotY - R - 2,
      'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
  })
}

// ── Events / Deaths ───────────────────────────────────────────────────────────

export interface TimelineEventItem {
  id: number; title: string; day: number; year: number
  kind: 'event' | 'death'; article_type: string; color: string
  articleId?: number
}

export interface EventLayout {
  eventY: number; deathY: number; axisY: number; sessionDotY: number; arcY: number
}

export interface EventRenderOpts {
  showEvents: boolean; showDeaths: boolean; showSessions: boolean
  isHighlighted: (id: number, kind: string) => boolean
  onClick: (item: TimelineEventItem) => void
  onHover?: (item: TimelineEventItem, e: MouseEvent, container: Element) => void
  onLeave?: () => void
}

export function renderEventItems(
  svg: SVGElement,
  items: TimelineEventItem[],
  dx: (d: number) => number,
  layout: EventLayout,
  opts: EventRenderOpts,
): void {
  const { eventY, deathY, axisY, sessionDotY, arcY } = layout
  items.forEach(item => {
    if (item.kind === 'event' && !opts.showEvents) return
    if (item.kind === 'death' && !opts.showDeaths) return

    const x = dx(item.day)
    const hl = opts.isHighlighted(item.id, item.kind)
    const S = hl ? 9 : 7
    const yPos = item.kind === 'death' ? deathY : eventY
    const connBot = item.kind === 'death' ? axisY : (opts.showSessions ? sessionDotY - 16 : arcY)

    const g = svgEl('g', { style: 'cursor:pointer', 'pointer-events': 'bounding-box' }, svg)
    g.addEventListener('click', () => opts.onClick(item))
    if (opts.onHover) {
      const container = svg.parentElement!
      g.addEventListener('mouseenter', e => opts.onHover!(item, e as MouseEvent, container))
      g.addEventListener('mousemove', e => opts.onHover!(item, e as MouseEvent, container))
    }
    if (opts.onLeave) g.addEventListener('mouseleave', opts.onLeave)

    svgEl('line', { x1: x, y1: item.kind === 'death' ? yPos - S : yPos + S, x2: x, y2: connBot,
      stroke: item.color + '44', 'stroke-width': '1', 'stroke-dasharray': '2 3', 'pointer-events': 'none' }, g)

    if (item.kind === 'death') {
      svgEl('polygon', { points: `${x},${yPos - S} ${x + S},${yPos} ${x},${yPos + S} ${x - S},${yPos}`,
        fill: hl ? item.color + '55' : item.color + '22', stroke: item.color, 'stroke-width': hl ? '2' : '1.5', 'pointer-events': 'none' }, g)
      svgTxt('☠', { x, y: yPos + 3.5, 'text-anchor': 'middle', fill: item.color, 'font-size': '7', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      svgTxt(item.title, { x, y: yPos + S + 10, 'text-anchor': 'middle', fill: item.color, 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
    } else {
      svgEl('polygon', { points: `${x},${yPos - S} ${x + S},${yPos} ${x},${yPos + S} ${x - S},${yPos}`,
        fill: hl ? item.color + '55' : item.color + '1a', stroke: item.color, 'stroke-width': hl ? '2' : '1.5', 'pointer-events': 'none' }, g)
      svgTxt(item.title, { x, y: yPos - S - 5, 'text-anchor': 'middle', fill: item.color, 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
    }
  })
}

// ── Day clustering ─────────────────────────────────────────────────────────────
// Groups items that fall within CLUSTER_PX pixels of each other so overlapping
// items on the same day are reachable via a shared cluster indicator.

const CLUSTER_PX = 14

export interface ClusterItem {
  id: number; title: string; kind: 'session' | 'event' | 'death'
  day: number; color: string; article_type?: string
  // session-specific
  session_number?: number; session_sub?: string | null; arc_id?: number | null
  in_world_day_end?: number | null
}

export interface ClusterOpts {
  axisY: number; sessionDotY: number; eventY: number; deathY: number; arcY: number
  onHover: (items: ClusterItem[], cx: number, cy: number, container: Element) => void
  onLeave: () => void
  onClickSingle: (item: ClusterItem) => void
  onClickCluster: (items: ClusterItem[]) => void
}

export function renderClusters(
  svg: SVGElement,
  items: ClusterItem[],
  dx: (d: number) => number,
  arcMap: Record<number, { color: string }>,
  opts: ClusterOpts,
): void {
  // Group by pixel bucket
  const buckets = new Map<number, ClusterItem[]>()
  items.forEach(item => {
    const px = Math.round(dx(item.day) / CLUSTER_PX) * CLUSTER_PX
    buckets.set(px, [...(buckets.get(px) ?? []), item])
  })

  buckets.forEach((cluster, px) => {
    const isSingle = cluster.length === 1
    const item = cluster[0]
    const color = isSingle ? item.color : '#c8a84b'

    const g = svgEl('g', { style: 'cursor:pointer' }, svg)
    const container = svg.parentElement!

    // attachHit renders a transparent overlay as the last child of g.
    // Transparent fill (not 'none') + pointer-events:all = reliable cross-platform hit target.
    const attachHit = (cx: number, cy: number, r: number) => {
      const hit = svgEl('circle', { cx, cy, r, fill: 'transparent', 'pointer-events': 'all' }, g)
      hit.addEventListener('mouseenter', e => opts.onHover(cluster, (e as MouseEvent).clientX, (e as MouseEvent).clientY, container))
      hit.addEventListener('mousemove',  e => opts.onHover(cluster, (e as MouseEvent).clientX, (e as MouseEvent).clientY, container))
      hit.addEventListener('mouseleave', opts.onLeave)
      hit.addEventListener('click', e => { e.stopPropagation(); isSingle ? opts.onClickSingle(item) : opts.onClickCluster(cluster) })
    }

    if (isSingle && item.kind === 'session') {
      // Single session — full render
      const arc = arcMap[item.arc_id ?? 0]
      const col = arc?.color ?? '#8a8a8a'
      const endDay = item.in_world_day_end ?? item.day
      const endX = dx(endDay)
      const isMultiDay = endDay > item.day
      const R = 12
      if (isMultiDay) {
        svgEl('rect', { x: px, y: opts.axisY - 22 - 9, width: endX - px, height: 9, rx: '5', fill: col + '22', stroke: col, 'stroke-width': '1', 'pointer-events': 'none' }, g)
      } else {
        svgEl('line', { x1: px, y1: opts.sessionDotY + R, x2: px, y2: opts.arcY, stroke: col + '44', 'stroke-width': '1', 'stroke-dasharray': '3 2', 'pointer-events': 'none' }, g)
      }
      svgEl('circle', { cx: px, cy: opts.sessionDotY, r: R, fill: col + '1a', stroke: col, 'stroke-width': '1.5', 'pointer-events': 'none' }, g)
      svgTxt(`${item.session_number}${item.session_sub ?? ''}`, { x: px, y: opts.sessionDotY + 4, 'text-anchor': 'middle', fill: col, 'font-size': '9', 'font-weight': '600', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      const words = item.title.split(' '), half = Math.ceil(words.length / 2)
      svgTxt(words.slice(0, half).join(' '), { x: px, y: opts.sessionDotY - R - 10, 'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      if (words.length > half) svgTxt(words.slice(half).join(' '), { x: px, y: opts.sessionDotY - R - 2, 'text-anchor': 'middle', fill: '#6b6558', 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      attachHit(px, opts.sessionDotY, R + 4)

    } else if (isSingle && (item.kind === 'event' || item.kind === 'death')) {
      // Single event/death — full render
      const S = 7
      const yPos = item.kind === 'death' ? opts.deathY : opts.eventY
      svgEl('line', { x1: px, y1: item.kind === 'death' ? yPos - S : yPos + S, x2: px, y2: item.kind === 'death' ? opts.axisY : opts.sessionDotY - 16,
        stroke: item.color + '44', 'stroke-width': '1', 'stroke-dasharray': '2 3', 'pointer-events': 'none' }, g)
      svgEl('polygon', { points: `${px},${yPos - S} ${px + S},${yPos} ${px},${yPos + S} ${px - S},${yPos}`,
        fill: item.color + '1a', stroke: item.color, 'stroke-width': '1.5', 'pointer-events': 'none' }, g)
      if (item.kind === 'death') svgTxt('☠', { x: px, y: yPos + 3.5, 'text-anchor': 'middle', fill: item.color, 'font-size': '7', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      svgTxt(item.title, { x: px, y: item.kind === 'death' ? yPos + S + 10 : yPos - S - 5, 'text-anchor': 'middle', fill: item.color, 'font-size': '8', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      attachHit(px, yPos, S + 6)

    } else {
      // Cluster of multiple items — stacked diamond badge
      const S = 9
      const yPos = opts.eventY
      // Stacked shadow
      svgEl('polygon', { points: `${px + 3},${yPos - S + 2} ${px + S + 3},${yPos + 2} ${px + 3},${yPos + S + 2} ${px - S + 3},${yPos + 2}`,
        fill: '#2a2820', stroke: '#3a3828', 'stroke-width': '1', 'pointer-events': 'none' }, g)
      svgEl('polygon', { points: `${px},${yPos - S} ${px + S},${yPos} ${px},${yPos + S} ${px - S},${yPos}`,
        fill: color + '22', stroke: color, 'stroke-width': '1.5', 'pointer-events': 'none' }, g)
      svgTxt(String(cluster.length), { x: px, y: yPos + 3.5, 'text-anchor': 'middle', fill: color, 'font-size': '8', 'font-weight': '700', 'font-family': 'sans-serif', 'pointer-events': 'none' }, g)
      svgEl('line', { x1: px, y1: yPos + S, x2: px, y2: opts.axisY, stroke: color + '33', 'stroke-width': '1', 'stroke-dasharray': '2 3', 'pointer-events': 'none' }, g)
      attachHit(px, yPos, S + 4)
    }
  })
}
