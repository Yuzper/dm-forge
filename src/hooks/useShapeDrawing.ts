// path: src/hooks/useShapeDrawing.ts
// The drawing/editing state machine for map shapes, shared by the world map and
// article/session maps. It is deliberately coordinate-agnostic: the host passes
// a `toPercent(clientX, clientY)` converter, because the two surfaces measure
// from different origins (the hub map sits below a 34px tab strip).
//
// Persistence follows the POI convention already in the codebase — move points
// locally while dragging, write once on mouseup — so a drag never waits on a
// round-trip.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CreateMapShapeInput, MapShape, MapTool, ShapePoint, ShapeTool } from '../types'
import { isShapeTool } from '../types'
import {
  MIN_POLYGON_POINTS, boxIsTooSmall, clampPercent, normalizeBox, parsePoints,
  pointsFromBox, screenDistance, serializePoints, shapeTypeForTool, translatePoints,
  type PixelBox, type ShapeDraft,
} from '../utils/mapShapeGeometry'

// Click radius (screen px) for "I clicked the first vertex, close the polygon".
const CLOSE_HIT_PX = 12
// Movement past this (screen px) turns a click into a drag.
const DRAG_THRESHOLD_PX = 3

export interface UseShapeDrawingArgs {
  mapId: number | null
  /** Layer new shapes are filed under; null files them as unfiled. */
  activeLayerId: number | null
  setShapes: React.Dispatch<React.SetStateAction<MapShape[]>>
  box: PixelBox | null
  scale: number
  /**
   * The host's active tool — the single source of truth. The hook only acts on
   * shape tools; 'select' enables editing an existing shape, and anything else
   * (pin, measure) leaves shapes alone entirely.
   */
  tool: MapTool
  /** False in read mode: shapes stay visible but nothing can be drawn or edited. */
  enabled: boolean
  defaultFill: string
  defaultStroke: string
  /** Called after a shape is drawn, so the host can open its edit modal. */
  onCreated?: (shape: MapShape) => void
  /**
   * A drawing gesture finished, so the host should drop back to 'select'. Also
   * fired when Esc abandons a draft — the tool is the host's to reset.
   */
  onToolFinished?: () => void
}

