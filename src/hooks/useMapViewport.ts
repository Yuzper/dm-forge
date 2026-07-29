// path: src/hooks/useMapViewport.ts
// Pan, zoom and image fitting for a map surface — the maths the world map and
// article/session maps had two near-identical copies of.
//
// The two surfaces differ in exactly two ways, both parameters here: the hub map
// sits under a 34px tab strip that every client→image conversion must subtract
// (`topInset`), and they persist their viewport under different localStorage
// keys (`storagePrefix`).
//
// Everything is mirrored into refs alongside state because the pan/zoom
// listeners run outside React's render cycle and would otherwise read stale
// values mid-gesture.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShapePoint } from '../types'

export const MIN_SCALE = 0.2
export const MAX_SCALE = 8
const ZOOM_SPEED = 0.001
// Movement past this many pixels turns a click into a pan.
const PAN_THRESHOLD_PX = 3

export interface ImgBounds { left: number; top: number; w: number; h: number }

export interface UseMapViewportArgs {
  /** Viewport is stored and restored per map. */
  mapId: number | null
  /** localStorage key prefix, e.g. 'map-view' → 'map-view-12'. */
  storagePrefix: string
  /** Pixels of chrome above the canvas inside the measured container. */
  topInset?: number
}

export function useMapViewport({ mapId, storagePrefix, topInset = 0 }: UseMapViewportArgs) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [scale, setScaleState] = useState(1)
  const [offset, setOffsetState] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  // Plain setters that write the ref first — no save logic here, which is what
  // keeps them free of stale-closure problems.
  const setScale = useCallback((v: number) => { scaleRef.current = v; setScaleState(v) }, [])
  const setOffset = useCallback((v: { x: number; y: number }) => { offsetRef.current = v; setOffsetState(v) }, [])

  // ── Image fitting ───────────────────────────────────────────────────────────
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ w: width, h: Math.max(0, height - topInset) })
    })
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: Math.max(0, el.clientHeight - topInset) })
    return () => ro.disconnect()
  }, [topInset])

  // The image is drawn with object-fit: contain, so the visible picture is a
  // letterboxed box inside the container. Percent coordinates resolve against
  // *this* box, not the container — that's what keeps pins and shapes glued to
  // the artwork when the panel resizes.
  const imgBounds = useMemo<ImgBounds | null>(() => {
    if (!imgNatural || containerSize.w === 0 || containerSize.h === 0) return null
    const s = Math.min(containerSize.w / imgNatural.w, containerSize.h / imgNatural.h)
    const w = imgNatural.w * s
    const h = imgNatural.h * s
    return { left: (containerSize.w - w) / 2, top: (containerSize.h - h) / 2, w, h }
  }, [imgNatural, containerSize])

  const imgBoundsRef = useRef<ImgBounds | null>(imgBounds)
  imgBoundsRef.current = imgBounds

  /** Wire to the <img>'s onLoad to pick up its natural dimensions. */
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
  }, [])

  // ── Persistence ─────────────────────────────────────────────────────────────
  // Restore on map change; a map never seen before opens at 1× centred.
  useEffect(() => {
    setImgNatural(null)
    if (mapId == null) return
    const saved = localStorage.getItem(`${storagePrefix}-${mapId}`)
    if (saved) {
      try {
        const { scale: s, offset: o } = JSON.parse(saved)
        setScale(s); setOffset(o)
        return
      } catch { /* corrupt entry → fall through to the default view */ }
    }
    setScale(1); setOffset({ x: 0, y: 0 })
  }, [mapId, storagePrefix, setScale, setOffset])

  // Debounced save, flushed synchronously on cleanup so navigating away never
  // discards an unsaved position.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (mapId == null) return
    const key = `${storagePrefix}-${mapId}`
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ scale, offset }))
      saveTimerRef.current = null
    }, 300)
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        localStorage.setItem(key, JSON.stringify({ scale, offset }))
      }
    }
  }, [scale, offset, mapId, storagePrefix])

  // ── Zoom ────────────────────────────────────────────────────────────────────
  // Zoom about a point: keep whatever sits under the cursor pinned there.
  const zoomAbout = useCallback((cx: number, cy: number, nextScale: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
    const factor = clamped / scaleRef.current
    const o = offsetRef.current
    setScale(clamped)
    setOffset({ x: cx - factor * (cx - o.x), y: cy - factor * (cy - o.y) })
  }, [setScale, setOffset])

  const handleWheel = useCallback((e: WheelEvent) => {
    // Panels that float over the map (a feature popup, the Contents panel, the
    // travel panel) scroll their own content, and their wheel events bubble to
    // this listener. Zooming the map out from under them — and preventDefault'ing
    // their scroll — made those scrollbars draggable-only.
    if ((e.target as Element | null)?.closest?.('[data-map-overlay]')) return
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAbout(
      e.clientX - rect.left,
      e.clientY - rect.top - topInset,
      scaleRef.current * (1 + -e.deltaY * ZOOM_SPEED),
    )
  }, [zoomAbout, topInset])

  // Non-passive so preventDefault actually stops the page scrolling.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const viewCentre = useCallback(() => {
    const el = containerRef.current
    if (!el) return { cx: 0, cy: 0 }
    return { cx: el.offsetWidth / 2, cy: (el.offsetHeight - topInset) / 2 }
  }, [topInset])

  const zoomIn = useCallback(() => {
    const { cx, cy } = viewCentre()
    zoomAbout(cx, cy, scaleRef.current * 1.25)
  }, [viewCentre, zoomAbout])

  const zoomOut = useCallback(() => {
    const { cx, cy } = viewCentre()
    zoomAbout(cx, cy, scaleRef.current * 0.8)
  }, [viewCentre, zoomAbout])

  const resetView = useCallback(() => {
    setScale(1); setOffset({ x: 0, y: 0 })
  }, [setScale, setOffset])

  /** Centre the viewport on a percent-space point, keeping the current zoom. */
  const centreOn = useCallback((pt: ShapePoint) => {
    const ib = imgBoundsRef.current
    if (!ib || containerSize.w === 0 || containerSize.h === 0) return
    const cx = ib.left + pt.x / 100 * ib.w
    const cy = ib.top + pt.y / 100 * ib.h
    setOffset({
      x: containerSize.w / 2 - scaleRef.current * cx,
      y: containerSize.h / 2 - scaleRef.current * cy,
    })
  }, [containerSize, setOffset])

  // ── Panning ─────────────────────────────────────────────────────────────────
  const panStart = useRef<{ mouseX: number; mouseY: number; ox: number; oy: number } | null>(null)
  const hasPanned = useRef(false)
  const isPanning = useRef(false)

  // Hosts call these from their own handlers, after any tool-specific checks
  // that might claim the gesture first (drawing a box, for instance).
  const panDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    panStart.current = { mouseX: e.clientX, mouseY: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
    hasPanned.current = false
    isPanning.current = false
  }, [])

  const panMove = useCallback((e: React.MouseEvent) => {
    if (!panStart.current) return
    const dx = e.clientX - panStart.current.mouseX
    const dy = e.clientY - panStart.current.mouseY
    if (Math.abs(dx) > PAN_THRESHOLD_PX || Math.abs(dy) > PAN_THRESHOLD_PX) {
      hasPanned.current = true
      isPanning.current = true
    }
    if (isPanning.current) setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy })
  }, [setOffset])

  const panUp = useCallback(() => {
    panStart.current = null
    isPanning.current = false
  }, [])

  /** True if the gesture just ended was a pan — hosts use it to swallow the click. */
  const consumePan = useCallback(() => {
    const panned = hasPanned.current
    hasPanned.current = false
    return panned
  }, [])

  // ── Coordinates ─────────────────────────────────────────────────────────────
  /** Client coordinates → 0–100 percentages of the fitted image box. */
  const toPercent = useCallback((clientX: number, clientY: number): ShapePoint | null => {
    const el = containerRef.current
    const ib = imgBoundsRef.current
    if (!el || !ib) return null
    const rect = el.getBoundingClientRect()
    const innerX = (clientX - rect.left - offsetRef.current.x) / scaleRef.current
    const innerY = (clientY - rect.top - topInset - offsetRef.current.y) / scaleRef.current
    return {
      x: Math.max(0, Math.min(100, (innerX - ib.left) / ib.w * 100)),
      y: Math.max(0, Math.min(100, (innerY - ib.top) / ib.h * 100)),
    }
  }, [topInset])

  /** Percent-space point → position within the container, for popups. */
  const toContainerPoint = useCallback((pt: ShapePoint) => {
    const ib = imgBoundsRef.current
    const o = offsetRef.current
    if (!ib) return { x: o.x, y: topInset + o.y }
    return {
      x: o.x + (ib.left + pt.x / 100 * ib.w) * scaleRef.current,
      y: topInset + o.y + (ib.top + pt.y / 100 * ib.h) * scaleRef.current,
    }
  }, [topInset])

  return {
    containerRef,
    scale, offset, scaleRef, offsetRef, setScale, setOffset,
    imgNatural, imgBounds, imgBoundsRef, onImageLoad, containerSize,
    zoomIn, zoomOut, resetView, zoomAbout, centreOn,
    panDown, panMove, panUp, consumePan, hasPanned,
    toPercent, toContainerPoint,
  }
}
