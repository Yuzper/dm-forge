// path: src/components/TimelineChronicle.tsx
// The Timeline page: the whole history on one vertical axis. Time runs down
// the page (or up, bottom-up); the spine in the middle is coloured by era and carries
// the sessions; every dated article is a lane beside it, a bar from its first
// date to its last with a shield at each end. Hover for the details, click to
// open, right-click for the entity's menu.
//
// Geometry lives in utils/chronicleLayout — this file only draws it, culls
// what's off screen, and handles zoom, search and the minimap.
//
// Clicking the spine (or a year on the ruler) takes a slice through that
// moment: everyone alive gets their age, everything ongoing its progress, in a
// panel and as chips on the bars. The date picker mounts this same component
// as `variant="picker"` — a compact strip where a click picks the day and the
// picked day is the slice.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LocateFixed, Search, Skull, SlidersHorizontal, Tags, X } from 'lucide-react'
import type { Arc } from '../types'
import { ARTICLE_TYPES } from './wiki/wikiConstants'
import { richTextToPlain } from '../utils/richText'
import {
  campaignPresentDay, formatCalendarDay, yearLength,
  type CampaignCalendar, type Era, type SessionRenderItem, type TimelineEventItem,
} from '../utils/timelineGeometry'
import type { Lifespan } from '../constants/timelineDates'
import { DEFAULT_TIMELINE_FILTERS, type TimelineFilters } from './TimelineFilterPanel'
import type { ChronologyIssue } from '../utils/chronologyAudit'
import {
  BADGE_HALF, ZOOM_PX_PER_YEAR,
  buildScale, buildSpine, buildTracks, clusterSpine, eraDays, gapLabel, packLanes, pickerWindow, rulerTicks, screenSpan, sliceAt, sliceValue,
  type ChronicleMark, type ChronicleTrack, type SliceEntry, type SpineSession,
} from '../utils/chronicleLayout'

const GUTTER = 64          // ruler column
const GUTTER_COMPACT = 44  // …in the picker
const SPINE_ZONE = 64      // spine + session badges
const SIDE_PAD = 20
const LANE_ICON = 38
// Vertical text is a fixed thin column (its length runs along the bar, not
// across lanes) — unlike horizontal labels, a lane only needs the badge plus
// a little clearance for that column, not room for the longest name.
const LANE_LABEL_GAP = 32
const CULL_PX = 500        // render this far past the viewport edges
const MINIMAP_W = 16
const DEFAULT_ZOOM = 9
const DEFAULT_PICKER_ZOOM = 12
const PLATE_H = 46         // era title plate
const PLATE_MIN_W = 150
const PLATE_MAX_W = 320    // longer era names are cut with an ellipsis

const KIND_FILTER_KEY = { event: 'events', death: 'deaths', quest: 'quests' } as const

const TYPE_META = Object.fromEntries(ARTICLE_TYPES.map(t => [t.value, t]))

const zoomKey = (campaignId: number) => `timeline-chronicle-zoom-${campaignId}`
const pickerZoomKey = (campaignId: number) => `timeline-picker-zoom-${campaignId}`
const LABELS_KEY = 'timeline-chronicle-labels'
const DIRECTION_KEY = 'timeline-chronicle-bottom-up'
const SIZE_KEY = 'timeline-chronicle-size'
const SIZE_MIN = 0.6
const SIZE_MAX = 1.8

function readNumber(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v == null ? fallback : Number(v) } catch { return fallback }
}

const NO_ISSUES: ChronologyIssue[] = []
const NO_BOUNDS: Record<number, { start?: number; end?: number }> = {}
const NO_STANDING: Record<number, true> = {}

const stepArrow: React.CSSProperties = {
  display: 'flex', height: 9, padding: 0, background: 'none', border: 'none',
  cursor: 'pointer', color: 'inherit', lineHeight: 0,
}

// The middle group mixes several types, so its heading names the ones present:
// "Places", "Places and factions", "Places, factions and religions"…
const ESTABLISHED_NOUNS: [type: string, noun: string][] = [
  ['location', 'places'], ['faction', 'factions'], ['religion', 'religions'],
  ['culture', 'cultures'], ['item', 'items'],
]
function establishedHeading(types: Set<string>): string | null {
  const nouns = ESTABLISHED_NOUNS.filter(([t]) => types.has(t)).map(([, n]) => n)
  if (nouns.length === 0) return null
  const text = nouns.length === 1 ? nouns[0] : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`
  return text[0].toUpperCase() + text.slice(1)
}

const SLICE_GROUPS = [
  { key: 'people', label: 'People' },
  { key: 'places', label: 'Established' },   // replaced by what's actually listed
  { key: 'happenings', label: 'Ongoing' },
] as const

type Hover =
  | { kind: 'track'; track: ChronicleTrack; mark?: ChronicleMark; rect: DOMRect }
  | { kind: 'sessions'; sessions: SpineSession[]; rect: DOMRect }

// ── Pieces ────────────────────────────────────────────────────────────────────

/** The shield every dated moment wears. Sized off the user's icon-scale slider. */
function Shield({ color, icon, flagged, count, scale = 1 }: { color: string; icon: ReactNode; flagged?: boolean; count?: number; scale?: number }) {
  const w = 25 * scale, h = 28 * scale
  return (
    <span style={{ position: 'relative', display: 'block', width: w, height: h }}>
      <svg width={w} height={h} viewBox="0 0 30 34" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d="M15 1.5 L27.5 6 V16.5 C27.5 24 22 29.5 15 32.5 C8 29.5 2.5 24 2.5 16.5 V6 Z"
          fill={`color-mix(in srgb, ${color} 20%, var(--bg-base))`}
          stroke={flagged ? 'var(--danger)' : color} strokeWidth={flagged ? 2.5 : 2} strokeLinejoin="round" />
      </svg>
      <span style={{ position: 'absolute', inset: `0 0 ${3 * scale}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
        {icon}
      </span>
      {count != null && count > 1 && (
        <span style={{
          position: 'absolute', right: -5, top: -4, minWidth: 14, height: 14, padding: '0 3px',
          borderRadius: 7, background: color, color: 'var(--bg-base)',
          fontSize: 9, fontWeight: 700, lineHeight: '14px', textAlign: 'center', fontFamily: 'var(--font-ui)',
        }}>{count}</span>
      )}
    </span>
  )
}

function typeIcon(type: string, size = 12) {
  const Icon = TYPE_META[type]?.icon
  return Icon ? <Icon size={size} strokeWidth={2.2} /> : null
}

// ── View ──────────────────────────────────────────────────────────────────────