export function useShapeDrawing({
  mapId, activeLayerId, setShapes, box, scale, tool: mapTool, enabled,
  defaultFill, defaultStroke, onCreated, onToolFinished,
}: UseShapeDrawingArgs) {
  // The shape primitive being drawn, or null when the host's tool isn't one.
  const tool: ShapeTool | null = enabled && isShapeTool(mapTool) ? mapTool : null
  // Shapes may be selected and reshaped only under the select tool.
  const editing = enabled && mapTool === 'select'

  const [draft, setDraft] = useState<ShapeDraft | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Optimistic geometry during a drag; the DB write happens on mouseup.
  const [livePoints, setLivePoints] = useState<{ id: number; points: ShapePoint[] } | null>(null)

  // Read inside document-level listeners, which close over stale state otherwise.
  const draftRef = useRef<ShapeDraft | null>(null)
  draftRef.current = draft
  const boxRef = useRef<PixelBox | null>(box)
  boxRef.current = box
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const toPercentRef = useRef<((clientX: number, clientY: number) => ShapePoint | null) | null>(null)

  /** Host wires its own client→percent conversion in here. */
  const setToPercent = useCallback((fn: (clientX: number, clientY: number) => ShapePoint | null) => {
    toPercentRef.current = fn
  }, [])

  // Set while a body drag actually moved, so the click that follows mouseup
  // opens nothing. Mirrors POIMarker's hasDragged guard.
  const suppressClickRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  // Switching map, leaving edit mode, or moving to a non-shape tool must not
  // strand a half-drawn polygon on the canvas.
  useEffect(() => {
    setDraft(null)
    setLivePoints(null)
  }, [mapId, tool])

  // Only the select tool can hold a selection; anything else clears it so
  // stale handles don't linger over a shape you can no longer edit.
  useEffect(() => {
    if (!editing) setSelectedId(null)
  }, [editing, mapId])

  const cancelDraft = useCallback(() => setDraft(null), [])

  // ── Committing ──────────────────────────────────────────────────────────────

  const commitDraft = useCallback(async (points: ShapePoint[], toolUsed: ShapeTool) => {
    setDraft(null)
    if (mapId == null) return
    const shapeType = shapeTypeForTool(toolUsed)
    const enough = shapeType === 'ellipse' ? points.length >= 2 : points.length >= MIN_POLYGON_POINTS
    if (!enough) return

    const input: CreateMapShapeInput = {
      map_id: mapId,
      layer_id: activeLayerId,
      label: '',
      shape_type: shapeType,
      points: serializePoints(points),
      fill_color: defaultFill,
      stroke_color: defaultStroke,
    }
    const created = await window.api.createMapShape(input)
    setShapes(prev => [...prev, created])
    setSelectedId(created.id)
    // Ask the host to drop back to Select so the new shape's handles are usable
    // at once — drawing five kingdoms in a row is rarer than drawing one and
    // naming it.
    onToolFinished?.()
    onCreated?.(created)
  }, [mapId, activeLayerId, defaultFill, defaultStroke, setShapes, onCreated, onToolFinished])

  const closePolygon = useCallback(() => {
    const d = draftRef.current
    if (!d || d.tool !== 'polygon') return
    if (d.points.length < MIN_POLYGON_POINTS) return
    void commitDraft(d.points, 'polygon')
  }, [commitDraft])

  // ── Canvas interaction: polygon (click to place) ────────────────────────────

  /** Host calls this from its canvas onClick. Returns true if it consumed the click. */
  const handleCanvasClick = useCallback((pt: ShapePoint): boolean => {
    if (!enabled || tool !== 'polygon') return false
    const d = draftRef.current
    const b = boxRef.current

    if (d && d.points.length >= MIN_POLYGON_POINTS && b &&
        screenDistance(pt, d.points[0], b, scaleRef.current) < CLOSE_HIT_PX) {
      void commitDraft(d.points, 'polygon')
      return true
    }

    setDraft(prev => prev
      ? { ...prev, points: [...prev.points, pt], cursor: pt }
      : {
          tool: 'polygon', shapeType: 'polygon', points: [pt], cursor: pt,
          fillColor: defaultFill, strokeColor: defaultStroke,
        })
    return true
  }, [enabled, tool, commitDraft, defaultFill, defaultStroke])

  /** Rubber-band update; host calls from canvas onMouseMove. */
  const handleCanvasMouseMove = useCallback((pt: ShapePoint) => {
    if (!enabled || tool !== 'polygon') return
    setDraft(prev => prev ? { ...prev, cursor: pt } : prev)
  }, [enabled, tool])

  /** Host calls from canvas onDoubleClick. */
  const handleCanvasDoubleClick = useCallback((): boolean => {
    if (!enabled || tool !== 'polygon' || !draftRef.current) return false
    closePolygon()
    return true
  }, [enabled, tool, closePolygon])

  // ── Canvas interaction: box tools (drag out a rect/triangle/ellipse) ────────

  /**
   * Host calls this from its canvas onMouseDown *before* its own pan logic and
   * skips panning when it returns true — otherwise the map would slide around
   * underneath the shape being dragged out.
   */
  const handleCanvasMouseDown = useCallback((pt: ShapePoint, e: React.MouseEvent): boolean => {
    if (!enabled || !tool || tool === 'polygon' || e.button !== 0) return false
    e.preventDefault()

    const anchor = pt
    const activeTool = tool
    // Tracked in the closure, not read back from draftRef: the ref only
    // refreshes on re-render, so a drag finished inside a single frame would
    // otherwise see a stale (or null) draft on mouseup and commit nothing.
    let latestBox = normalizeBox(anchor, anchor)
    let latestPoints = pointsFromBox(activeTool, latestBox)

    setDraft({
      tool: activeTool, shapeType: shapeTypeForTool(activeTool),
      points: latestPoints, cursor: anchor,
      fillColor: defaultFill, strokeColor: defaultStroke,
    })

    const onMove = (ev: MouseEvent) => {
      const p = toPercentRef.current?.(ev.clientX, ev.clientY)
      if (!p) return
      // Shift constrains to a square in *screen* space, which is what the eye
      // judges — a square in percent space would look stretched.
      let corner = p
      const b = boxRef.current
      if (ev.shiftKey && b && b.w > 0 && b.h > 0) {
        const dxPx = (p.x - anchor.x) / 100 * b.w
        const dyPx = (p.y - anchor.y) / 100 * b.h
        const side = Math.max(Math.abs(dxPx), Math.abs(dyPx))
        corner = {
          x: clampPercent(anchor.x + Math.sign(dxPx || 1) * side / b.w * 100),
          y: clampPercent(anchor.y + Math.sign(dyPx || 1) * side / b.h * 100),
        }
      }
      latestBox = normalizeBox(anchor, corner)
      latestPoints = pointsFromBox(activeTool, latestBox)
      setDraft(prev => prev ? { ...prev, points: latestPoints, cursor: corner } : prev)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      cleanupRef.current = null
      // A click that never became a drag shouldn't leave a sliver behind.
      if (boxIsTooSmall(latestBox)) { setDraft(null); return }
      void commitDraft(latestPoints, activeTool)
    }

    cleanupRef.current = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return true
  }, [enabled, tool, defaultFill, defaultStroke, commitDraft])

  // ── Editing an existing shape ───────────────────────────────────────────────

  const persistPoints = useCallback(async (id: number, points: ShapePoint[]) => {
    const updated = await window.api.updateMapShape(id, { points: serializePoints(points) })
    setShapes(prev => prev.map(s => s.id === updated.id ? updated : s))
    setLivePoints(null)
  }, [setShapes])

  // Shared scaffolding for the three drag gestures: track from a start point,
  // rebuild the geometry on each move, persist once on release.
  const beginPointDrag = useCallback((
    shape: MapShape,
    e: React.MouseEvent,
    startPoints: ShapePoint[],
    apply: (start: ShapePoint[], from: ShapePoint, to: ShapePoint) => ShapePoint[],
    // Write even if the pointer never moved — used when the gesture itself
    // already changed the geometry (inserting a vertex from a midpoint handle).
    alwaysPersist = false,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const from = toPercentRef.current?.(e.clientX, e.clientY)
    if (!from) return
    const startClient = { x: e.clientX, y: e.clientY }
    let latest = startPoints
    let moved = false
    suppressClickRef.current = false

    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startClient.x) > DRAG_THRESHOLD_PX ||
          Math.abs(ev.clientY - startClient.y) > DRAG_THRESHOLD_PX) {
        moved = true
      }
      const to = toPercentRef.current?.(ev.clientX, ev.clientY)
      if (!to) return
      latest = apply(startPoints, from, to)
      setLivePoints({ id: shape.id, points: latest })
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      cleanupRef.current = null
      if (moved || alwaysPersist) {
        if (moved) suppressClickRef.current = true
        void persistPoints(shape.id, latest)
      } else {
        setLivePoints(null)
      }
    }

    cleanupRef.current = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [persistPoints])

  const onVertexDown = useCallback((shape: MapShape, index: number, e: React.MouseEvent) => {
    if (!editing) return
    setSelectedId(shape.id)
    const start = parsePoints(shape.points)
    beginPointDrag(shape, e, start, (pts, _from, to) =>
      pts.map((p, i) => i === index ? { x: clampPercent(to.x), y: clampPercent(to.y) } : p))
  }, [editing, beginPointDrag])

  // Dragging a midpoint inserts a new vertex there and drags it in one gesture.
  const onMidpointDown = useCallback((shape: MapShape, index: number, e: React.MouseEvent) => {
    if (!editing || shape.shape_type !== 'polygon') return
    setSelectedId(shape.id)
    const original = parsePoints(shape.points)
    const mid = {
      x: (original[index].x + original[(index + 1) % original.length].x) / 2,
      y: (original[index].y + original[(index + 1) % original.length].y) / 2,
    }
    const inserted = [...original.slice(0, index + 1), mid, ...original.slice(index + 1)]
    const newIndex = index + 1
    // Show the new vertex immediately, then let the drag position it. The write
    // happens on mouseup even for a plain click, since the point exists either way.
    setLivePoints({ id: shape.id, points: inserted })
    beginPointDrag(shape, e, inserted, (pts, _from, to) =>
      pts.map((p, i) => i === newIndex ? { x: clampPercent(to.x), y: clampPercent(to.y) } : p), true)
  }, [editing, beginPointDrag])

  const onBodyDown = useCallback((shape: MapShape, e: React.MouseEvent) => {
    if (!editing) return
    setSelectedId(shape.id)
    const start = parsePoints(shape.points)
    beginPointDrag(shape, e, start, (pts, from, to) =>
      translatePoints(pts, to.x - from.x, to.y - from.y))
  }, [editing, beginPointDrag])

  /** True when the click that just fired was the tail of a drag. */
  const consumeSuppressedClick = useCallback(() => {
    const s = suppressClickRef.current
    suppressClickRef.current = false
    return s
  }, [])

  // ── Vertex removal ──────────────────────────────────────────────────────────

  const removeVertex = useCallback(async (shape: MapShape, index: number) => {
    if (shape.shape_type !== 'polygon') return
    const points = parsePoints(shape.points)
    // A polygon needs three corners; refuse rather than silently degrade it.
    if (points.length <= MIN_POLYGON_POINTS) return
    await persistPoints(shape.id, points.filter((_, i) => i !== index))
  }, [persistPoints])

  const onVertexContextMenu = useCallback((shape: MapShape, index: number, e: React.MouseEvent) => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    void removeVertex(shape, index)
  }, [editing, removeVertex])

  // ── Deleting ────────────────────────────────────────────────────────────────

  const deleteShape = useCallback(async (id: number) => {
    await window.api.deleteMapShape(id)
    setShapes(prev => prev.filter(s => s.id !== id))
    setSelectedId(prev => prev === id ? null : prev)
    setLivePoints(prev => prev?.id === id ? null : prev)
  }, [setShapes])

  // ── Keyboard ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in.
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return

      // Esc unwinds one step at a time: abandon the draft, then put the tool
      // back to Select, then drop the selection.
      if (e.key === 'Escape') {
        if (draftRef.current) { setDraft(null); e.preventDefault() }
        else if (tool) { onToolFinished?.(); e.preventDefault() }
        else if (selectedId != null) { setSelectedId(null); e.preventDefault() }
        return
      }
      if (e.key === 'Enter' && draftRef.current?.tool === 'polygon') {
        closePolygon(); e.preventDefault(); return
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && draftRef.current) {
        // Mid-draw these drop the last vertex rather than deleting a shape.
        setDraft(prev => {
          if (!prev) return prev
          const next = prev.points.slice(0, -1)
          return next.length ? { ...prev, points: next } : null
        })
        e.preventDefault(); return
      }
      if (e.key === 'Delete' && selectedId != null) {
        void deleteShape(selectedId); e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, tool, selectedId, closePolygon, deleteShape, onToolFinished])

  return {
    /** The active shape primitive, or null when the host's tool isn't one. */
    tool,
    /** True when shapes may be selected and reshaped (select tool, not read mode). */
    editing,
    draft,
    selectedId, setSelectedId,
    livePoints,
    setToPercent,
    handleCanvasClick,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasDoubleClick,
    onVertexDown, onMidpointDown, onBodyDown, onVertexContextMenu,
    /** Drop a corner. Exposed so the host can offer it as a menu item. */
    removeVertex,
    consumeSuppressedClick,
    deleteShape,
    cancelDraft,
    /** True while a box tool is mid-drag or a polygon is unfinished. */
    isDrawing: draft != null,
  }
}