export function TimelineChronicle({
  campaignId, eras, cal, sessions, arcMap, items, lifespans, bounds = NO_BOUNDS, standing = NO_STANDING, articles,
  filters = DEFAULT_TIMELINE_FILTERS, issues = NO_ISSUES, focus,
  onOpenSession, onOpenArticle, onTrackMenu, onSessionMenu,
  variant = 'page', selectedDay = 0, onPickDay, height = 300,
}: {
  campaignId: number
  eras: Era[]
  cal: CampaignCalendar
  sessions: SessionRenderItem[]
  arcMap: Record<number, Arc>
  items: TimelineEventItem[]
  lifespans: Lifespan[]
  /** Each article's start/end-role dates, for ages at a slice. */
  bounds?: Record<number, { start?: number; end?: number }>
  /** Articles marked as still around — their bars run to the present. */
  standing?: Record<number, true>
  articles: Record<number, { title: string; article_type: string }>
  filters?: TimelineFilters
  issues?: ChronologyIssue[]
  /** Scroll to this day when the nonce changes (e.g. picking a canon issue). */
  focus?: { day: number; nonce: number } | null
  onOpenSession?: (id: number) => void
  onOpenArticle?: (id: number) => void
  onTrackMenu?: (track: ChronicleTrack, e: React.MouseEvent) => void
  onSessionMenu?: (sessionId: number, e: React.MouseEvent) => void
  /** 'picker': the compact strip inside the date picker. */
  variant?: 'page' | 'picker'
  /** Picker: the chosen campaign day (0 = none yet). */
  selectedDay?: number
  onPickDay?: (day: number) => void
  /** Picker: fixed height in px. */
  height?: number
}) {
  const compact = variant === 'picker'
  const gutter = compact ? GUTTER_COMPACT : GUTTER
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoomState] = useState(() => Math.min(ZOOM_PX_PER_YEAR.length - 1, Math.max(0,
    compact ? readNumber(pickerZoomKey(campaignId), DEFAULT_PICKER_ZOOM) : readNumber(zoomKey(campaignId), DEFAULT_ZOOM))))
  const [labelsPref, setLabelsState] = useState(() => readNumber(LABELS_KEY, 0) === 1)
  const labels = !compact && labelsPref
  // Track lines, shields and dots all scale off this one slider.
  const [sizePref, setSizeState] = useState(() => Math.min(SIZE_MAX, Math.max(SIZE_MIN, readNumber(SIZE_KEY, 1))))
  const sizeScale = compact ? 1 : sizePref
  const badgeHalf = BADGE_HALF * sizeScale
  // Bottom-up puts the oldest date at the bottom and time flows up the page.
  const [reversed, setReversedState] = useState(() => readNumber(DIRECTION_KEY, 0) === 1)
  const [view, setView] = useState({ top: 0, w: 800, h: 600 })
  const [hover, setHover] = useState<Hover | null>(null)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [picker, setPicker] = useState<{ sessions: SpineSession[]; x: number; y: number } | null>(null)
  const [, bumpDesc] = useState(0)
  const descCache = useRef(new Map<number, string>())
  // Set before a zoom so the layout effect can keep this day under the cursor.
  const anchorRef = useRef<{ day: number; offset: number } | null>(null)
  // Until you scroll or zoom yourself, the view keeps re-centring on the
  // latest session: article dates load after sessions, and prepending older
  // history would otherwise push the present out of view.
  const userMovedRef = useRef(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Page: the moment the ages panel describes. Picker: always the picked day.
  const [pageSlice, setPageSlice] = useState<number | null>(null)
  const slice = compact ? (selectedDay || null) : pageSlice
  // Picker: the day the scale keeps linear space around. It trails the
  // selection while dragging, so the layout doesn't shift under the cursor.
  const [anchorDay, setAnchorDay] = useState(selectedDay || 1)
  const selectedRef = useRef(selectedDay)
  selectedRef.current = selectedDay
  const internalPickRef = useRef(false)

  const setZoom = (z: number) => {
    const next = Math.min(ZOOM_PX_PER_YEAR.length - 1, Math.max(0, z))
    setZoomState(next)
    try { localStorage.setItem(compact ? pickerZoomKey(campaignId) : zoomKey(campaignId), String(next)) } catch {}
  }
  const setLabels = (on: boolean) => {
    setLabelsState(on)
    try { localStorage.setItem(LABELS_KEY, on ? '1' : '0') } catch {}
  }
  const setSize = (v: number) => {
    const next = Math.min(SIZE_MAX, Math.max(SIZE_MIN, v))
    setSizeState(next)
    try { localStorage.setItem(SIZE_KEY, String(next)) } catch {}
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  // The campaign's present: the end of the latest dated session, else day 1.
  // Bars of anything still around (alive, active, standing) run up to it.
  const presentDay = useMemo(() => campaignPresentDay(sessions), [sessions])

  const tracks = useMemo(() => {
    const visible = items.filter(i => {
      // Events/deaths/quests each have their own row; everything else (a
      // character, a place, a faction…) is gated by its article type instead —
      // turning a type off hides every mark belonging to that kind of article,
      // deaths included.
      const kindKey = i.kind === 'article' ? null : KIND_FILTER_KEY[i.kind]
      if (kindKey && !filters[kindKey]) return false
      if (filters.types[i.article_type as keyof typeof filters.types] === false) return false
      if (filters.tags.length > 0 && !i.tags.some(t => filters.tags.includes(t))) return false
      return true
    })
    return buildTracks(visible, lifespans, articles, bounds, standing, presentDay)
  }, [items, lifespans, articles, filters, bounds, standing, presentDay])

  const spine = useMemo(
    () => filters.sessions ? buildSpine(sessions, arcMap) : [],
    [sessions, arcMap, filters.sessions],
  )

  const eraRanges = useMemo(
    () => filters.eras ? eras.map(e => ({ era: e, ...eraDays(e, cal) })).sort((a, b) => a.startDay - b.startDay) : [],
    [eras, cal, filters.eras],
  )

  // Errors pinned to the moment they contradict, as the outline did.
  const flags = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of issues) {
      if (i.severity !== 'error') continue
      const k = i.sessionId != null ? `s${i.sessionId}` : `a${i.articleId}@${i.day}`
      if (!m.has(k)) m.set(k, i.detail)
    }
    return m
  }, [issues])

  // ── Geometry ────────────────────────────────────────────────────────────────

  const pxPerYear = ZOOM_PX_PER_YEAR[zoom]
  const pxPerDay = pxPerYear / yearLength(cal)
  const scale = useMemo(() => buildScale([
    ...tracks.flatMap(t => t.marks.map(m => m.day)),
    ...tracks.filter(t => t.openEnd).map(t => t.endDay),
    ...spine.flatMap(s => [s.startDay, s.endDay]),
    ...eraRanges.flatMap(e => [e.startDay, e.endDay]),
    ...(compact ? pickerWindow(anchorDay, pxPerDay, view.h) : []),
  ], pxPerDay, reversed), [tracks, spine, eraRanges, pxPerDay, reversed, compact, anchorDay, view.h])

  const laneW = labels ? badgeHalf * 2 + LANE_LABEL_GAP : LANE_ICON

  const layout = useMemo(() => {
    const ext = tracks.map(t => {
      const [top, bottom] = screenSpan(scale, t.startDay, t.endDay)
      return { key: t.key, side: t.side, y0: top - badgeHalf - 2, y1: bottom + badgeHalf + 2 }
    })
    const left = packLanes(ext.filter(e => e.side === 'left'))
    const right = packLanes(ext.filter(e => e.side === 'right'))
    const leftCount = Math.max(0, ...left.values()) + (left.size ? 1 : 0)
    const rightCount = Math.max(0, ...right.values()) + (right.size ? 1 : 0)
    return { left, right, leftCount, rightCount }
  }, [tracks, scale, laneW])

  // Era plates and the slice's date pill sit centred on the spine and are much
  // wider than it, so the first lanes keep clear of them: at least one lane out
  // from where they used to start, and further when an era name is wider than
  // that. Measured from the real font so a long name never clips a shield.
  const [fontTick, setFontTick] = useState(0)
  useEffect(() => { document.fonts?.ready.then(() => setFontTick(n => n + 1)).catch(() => {}) }, [])
  // The picker is narrow, so its plates are smaller.
  const plateFs = compact ? 12 : 15
  const platePadX = compact ? 10 : 16
  const plateHalf = useMemo(() => {
    if (eraRanges.length === 0) return 0
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return PLATE_MIN_W / 2
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'serif'
    ctx.font = `${plateFs}px ${family}`
    let widest = 0
    // + the 0.03em letter spacing, the padding and a 2px border each side.
    for (const { era } of eraRanges) {
      widest = Math.max(widest, ctx.measureText(era.name).width + era.name.length * plateFs * 0.03 + platePadX * 2 + 4)
    }
    const min = compact ? 110 : PLATE_MIN_W
    return Math.min(PLATE_MAX_W, Math.max(min, widest)) / 2
  }, [eraRanges, fontTick, plateFs, platePadX, compact])
  const corridor = Math.max(SPINE_ZONE / 2 + LANE_ICON, plateHalf + 6)

  // The spine sits in the middle of the view whatever the lane counts are —
  // centring the whole block instead let a busier side (and the ruler) drag it
  // off-centre. It only moves right when the left lanes can't fit beside the
  // ruler; extra right lanes widen the canvas and scroll instead.
  const leftReach = SIDE_PAD + layout.leftCount * laneW + corridor
  const rightReach = SIDE_PAD + layout.rightCount * laneW + corridor
  const spineX = Math.max(view.w / 2, gutter + leftReach)
  const canvasW = Math.max(view.w, spineX + rightReach)

  /** Badge centre for a lane. With labels on, the badge sits at the spine-side edge. */
  const laneX = (side: 'left' | 'right', lane: number) => {
    const inner = corridor + lane * laneW + (labels ? badgeHalf + 4 : laneW / 2)
    return side === 'right' ? spineX + inner : spineX - inner
  }

  const clusters = useMemo(() => clusterSpine(spine, scale.y), [spine, scale])

  // Each era plate lives in an invisible box spanning its era and is CSS-sticky
  // inside it, so it pins to the top of the view while that era fills it and
  // rides off with the era's far edge. The box stops short of the next plate,
  // which is what makes a successor push its predecessor away.
  const plates = useMemo(() => {
    const list = eraRanges
      .map(e => { const [top, bottom] = screenSpan(scale, e.startDay, e.endDay); return { ...e, top, bottom } })
      .sort((a, b) => a.top - b.top)
    return list.map((p, i) => {
      const next = list[i + 1]
      const boxTop = p.top - PLATE_H / 2
      const boxBottom = Math.min(p.bottom, next ? next.top - PLATE_H / 2 - 4 : Infinity)
      return { era: p.era, boxTop, boxH: Math.max(PLATE_H, boxBottom - boxTop) }
    })
  }, [eraRanges, scale])

  const sliceEntries = useMemo(() => slice == null ? [] : sliceAt(tracks, slice), [tracks, slice])
  const sliceKeys = useMemo(() => new Set(sliceEntries.map(e => e.track.key)), [sliceEntries])

  const fromY = view.top - CULL_PX
  const toY = view.top + view.h + CULL_PX
  const ticks = useMemo(
    () => rulerTicks(scale, cal, pxPerYear, Math.max(0, view.top - 100), view.top + view.h + 100),
    [scale, cal, pxPerYear, view.top, view.h],
  )

  // ── Search ──────────────────────────────────────────────────────────────────

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return [] as { key: string; y: number }[]
    const out: { key: string; y: number }[] = []
    for (const t of tracks) {
      if (t.title.toLowerCase().includes(q) || t.marks.some(m => m.label.toLowerCase().includes(q))) {
        out.push({ key: t.key, y: scale.y(t.startDay) })
      }
    }
    for (const s of spine) {
      if (s.title.toLowerCase().includes(q)) out.push({ key: s.key, y: scale.y(s.startDay) })
    }
    return out.sort((a, b) => a.y - b.y)
  }, [q, tracks, spine, scale])
  const matchKeys = useMemo(() => new Set(matches.map(m => m.key)), [matches])
  // Search fades what doesn't match; a page slice fades articles that don't
  // exist at that moment (sessions stay — they're the frame of reference).
  const dimmed = (key: string) => (!!q && !matchKeys.has(key))
    || (!compact && slice != null && key.startsWith('a') && !sliceKeys.has(key))

  // ── Scrolling ───────────────────────────────────────────────────────────────

  const scrollToY = useCallback((y: number, smooth = true) => {
    const el = scrollerRef.current
    if (!el) return
    if (smooth) userMovedRef.current = true
    el.scrollTo({ top: Math.max(0, y - el.clientHeight / 2), behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const jumpToMatch = (i: number) => {
    if (matches.length === 0) return
    const idx = ((i % matches.length) + matches.length) % matches.length
    setMatchIndex(idx)
    scrollToY(matches[idx].y)
  }
  useEffect(() => { setMatchIndex(0); if (matches.length) scrollToY(matches[0].y) }, [q])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let frame = 0
    const read = () => setView({ top: el.scrollTop, w: el.clientWidth, h: el.clientHeight })
    const onScroll = () => { setHover(null); cancelAnimationFrame(frame); frame = requestAnimationFrame(read) }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    el.addEventListener('scroll', onScroll)
    read()
    return () => { ro.disconnect(); el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [])

  // Open on the campaign's present — the latest session — rather than on the
  // oldest thing anyone ever dated.
  useLayoutEffect(() => {
    if (userMovedRef.current) return
    const target = compact && selectedDay ? selectedDay : spine[spine.length - 1]?.startDay
    if (target != null) scrollToY(scale.y(target), false)
  }, [scale, spine, scrollToY])  // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the anchored day in place across a zoom.
  useLayoutEffect(() => {
    const a = anchorRef.current
    const el = scrollerRef.current
    if (!a || !el) return
    anchorRef.current = null
    el.scrollTop = Math.max(0, scale.y(a.day) - a.offset)
  }, [scale])

  // ── Picking (picker) and slicing (page) ─────────────────────────────────────

  const dayAtClient = (clientY: number) => {
    const r = canvasRef.current?.getBoundingClientRect()
    return scale.dayAt(r ? clientY - r.top : 0)
  }

  // Give the picked day its own linear stretch, without moving it on screen.
  const commitAnchor = (day: number) => {
    const el = scrollerRef.current
    if (!el || day === anchorDay) return
    anchorRef.current = { day, offset: scale.y(day) - el.scrollTop }
    setAnchorDay(day)
  }

  const pick = (day: number, commit = true) => {
    const d = Math.round(day)
    userMovedRef.current = true
    if (d !== selectedRef.current) internalPickRef.current = true
    onPickDay?.(d)
    if (commit) commitAnchor(d)
  }

  // A day typed into the picker's fields: bring it into view.
  useEffect(() => {
    if (!compact || !selectedDay) return
    if (internalPickRef.current) { internalPickRef.current = false; return }
    const el = scrollerRef.current
    if (selectedDay === anchorDay) { scrollToY(scale.y(selectedDay)); return }
    if (el) anchorRef.current = { day: selectedDay, offset: el.clientHeight / 2 }
    setAnchorDay(selectedDay)
  }, [selectedDay])  // eslint-disable-line react-hooks/exhaustive-deps

  // Dragging the gold line. The anchor only moves on release, so the scale
  // stays put under the cursor for the whole drag.
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    userMovedRef.current = true
    let last = compact ? selectedRef.current : (pageSlice ?? 0)
    const move = (ev: MouseEvent) => {
      last = Math.round(dayAtClient(ev.clientY))
      if (compact) pick(last, false)
      else setPageSlice(last)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      if (compact) commitAnchor(last)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const takeSlice = (day: number) => {
    if (compact) pick(day)
    else setPageSlice(Math.round(day))
  }
  // A year at a time (negative = earlier). While the line is on screen the page
  // scrolls with it, so it stays under the cursor for repeated clicks.
  const stepSlice = (years: number) => {
    if (pageSlice == null) return
    const next = pageSlice + years * yearLength(cal)
    const el = scrollerRef.current
    const oldY = scale.y(pageSlice), newY = scale.y(next)
    setPageSlice(next)
    if (!el) return
    userMovedRef.current = true
    if (oldY >= el.scrollTop && oldY <= el.scrollTop + el.clientHeight) el.scrollTop += newY - oldY
    else scrollToY(newY)
  }
  useEffect(() => {
    if (compact || pageSlice == null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPageSlice(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compact, pageSlice])

  // Flipping keeps whatever is in the middle of the view in the middle.
  const setDirection = (bottomUp: boolean) => {
    if (bottomUp === reversed) return
    const el = scrollerRef.current
    if (el) anchorRef.current = { day: scale.dayAt(el.scrollTop + el.clientHeight / 2), offset: el.clientHeight / 2 }
    userMovedRef.current = true
    setReversedState(bottomUp)
    try { localStorage.setItem(DIRECTION_KEY, bottomUp ? '1' : '0') } catch {}
  }

  const zoomAt = useCallback((next: number, clientY?: number) => {
    const el = scrollerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const offset = clientY != null ? clientY - rect.top : el.clientHeight / 2
    anchorRef.current = { day: scale.dayAt(el.scrollTop + offset), offset }
    userMovedRef.current = true
    setZoom(next)
  }, [scale])  // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd + wheel zooms about the cursor; a plain wheel scrolls as usual.
  // Native and non-passive, because React's wheel listener can't preventDefault.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomAt(zoom + (e.deltaY < 0 ? 1 : -1), e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, zoomAt])

  useEffect(() => {
    if (focus) scrollToY(scale.y(focus.day))
  }, [focus?.nonce])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Descriptions (lazy, for the tooltip) ────────────────────────────────────

  useEffect(() => {
    if (hover?.kind !== 'track') return
    const id = hover.track.articleId
    if (descCache.current.has(id)) return
    descCache.current.set(id, '')
    window.api.getArticle(id).then(a => {
      const text = richTextToPlain(a?.content ?? '')
      descCache.current.set(id, text.length > 260 ? `${text.slice(0, 257).trimEnd()}…` : text)
      bumpDesc(n => n + 1)
    }).catch(() => {})
  }, [hover])

  // ── Session clusters ────────────────────────────────────────────────────────

  // A cluster zooms in until its sessions separate; only sessions that share
  // a day at the deepest zoom need the list.
  const openCluster = (group: SpineSession[], e: React.MouseEvent) => {
    let minDelta = Infinity
    for (let i = 1; i < group.length; i++) minDelta = Math.min(minDelta, group[i].startDay - group[i - 1].startDay)
    const L = yearLength(cal)
    const needed = minDelta > 0 && isFinite(minDelta) ? (BADGE_HALF * 2 + 4) / minDelta * L : Infinity
    const next = ZOOM_PX_PER_YEAR.findIndex(p => p >= needed)
    if (next !== -1 && next > zoom) { zoomAt(next, e.clientY); return }
    setPicker({ sessions: group, x: e.clientX, y: e.clientY })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const empty = !compact && tracks.length === 0 && spine.length === 0
  const L = yearLength(cal)

  const tooltip = hover && (() => {
    const r = hover.rect
    const right = r.right + 300 < window.innerWidth
    const style: React.CSSProperties = {
      // Above the date picker's popover, which this can be mounted inside.
      position: 'fixed', zIndex: 400, width: 280, pointerEvents: 'none',
      top: Math.min(window.innerHeight - 180, Math.max(8, r.top - 8)),
      ...(right ? { left: r.right + 10 } : { left: Math.max(8, r.left - 290) }),
      background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 8,
      boxShadow: '0 10px 30px rgba(0,0,0,0.45)', padding: '10px 12px',
    }
    if (hover.kind === 'sessions') {
      return (
        <div style={style}>
          {hover.sessions.map(s => (
            <div key={s.key} style={{ marginBottom: hover.sessions.length > 1 ? 6 : 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-primary)' }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Session {s.badge}{s.arc ? ` · ${s.arc}` : ''}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                {formatCalendarDay(s.startDay, cal)}{s.endDay !== s.startDay ? ` to ${formatCalendarDay(s.endDay, cal)}` : ''}
              </div>
              {flags.get(s.key) && <FlagLine text={flags.get(s.key)!} />}
            </div>
          ))}
          {hover.sessions.length > 1 && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>Click to zoom in</div>}
        </div>
      )
    }
    const { track, mark } = hover
    const typeLabel = TYPE_META[track.articleType]?.label ?? track.articleType
    const desc = descCache.current.get(track.articleId)
    const flag = mark ? flags.get(`a${track.articleId}@${mark.day}`) : undefined
    const when = mark
      ? formatCalendarDay(mark.day, cal)
      : track.startDay === track.endDay
        ? formatCalendarDay(track.startDay, cal)
        : track.openEnd
          ? `${formatCalendarDay(track.startDay, cal)} to the present`
          : `${formatCalendarDay(track.startDay, cal)} to ${formatCalendarDay(track.endDay, cal)}`
    return (
      <div style={style}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>{track.title}</div>
        <div style={{ fontSize: 11, color: track.color, marginTop: 1 }}>
          {typeLabel}{mark?.label ? ` · ${mark.label}` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4 }}>{when}</div>
        {!mark && track.marks.length > 1 && (
          <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {track.marks.map((m, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--text-secondary)', minWidth: 58 }}>{m.label || 'Dated'}</span>
                {formatCalendarDay(m.day, cal)}
              </div>
            ))}
          </div>
        )}
        {desc && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 6, fontFamily: 'var(--font-body)' }}>{desc}</div>}
        {flag && <FlagLine text={flag} />}
      </div>
    )
  })()

  const hoverRect = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).getBoundingClientRect()

  const zoomControl = (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
      title="Zoom — Ctrl + scroll over the timeline also works">
      <button className="btn btn-ghost btn-sm" style={{ padding: compact ? '1px 6px' : '3px 7px' }} disabled={zoom === 0} onClick={() => zoomAt(zoom - 1)}>−</button>
      <span style={{ fontSize: 11, minWidth: 20, textAlign: 'center', color: 'var(--gold)', fontFamily: 'var(--font-ui)' }}>{zoom + 1}</span>
      <button className="btn btn-ghost btn-sm" style={{ padding: compact ? '1px 6px' : '3px 7px' }} disabled={zoom === ZOOM_PX_PER_YEAR.length - 1} onClick={() => zoomAt(zoom + 1)}>+</button>
    </div>
  )

  return (
    <div style={compact
      ? { height, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }
      : { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {compact ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Click to pick · drag the gold line</span>
          <div style={{ marginLeft: 'auto' }}>{zoomControl}</div>
        </div>
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="input" value={query} placeholder="Find on the timeline…"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') jumpToMatch(matchIndex + (e.shiftKey ? -1 : 1))
              if (e.key === 'Escape') setQuery('')
            }}
            style={{ width: 220, height: 28, fontSize: 12, paddingLeft: 26, paddingRight: q ? 26 : 8 }} />
          {q && (
            <button onClick={() => setQuery('')} title="Clear"
              style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>
        {q && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
            {matches.length ? `${matchIndex + 1} of ${matches.length}` : 'No matches'}
            <button className="btn btn-ghost btn-sm" style={{ padding: 2 }} disabled={!matches.length} onClick={() => jumpToMatch(matchIndex - 1)} title="Previous (Shift+Enter)"><ChevronUp size={13} /></button>
            <button className="btn btn-ghost btn-sm" style={{ padding: 2 }} disabled={!matches.length} onClick={() => jumpToMatch(matchIndex + 1)} title="Next (Enter)"><ChevronDown size={13} /></button>
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Size of the lines, shields and dots">
            <SlidersHorizontal size={12} style={{ color: 'var(--text-muted)' }} />
            <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={0.1} value={sizeScale}
              onChange={e => setSize(Number(e.target.value))}
              style={{ width: 70, accentColor: 'var(--gold)' }} />
          </span>
          <button className="btn btn-sm" onClick={() => setLabels(!labels)} title={labels ? 'Icons only' : 'Show names beside each entry'}
            style={labels ? { color: 'var(--gold)', borderColor: 'var(--border-gold)' } : undefined}>
            <Tags size={12} /> Names
          </button>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            {([[false, 'Top-down', ArrowDown, 'Oldest at the top — time flows down the page'],
               [true, 'Bottom-up', ArrowUp, 'Oldest at the bottom — time flows up the page']] as const).map(([rev, label, Icon, title]) => (
              <button key={label} className="btn btn-ghost btn-sm" onClick={() => setDirection(rev)} title={title}
                style={{ padding: '3px 8px', ...(reversed === rev ? { color: 'var(--gold)', background: 'var(--bg-hover)' } : {}) }}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" disabled={spine.length === 0}
            onClick={() => { const last = spine[spine.length - 1]; if (last) scrollToY(scale.y(last.startDay)) }}
            title="Jump to the latest session">
            <LocateFixed size={12} /> Now
          </button>
          {zoomControl}
        </div>
      </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        <div ref={scrollerRef} style={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative' }}
          onMouseDown={() => { setPicker(null); userMovedRef.current = true }}
          onWheel={() => { userMovedRef.current = true }}
          onKeyDown={() => { userMovedRef.current = true }}>
          {empty ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
              Nothing dated yet — add a date to a session or an article and it will appear here.
            </div>
          ) : (
            <div ref={canvasRef} style={{ position: 'relative', width: canvasW, height: scale.height }}>

              {/* Ruler: a faint rule across the page, the label in the gutter. */}
              {ticks.map(t => (
                <div key={`t${t.y}`} style={{ position: 'absolute', left: 0, right: 0, top: t.y, height: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: gutter, right: 0, borderTop: `1px solid ${t.major ? 'var(--border-light)' : 'var(--border)'}`, opacity: t.major ? 0.7 : 0.45 }} />
                  <span onClick={() => takeSlice(scale.dayAt(t.y))} className="hover-gold"
                    title={compact ? 'Pick this date' : 'See everyone’s age at this date'}
                    style={{
                      position: 'absolute', left: 0, width: gutter - 10, top: -7, textAlign: 'right', cursor: 'pointer', pointerEvents: 'auto',
                      fontSize: 10.5, fontFamily: 'var(--font-ui)', color: t.major ? 'var(--text-secondary)' : 'var(--text-muted)',
                    }}>{t.label}</span>
                </div>
              ))}

              {/* Collapsed stretches of empty time */}
              {scale.gaps.filter(g => g.y1 >= fromY && g.y0 <= toY).map(g => (
                <div key={`g${g.d0}`} style={{
                  position: 'absolute', left: 0, right: 0, top: g.y0, height: g.y1 - g.y0, pointerEvents: 'none',
                  background: 'repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--border) 45%, transparent) 7px 8px)',
                }}>
                  <span style={{
                    position: 'absolute', left: 4, width: gutter - 10, top: '50%', transform: 'translateY(-50%)',
                    textAlign: 'right', fontSize: 10, lineHeight: 1.25, color: 'var(--text-muted)', fontStyle: 'italic',
                  }}>{gapLabel(g.d1 - g.d0, cal)}<br />pass</span>
                </div>
              ))}

              {/* Spine, era-coloured */}
              <div style={{ position: 'absolute', left: spineX - 5, width: 10, top: 0, bottom: 0, background: 'var(--border)', borderRadius: 5 }} />
              {eraRanges.map(({ era, startDay, endDay }) => {
                const [y0, y1] = screenSpan(scale, startDay, endDay)
                if (y1 < fromY || y0 > toY) return null
                return (
                  <div key={era.id} style={{ position: 'absolute', left: spineX - 7, width: 14, top: y0, height: Math.max(2, y1 - y0), background: era.color, opacity: 0.85, borderRadius: 3 }} />
                )
              })}
              {scale.gaps.filter(g => g.y1 >= fromY && g.y0 <= toY).map(g => (
                <div key={`sg${g.d0}`} style={{
                  position: 'absolute', left: spineX - 8, width: 16, top: g.y0 + 6, height: g.y1 - g.y0 - 12,
                  background: 'repeating-linear-gradient(to bottom, var(--bg-base) 0 5px, transparent 5px 9px)',
                }} />
              ))}

              {/* Where a click takes a slice: the spine on the page, anywhere in
                  the picker. Beneath the badges and bars, which keep their own clicks. */}
              <div onClick={e => takeSlice(dayAtClient(e.clientY))}
                title={compact ? 'Click to pick this date' : 'Click to see everyone’s age at this moment'}
                style={{
                  position: 'absolute', top: 0, height: scale.height, zIndex: 0, cursor: 'crosshair',
                  ...(compact ? { left: 0, right: 0 } : { left: spineX - SPINE_ZONE / 2, width: SPINE_ZONE }),
                }} />

              {/* Era title plates — sticky; see `plates` above */}
              {plates.map(({ era, boxTop, boxH }) => {
                if (boxTop + boxH < fromY || boxTop > toY) return null
                return (
                  <div key={`p${era.id}`} style={{ position: 'absolute', left: spineX, width: 0, top: boxTop, height: boxH, zIndex: 5, pointerEvents: 'none' }}>
                    <div style={{
                      position: 'sticky', top: 8, height: PLATE_H, width: 'max-content', minWidth: compact ? 110 : PLATE_MIN_W, maxWidth: PLATE_MAX_W,
                      transform: 'translateX(-50%)', boxSizing: 'border-box',
                      padding: `6px ${platePadX}px`, textAlign: 'center', whiteSpace: 'nowrap',
                      background: 'var(--bg-surface)', border: `2px solid ${era.color}`, borderRadius: 8,
                      boxShadow: '0 0 0 3px var(--bg-base), 0 6px 18px rgba(0,0,0,0.4)',
                    }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: plateFs, lineHeight: '18px', color: era.color, letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{era.name}</div>
                      <div style={{ fontSize: 10, lineHeight: '14px', color: 'var(--text-muted)' }}>{era.startYear} – {era.endYear}</div>
                    </div>
                  </div>
                )
              })}

              {/* Sessions on the spine */}
              {clusters.map(({ y, sessions: group }) => {
                const first = group[0], last = group[group.length - 1]
                if (y < fromY || y > toY) return null
                const single = group.length === 1
                const flagged = group.some(s => flags.has(s.key))
                const faded = group.every(s => dimmed(s.key))
                return (
                  <div key={first.key}>
                    {single && first.endDay > first.startDay && (() => {
                      const [top, bottom] = screenSpan(scale, first.startDay, first.endDay)
                      return <div style={{ position: 'absolute', left: spineX - 3, width: 6, top, height: bottom - top, background: first.color, borderRadius: 3, opacity: faded ? 0.2 : 0.9, pointerEvents: 'none' }} />
                    })()}
                    <button
                      onClick={e => single
                        ? (compact ? pick(first.startDay) : onOpenSession?.(first.sessionId))
                        : openCluster(group, e)}
                      onContextMenu={e => single && onSessionMenu?.(first.sessionId, e)}
                      onMouseEnter={e => setHover({ kind: 'sessions', sessions: group, rect: hoverRect(e) })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        position: 'absolute', left: spineX, top: y, transform: 'translate(-50%, -50%)', zIndex: 2,
                        minWidth: 26, height: 26, padding: '0 6px', borderRadius: 13, cursor: 'pointer',
                        background: 'var(--bg-surface)', border: `2px solid ${flagged ? 'var(--danger)' : first.color}`,
                        color: 'var(--text-primary)', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-ui)',
                        boxShadow: '0 0 0 3px var(--bg-base)', opacity: faded ? 0.25 : 1, whiteSpace: 'nowrap',
                      }}>
                      {single ? first.badge : `${first.badge}–${last.badge}`}
                    </button>
                  </div>
                )
              })}

              {/* Article tracks */}
              {tracks.map(t => {
                const [y0, y1] = screenSpan(scale, t.startDay, t.endDay)
                if (y1 + badgeHalf < fromY || y0 - badgeHalf > toY) return null
                const lane = (t.side === 'left' ? layout.left : layout.right).get(t.key) ?? 0
                const x = laneX(t.side, lane)
                const faded = dimmed(t.key)
                // Too short to show both ends apart: one shield carrying the count.
                const short = y1 - y0 < badgeHalf * 2 + 4
                // A track still around has no closing shield: its later dates are dots
                // on the bar, and an arrow at the present says it carries on.
                const ends = short || t.openEnd || t.marks.length === 1 ? [t.marks[0]] : [t.marks[0], t.marks[t.marks.length - 1]]
                const mids = short ? [] : t.openEnd ? t.marks.slice(1) : t.marks.slice(1, -1)
                const common = {
                  // In the picker, a bar picks the day under the cursor.
                  onClick: (e: React.MouseEvent) => compact ? pick(dayAtClient(e.clientY)) : onOpenArticle?.(t.articleId),
                  onContextMenu: (e: React.MouseEvent) => onTrackMenu?.(t, e),
                  onMouseLeave: () => setHover(null),
                }
                return (
                  <div key={t.key} style={{ opacity: faded ? 0.22 : 1, transition: 'opacity 120ms' }}>
                    {!short && (
                      <TrackBar x={x} y0={y0} y1={y1} color={t.color} solid={t.solid} gaps={scale.gaps} scale={sizeScale}
                        {...common}
                        onMouseEnter={e => setHover({ kind: 'track', track: t, rect: hoverRect(e) })} />
                    )}
                    {mids.map((m, i) => (
                      <button key={`m${i}`} {...common}
                        onClick={() => compact ? pick(m.day) : onOpenArticle?.(t.articleId)}
                        onMouseEnter={e => setHover({ kind: 'track', track: t, mark: m, rect: hoverRect(e) })}
                        style={{
                          position: 'absolute', left: x, top: scale.y(m.day), transform: 'translate(-50%, -50%)', zIndex: 1,
                          width: 9 * sizeScale, height: 9 * sizeScale, padding: 0, borderRadius: '50%', cursor: 'pointer',
                          background: 'var(--bg-base)', border: `2px solid ${flags.has(`a${t.articleId}@${m.day}`) ? 'var(--danger)' : t.color}`,
                        }} />
                    ))}
                    {ends.map((m, i) => (
                      <button key={`e${i}`} {...common}
                        onClick={() => compact ? pick(m.day) : onOpenArticle?.(t.articleId)}
                        onMouseEnter={e => setHover({ kind: 'track', track: t, mark: short ? undefined : m, rect: hoverRect(e) })}
                        style={{
                          position: 'absolute', left: x, top: scale.y(m.day), transform: 'translate(-50%, -50%)', zIndex: 2,
                          padding: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'block',
                        }}>
                        <Shield color={t.color} scale={sizeScale}
                          icon={m.kind === 'death' ? <Skull size={12 * sizeScale} strokeWidth={2.2} /> : typeIcon(t.articleType, 12 * sizeScale)}
                          flagged={short ? t.marks.some(mm => flags.has(`a${t.articleId}@${mm.day}`)) : flags.has(`a${t.articleId}@${m.day}`)}
                          count={short ? t.marks.length : undefined} />
                      </button>
                    ))}
                    {t.openEnd && !short && (
                      <span style={{
                        position: 'absolute', left: x, top: scale.y(t.endDay), transform: 'translate(-50%, -50%)', zIndex: 1,
                        display: 'flex', color: t.color, pointerEvents: 'none',
                      }}>
                        {reversed ? <ChevronUp size={16} strokeWidth={3} /> : <ChevronDown size={16} strokeWidth={3} />}
                      </span>
                    )}
                    {labels && (
                      <span onClick={common.onClick} onContextMenu={common.onContextMenu}
                        onMouseEnter={e => setHover({ kind: 'track', track: t, rect: hoverRect(e) })}
                        onMouseLeave={common.onMouseLeave}
                        style={{
                          position: 'absolute', top: (y0 + y1) / 2, height: Math.max(y1 - y0, 32), zIndex: 2, cursor: 'pointer',
                          writingMode: 'vertical-rl', textOrientation: 'mixed',
                          ...(t.side === 'right'
                            ? { left: x + badgeHalf + 8, transform: 'translateY(-50%)' }
                            : { left: x - badgeHalf - 8, transform: 'translate(-100%, -50%)' }),
                          fontSize: 11.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textShadow: '0 1px 3px var(--bg-base), 0 0 6px var(--bg-base)',
                        }}>
                        {t.title}
                      </span>
                    )}
                  </div>
                )
              })}

              {/* The slice: a line through the moment, its date on the spine, and
                  an age or progress chip on every bar it crosses. */}
              {slice != null && (() => {
                const y = scale.y(slice)
                return (
                  <>
                    <div style={{
                      position: 'absolute', left: gutter, right: 0, top: y, zIndex: 4, pointerEvents: 'none',
                      borderTop: `${compact ? 2 : 1.5}px ${compact ? 'solid' : 'dashed'} var(--gold)`, opacity: 0.9,
                    }} />
                    <div onMouseDown={startDrag} title="Drag to move through time"
                      style={{ position: 'absolute', left: gutter, right: 0, top: y - (compact ? 7 : 4), height: compact ? 14 : 8, zIndex: 6, cursor: 'ns-resize' }} />
                    <div onMouseDown={compact ? undefined : startDrag} style={{
                      position: 'absolute', left: spineX, top: y, transform: 'translate(-50%, -50%)', zIndex: 7,
                      display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                      background: 'var(--gold)', color: 'var(--bg-base)', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-ui)',
                      boxShadow: '0 0 0 3px var(--bg-base)', pointerEvents: compact ? 'none' : 'auto', cursor: compact ? undefined : 'ns-resize',
                    }}>
                      {formatCalendarDay(slice, cal)}
                      {!compact && (<>
                        {/* ▲ moves the line up the page, ▼ down — which way in
                            time depends on the direction the timeline runs. */}
                        <span style={{ display: 'flex', flexDirection: 'column', marginLeft: 1 }}>
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => stepSlice(reversed ? 1 : -1)}
                            title={reversed ? 'A year later' : 'A year earlier'} style={stepArrow}>
                            <ChevronUp size={10} strokeWidth={3} />
                          </button>
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => stepSlice(reversed ? -1 : 1)}
                            title={reversed ? 'A year earlier' : 'A year later'} style={stepArrow}>
                            <ChevronDown size={10} strokeWidth={3} />
                          </button>
                        </span>
                        <button onMouseDown={e => e.stopPropagation()} onClick={() => setPageSlice(null)} title="Clear (Esc)"
                          style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>
                          <X size={11} />
                        </button>
                      </>)}
                    </div>
                    {sliceEntries.map(entry => {
                      const t = entry.track
                      const [y0, y1] = screenSpan(scale, t.startDay, t.endDay)
                      if (y < y0 - badgeHalf || y > y1 + badgeHalf) return null
                      const lane = (t.side === 'left' ? layout.left : layout.right).get(t.key) ?? 0
                      return (
                        <span key={`c${t.key}`} style={{
                          position: 'absolute', left: laneX(t.side, lane), top: y, transform: 'translate(-50%, -50%)', zIndex: 5,
                          padding: '0 5px', borderRadius: 8, background: t.color, color: 'var(--bg-base)', pointerEvents: 'none',
                          fontSize: 10, fontWeight: 700, lineHeight: '15px', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
                          boxShadow: '0 0 0 2px var(--bg-base)',
                        }}>{sliceValue(entry, L).short}</span>
                      )
                    })}
                  </>
                )
              })()}
            </div>
          )}
        </div>

        {!compact && slice != null && (
          <SlicePanel
            day={slice} cal={cal} entries={sliceEntries} right={MINIMAP_W + 12}
            onStep={stepSlice} onClose={() => setPageSlice(null)}
            onOpen={id => onOpenArticle?.(id)}
          />
        )}

        {!empty && !compact && (
          <Minimap
            height={view.h} contentH={scale.height} top={view.top}
            eras={eraRanges.map(e => { const [y0, y1] = screenSpan(scale, e.startDay, e.endDay); return { key: e.era.id, color: e.era.color, y0, y1 } })}
            marks={[
              ...tracks.map(t => { const [y0, y1] = screenSpan(scale, t.startDay, t.endDay); return { key: t.key, color: t.color, side: t.side, y0, y1 } }),
              ...spine.map(sp => { const [y0, y1] = screenSpan(scale, sp.startDay, sp.endDay); return { key: sp.key, color: 'var(--gold)', side: 'mid' as const, y0, y1 } }),
            ]}
            onScrollTo={y => {
              userMovedRef.current = true
              const el = scrollerRef.current
              if (el) el.scrollTop = Math.max(0, y - el.clientHeight / 2)
            }}
          />
        )}
      </div>

      {tooltip}

      {picker && (
        <div onMouseDown={e => e.stopPropagation()} style={{
          position: 'fixed', left: Math.min(picker.x + 12, window.innerWidth - 260), top: Math.min(picker.y - 10, window.innerHeight - 40 - picker.sessions.length * 30),
          zIndex: 401, width: 240, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)', padding: 4,
        }}>
          {picker.sessions.map(s => (
            <button key={s.key} className="hover-bg" onClick={() => { setPicker(null); if (compact) pick(s.startDay); else onOpenSession?.(s.sessionId) }}
              style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 8px', background: 'none', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: s.color, flexShrink: 0 }}>S{s.badge}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Everyone and everything that exists at the slice, with how long it has. */
function SlicePanel({ day, cal, entries, right, onStep, onClose, onOpen }: {
  day: number
  cal: CampaignCalendar
  entries: SliceEntry[]
  right: number
  onStep: (years: number) => void
  onClose: () => void
  onOpen: (articleId: number) => void
}) {
  const L = yearLength(cal)
  const stepBtn: React.CSSProperties = { display: 'flex', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)' }
  return (
    <div data-map-overlay style={{
      position: 'absolute', top: 10, right, width: 264, maxHeight: 'calc(100% - 20px)', zIndex: 20,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 8,
      boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 8px 6px 10px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => onStep(-1)} title="A year earlier" style={stepBtn} className="hover-gold"><ChevronLeft size={14} /></button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold)' }}>{formatCalendarDay(day, cal)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            {entries.length === 0 ? 'Nothing dated spans this moment' : `${entries.length} alive or ongoing`}
          </div>
        </div>
        <button onClick={() => onStep(1)} title="A year later" style={stepBtn} className="hover-gold"><ChevronRight size={14} /></button>
        <button onClick={onClose} title="Close (Esc)" style={stepBtn} className="hover-text"><X size={13} /></button>
      </div>
      <div style={{ overflowY: 'auto', padding: '4px 0 6px' }}>
        {SLICE_GROUPS.map(g => {
          const list = entries.filter(e => e.group === g.key)
          if (list.length === 0) return null
          return (
            <div key={g.key} style={{ paddingTop: 4 }}>
              <div style={{ padding: '4px 12px 2px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {(g.key === 'places' && establishedHeading(new Set(list.map(e => e.track.articleType)))) || g.label} · {list.length}
              </div>
              {list.map(e => {
                const v = sliceValue(e, L)
                // Marked as still around and before the present: known, not assumed.
                const open = e.total == null && !(e.track.openEnd && day <= e.track.endDay)
                return (
                  <button key={e.track.key} onClick={() => onOpen(e.track.articleId)} className="hover-bg"
                    title={open ? `${e.track.title} — no end date, so still counted at this moment` : e.track.title}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.track.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.track.title}
                    </span>
                    <span style={{ fontSize: 11.5, color: open ? 'var(--text-muted)' : 'var(--text-secondary)', fontStyle: open ? 'italic' : 'normal', flexShrink: 0 }}>
                      {v.long}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FlagLine({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>
      <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} /> {text}
    </div>
  )
}

/**
 * The bar between a track's first and last date. Where it crosses a collapsed
 * gap it turns dotted, so a 900-year lifespan doesn't read as a short one.
 */
function TrackBar({ x, y0, y1, color, solid, gaps, scale = 1, onClick, onContextMenu, onMouseEnter, onMouseLeave }: {
  x: number; y0: number; y1: number; color: string; solid: boolean
  gaps: { y0: number; y1: number }[]
  /** The user's icon/line-size slider. */
  scale?: number
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}) {
  const pieces: { a: number; b: number; dotted: boolean }[] = []
  let cur = y0
  for (const g of gaps) {
    if (g.y1 <= cur || g.y0 >= y1) continue
    if (g.y0 > cur) pieces.push({ a: cur, b: g.y0, dotted: false })
    pieces.push({ a: Math.max(cur, g.y0), b: Math.min(y1, g.y1), dotted: true })
    cur = Math.min(y1, g.y1)
  }
  if (cur < y1) pieces.push({ a: cur, b: y1, dotted: false })

  const fill = solid ? color : `repeating-linear-gradient(to bottom, ${color} 0 7px, transparent 7px 12px)`
  const hitW = 10 * scale, lineW = (solid ? 4 : 2) * scale
  return (
    <>
      {pieces.map((p, i) => (
        <div key={i} onClick={onClick} onContextMenu={onContextMenu} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
          style={{
            position: 'absolute', left: x - hitW / 2, width: hitW, top: p.a, height: p.b - p.a, cursor: 'pointer',
            display: 'flex', justifyContent: 'center',
          }}>
          <div style={{
            width: lineW, height: '100%', borderRadius: 2, opacity: 0.9,
            background: p.dotted ? `repeating-linear-gradient(to bottom, ${color} 0 3px, transparent 3px 8px)` : fill,
          }} />
        </div>
      ))}
    </>
  )
}

/** The whole timeline squeezed into a strip: eras, every entry, and the viewport. */
function Minimap({ height, contentH, top, eras, marks, onScrollTo }: {
  height: number; contentH: number; top: number
  eras: { key: string; color: string; y0: number; y1: number }[]
  marks: { key: string; color: string; side: 'left' | 'right' | 'mid'; y0: number; y1: number }[]
  onScrollTo: (contentY: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const k = height / Math.max(1, contentH)
  const toContent = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    return (clientY - r.top) / k
  }
  const onDown = (e: React.MouseEvent) => {
    onScrollTo(toContent(e.clientY))
    const move = (ev: MouseEvent) => onScrollTo(toContent(ev.clientY))
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }
  const x = { left: 1, mid: 6, right: 11 } as const
  return (
    <div ref={ref} onMouseDown={onDown} title="Drag to scroll the timeline"
      style={{ width: MINIMAP_W, flexShrink: 0, position: 'relative', cursor: 'ns-resize', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}>
      {eras.map(e => (
        <div key={e.key} style={{ position: 'absolute', left: 5, width: 6, top: e.y0 * k, height: Math.max(1, (e.y1 - e.y0) * k), background: e.color, opacity: 0.55 }} />
      ))}
      {marks.map(m => (
        <div key={m.key} style={{ position: 'absolute', left: x[m.side], width: 4, top: m.y0 * k, height: Math.max(1, (m.y1 - m.y0) * k), background: m.color, opacity: 0.8 }} />
      ))}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: top * k, height: Math.max(8, height * k),
        border: '1px solid var(--gold)', background: 'color-mix(in srgb, var(--gold) 12%, transparent)', borderRadius: 2,
        pointerEvents: 'none',
      }} />
    </div>
  )
}
