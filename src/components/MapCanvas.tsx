// path: src/components/MapCanvas.tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useMapContext } from '../context/MapContext'
import { MapPin, Maximize, List } from 'lucide-react'
import type { MapShape, MapTool, POI } from '../types'
import { isShapeTool } from '../types'
import { useStore } from '../store/store'
import MapPOIMarker, { poiColor } from './map/MapPOIMarker'
import MapShapeLayer from './map/MapShapeLayer'
import MeasureOverlay from './map/MeasureOverlay'
import MapContentsPanel, { type VisitsSection } from './map/MapContentsPanel'
import TravelMeasurePanel from './map/TravelMeasurePanel'
import MapToolbar, { toolHint } from './map/MapToolbar'
import ShapePopup from './map/ShapePopup'
import ShapeEditModal from './map/ShapeEditModal'
import { useMapShapes } from '../hooks/useMapShapes'
import { useMapViewport } from '../hooks/useMapViewport'
import { useMapMeasure } from '../hooks/useMapMeasure'
import { useShapeDrawing } from '../hooks/useShapeDrawing'
import { centroidOf, parsePoints } from '../utils/mapShapeGeometry'
import { parseHubLinks } from '../utils/hubLinks'
import { useContextMenu, useMenuCtx } from '../hooks/useContextMenu'
import { openItems, truncate, type MenuItem } from '../utils/contextMenus'

// Fixed pin diameter on article and session maps.
const POI_MARKER_SIZE = 28

function POIMarker({ poi, onSelect, onContextMenu, isSelected, editMode, scale, imgBoundsRef, ghost }: {
  poi: POI; onSelect: (p: POI) => void; onContextMenu?: (p: POI, e: React.MouseEvent) => void
  isSelected: boolean; editMode: boolean; scale: number
  imgBoundsRef: React.RefObject<{ left: number; top: number; w: number; h: number } | null>
  // Ghost markers come from another visit layer: shown dimmed for reference,
  // hoverable for the label but not selectable or draggable.
  ghost?: boolean
}) {
  const { updatePOI, optimisticMovePOI } = useMapContext()

  const dragStart = useRef<{ mouseX: number; mouseY: number; poiX: number; poiY: number } | null>(null)
  const hasDragged = useRef(false)
  const onMoveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const onUpRef = useRef<((e: MouseEvent) => void) | null>(null)

  useEffect(() => {
    return () => {
      if (onMoveRef.current) document.removeEventListener('mousemove', onMoveRef.current)
      if (onUpRef.current) document.removeEventListener('mouseup', onUpRef.current)
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editMode || ghost) return
    e.stopPropagation()
    e.preventDefault()

    const outer = (e.currentTarget as HTMLElement).closest('[data-map-outer]') as HTMLElement
    if (!outer) return
    const rect = outer.getBoundingClientRect()

    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, poiX: poi.x, poiY: poi.y }
    hasDragged.current = false

    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return
      if (Math.abs(ev.clientX - dragStart.current.mouseX) > 3 ||
          Math.abs(ev.clientY - dragStart.current.mouseY) > 3) {
        hasDragged.current = true
      }
      const ib = imgBoundsRef.current
      const bw = ib ? ib.w : rect.width
      const bh = ib ? ib.h : rect.height
      const dx = ((ev.clientX - dragStart.current.mouseX) / (bw * scale)) * 100
      const dy = ((ev.clientY - dragStart.current.mouseY) / (bh * scale)) * 100
      const newX = Math.max(0, Math.min(100, dragStart.current.poiX + dx))
      const newY = Math.max(0, Math.min(100, dragStart.current.poiY + dy))
      optimisticMovePOI(poi.id, newX, newY)
    }

    const onUp = async (ev: MouseEvent) => {
      if (!dragStart.current) return
      const ib = imgBoundsRef.current
      const bw = ib ? ib.w : rect.width
      const bh = ib ? ib.h : rect.height
      const dx = ((ev.clientX - dragStart.current.mouseX) / (bw * scale)) * 100
      const dy = ((ev.clientY - dragStart.current.mouseY) / (bh * scale)) * 100
      const newX = Math.max(0, Math.min(100, dragStart.current.poiX + dx))
      const newY = Math.max(0, Math.min(100, dragStart.current.poiY + dy))
      dragStart.current = null
      if (hasDragged.current) await updatePOI(poi.id, { x: newX, y: newY })
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      onMoveRef.current = null
      onUpRef.current = null
    }

    onMoveRef.current = onMove
    onUpRef.current = onUp
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [editMode, poi, updatePOI, optimisticMovePOI, scale])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (ghost) return
    if (!hasDragged.current) onSelect(poi)
    hasDragged.current = false
  }

  const color = poiColor(poi)

  return (
    <MapPOIMarker
      poi={poi}
      // Article and session maps use one fixed pin size: these are floor plans,
      // not a world map, so per-pin sizing would just be noise.
      size={POI_MARKER_SIZE}
      scale={scale}
      selected={isSelected}
      ghost={ghost}
      draggable={editMode && !ghost}
      onSelect={(_p, e) => handleClick(e)}
      onMouseDown={(_p, e) => handleMouseDown(e)}
      onContextMenu={ghost ? undefined : onContextMenu}
    >
      {isSelected && (
        <div style={{
          position: 'absolute', inset: -6, borderRadius: '50%',
          border: `1px solid ${color}44`,
          animation: 'pulse 2s infinite', pointerEvents: 'none',
        }} />
      )}
    </MapPOIMarker>
  )
}

export default function MapCanvas({ readMode }: { readMode?: boolean }) {
  const { currentMap, pois, selectedPOI, selectPOI, createPOI, deletePOI, patchMap,
          activeLayerId, ghostLayerIds, showBaseLayer,
          visitLayers, toggleGhostLayer, toggleBaseLayer, renameVisitLayer } = useMapContext()
  const editMode = !readMode
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()

  // Visit-layer visibility: the active layer is live; base POIs (layer_id
  // null) are live only while the base layer is shown (hidden by default on
  // attached maps); toggled layers render as ghosts; the rest stay hidden.
  const active = activeLayerId ?? null
  const ghosts = ghostLayerIds ?? []
  const showBase = showBaseLayer ?? true
  const livePois = pois.filter(p => p.layer_id == null ? showBase : p.layer_id === active)
  const ghostPois = pois.filter(p => p.layer_id != null && p.layer_id !== active && ghosts.includes(p.layer_id))
  // The Contents list indexes what's on the canvas, so hiding a visit takes its
  // pins out of the list too — same rule the sidebar uses, extended to ghosts.
  const visiblePois = [...livePois, ...ghostPois]

  // The Contents panel's Visits section. Absent unless a session has run this
  // map (or there's a base layer to hide, which only attached maps have).
  const visits: VisitsSection | null =
    toggleGhostLayer && ((visitLayers?.length ?? 0) > 0 || toggleBaseLayer)
      ? {
          layers: visitLayers ?? [],
          ghostLayerIds: ghosts,
          onToggleGhost: toggleGhostLayer,
          currentLayerId: active,
          base: toggleBaseLayer
            ? { label: 'Place (base)', shown: showBase, onToggle: toggleBaseLayer }
            : undefined,
          onRename: renameVisitLayer,
        }
      : null
  // Mirrors the old Layers button's badge: how many extra layers are showing.
  const extraLayersOn = ghosts.length + (toggleBaseLayer && showBase ? 1 : 0)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Pan, zoom, image fitting and viewport persistence all live in the shared
  // hook — this surface has no tab strip, so no top inset.
  const vp = useMapViewport({ mapId: currentMap?.id ?? null, storagePrefix: 'map-view' })
  const {
    containerRef: outerRef, scale, offset, scaleRef, offsetRef,
    imgBounds, imgBoundsRef, onImageLoad, containerSize,
    zoomIn, zoomOut, resetView, centreOn, toPercent, toContainerPoint, imgNatural,
  } = vp

  const [cursorStyle, setCursorStyle] = useState('grab')

  // ── Drawing shapes (districts, zones, wards…) ─────────────────────────────
  const { currentCampaign, sessions, navigateToArticleByTitle, navigateToSessionById } = useStore()
  // One tool owns canvas clicks, matching the world map. 'select' is the
  // resting state — which is what finally makes a drawn region clickable on an
  // article map, where POI placement used to be permanently armed.
  const [tool, setTool] = useState<MapTool>('select')
  const backToSelect = useCallback(() => setTool('select'), [])
  // One panel lists everything on the map: pins, session visits, drawing layers.
  // Whether it's open is remembered, like its individual sections.
  const [showContents, setShowContents] = useState(() => localStorage.getItem('map-contents') === 'true')
  const setContentsOpen = (open: boolean) => {
    localStorage.setItem('map-contents', String(open))
    setShowContents(open)
  }
  const [selectedShape, setSelectedShape] = useState<MapShape | null>(null)
  const [shapePopupPos, setShapePopupPos] = useState<{ top: number; left: number } | null>(null)
  const [editingShape, setEditingShape] = useState<MapShape | null>(null)
  const [hoveredShapeId, setHoveredShapeId] = useState<number | null>(null)
  const [articleList, setArticleList] = useState<{ id: number; title: string }[]>([])
  const [poiListFilter, setPoiListFilter] = useState('')
  const [hoveredPoiId, setHoveredPoiId] = useState<number | null>(null)

  // Measuring works the same here as on the world map; a city or dungeon map
  // just needs its own scale calibrating first.
  const measure = useMapMeasure({ map: currentMap, onMapPatched: patchMap })
  const measureMode = tool === 'measure'

  // Only fetched when the link picker can actually be opened.
  useEffect(() => {
    if (!editingShape || !currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then(list =>
      setArticleList(list.map(a => ({ id: a.id, title: a.title }))))
  }, [editingShape, currentCampaign?.id])

  const shapeStore = useMapShapes(currentMap?.id ?? null)

  const drawing = useShapeDrawing({
    mapId: currentMap?.id ?? null,
    activeLayerId: shapeStore.activeLayerId,
    setShapes: shapeStore.setShapes,
    box: imgBounds,
    scale,
    tool,
    enabled: editMode,
    defaultFill: '#c8a84b',
    defaultStroke: '#c8a84b',
    onCreated: shape => setEditingShape(shape),
    onToolFinished: backToSelect,
  })

  useEffect(() => { drawing.setToPercent(toPercent) }, [drawing.setToPercent, toPercent])

  // Read mode never draws; leaving the map or entering read mode drops the tools.
  useEffect(() => { if (readMode) setTool('select') }, [readMode])

  // Every tool that places something gets the crosshair; Select still pans.
  const placing = editMode && tool !== 'select'

  useEffect(() => {
    setCursorStyle(placing ? 'crosshair' : 'grab')
  }, [placing])

  const lockedLayerIds = shapeStore.layers.filter(l => l.locked === 1).map(l => l.id)
  // Same rule as the hub map: shapes take clicks when viewing or selecting, but
  // never while a draw tool is armed or POIs are being placed.
  const shapesInteractive = tool === 'select'

  // The hook restores the saved viewport on map change; this only loads the image.
  useEffect(() => {
    setImageLoaded(false)
    if (!currentMap) { setImageUrl(null); return }
    window.api.getImagePath(currentMap.image_path).then(setImageUrl)
  }, [currentMap?.id, currentMap?.image_path])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    // A box tool claims this drag for the shape it's drawing.
    const pt = toPercent(e.clientX, e.clientY)
    if (pt && drawing.handleCanvasMouseDown(pt, e)) return
    vp.panDown(e)
    setCursorStyle('grabbing')
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (drawing.tool === 'polygon') {
      const pt = toPercent(e.clientX, e.clientY)
      if (pt) drawing.handleCanvasMouseMove(pt)
    }
    vp.panMove(e)
  }

  const handleMouseUp = () => {
    vp.panUp()
    setCursorStyle(placing ? 'crosshair' : 'grab')
  }

  // Canvas-space position of a pin, for snapping a measure click onto it.
  const nearestPoi = (px: number, py: number, thresh: number): POI | null => {
    let best: POI | null = null
    let bestD = thresh
    for (const poi of pois) {
      const p = toContainerPoint(poi)
      const d = Math.hypot(p.x - px, p.y - py)
      if (d < bestD) { bestD = d; best = poi }
    }
    return best
  }

  const focusPOIFromList = (poi: POI) => {
    centreOn(poi)
    // Ghosted pins belong to another visit and aren't clickable on the canvas
    // either — centre on one, but don't open it for editing.
    if (livePois.some(p => p.id === poi.id)) selectPOI(poi)
  }

  /**
   * Where a pointer event landed, in image-space percentages (plus the raw
   * container coords the pin-snapping needs). Null when it missed the image.
   */
  const pointFromEvent = useCallback((e: React.MouseEvent) => {
    const outer = outerRef.current
    if (!outer || !imgBoundsRef.current) return null
    const rect = outer.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const innerX = (cx - offsetRef.current.x) / scaleRef.current
    const innerY = (cy - offsetRef.current.y) / scaleRef.current
    const { left: iL, top: iT, w: iW, h: iH } = imgBoundsRef.current
    const x = (innerX - iL) / iW * 100
    const y = (innerY - iT) / iH * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return null
    return { x, y, cx, cy }
  }, [outerRef, imgBoundsRef, offsetRef, scaleRef])

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    if (vp.consumePan()) return
    const pt = pointFromEvent(e)
    if (!pt) return
    const { x, y, cx, cy } = pt

    if (measureMode) {
      // Snap onto a pin if the click lands near one, so room-to-room measuring
      // starts from the marker rather than approximately near it.
      let mx = x, my = y
      const snap = nearestPoi(cx, cy, 16)
      if (snap) { mx = snap.x; my = snap.y }
      measure.addPoint(mx, my, snap?.label)
      return
    }

    // A shape tool takes the click to place a vertex.
    if (drawing.handleCanvasClick({ x, y })) return

    if (tool === 'pin') {
      if (!editMode || readMode) return
      await createPOI(x, y)
      // The new pin opens in the sidebar, so hand the canvas back to Select.
      backToSelect()
      return
    }

    // Select: reaching here means the click missed everything. Shape clicks
    // stop propagating before this.
    if (tool === 'select') {
      drawing.setSelectedId(null)
      if (selectedShape) { setSelectedShape(null); setShapePopupPos(null) }
    }
  }, [editMode, readMode, createPOI, tool, drawing, selectedShape, backToSelect, measureMode, measure, pointFromEvent, vp])

  // ── Context menus ───────────────────────────────────────────────────────────

  const poiMenu = useCallback((poi: POI, e: React.MouseEvent) => {
    const links = parseHubLinks(poi.hub_links)
    const article = links.find(l => l.type === 'wiki' && l.article_id)
    const session = links.find(l => l.type === 'session' && l.session_id)
    const menu: MenuItem[] = []
    // A pin's links are the reason to right-click it: the pin is a pointer, and
    // the thing it points at is what you actually want open beside the map.
    if (article) {
      menu.push(...openItems(
        { type: 'article', articleId: article.article_id! }, menuCtx,
        `Open “${truncate(article.title ?? 'linked article')}”`,
      ))
    }
    if (session) {
      menu.push({
        label: `Open ${truncate(session.name ?? 'linked session')}`,
        click: () => menuCtx.go({ type: 'session', sessionId: session.session_id! }),
      })
    }
    if (menu.length) menu.push({ type: 'separator' })
    menu.push({ label: 'Pin details', click: () => selectPOI(poi) })
    if (editMode && !readMode) {
      menu.push({ type: 'separator' }, {
        label: `Delete “${truncate(poi.label || 'this pin')}”`,
        click: () => void deletePOI(poi.id),
      })
    }
    showMenu(e, menu)
  }, [menuCtx, showMenu, selectPOI, deletePOI, editMode, readMode])

  const shapeMenu = useCallback((shape: MapShape, e: React.MouseEvent) => {
    const links = parseHubLinks(shape.hub_links)
    const article = links.find(l => l.type === 'wiki' && l.article_id)
    const menu: MenuItem[] = []
    if (article) {
      menu.push(...openItems(
        { type: 'article', articleId: article.article_id! }, menuCtx,
        `Open “${truncate(article.title ?? 'linked article')}”`,
      ), { type: 'separator' })
    }
    menu.push({ label: 'Edit region…', click: () => setEditingShape(shape) })
    if (editMode && !readMode) {
      menu.push(
        // Reshaping needs the handles up; this is the only way to ask for them
        // without first hunting the shape down in the Contents list.
        { label: 'Edit points', click: () => { setTool('select'); drawing.setSelectedId(shape.id) } },
        { type: 'separator' },
        {
          label: `Delete “${truncate(shape.label || 'this region')}”`,
          click: async () => {
            await drawing.deleteShape(shape.id)
            setSelectedShape(prev => prev?.id === shape.id ? null : prev)
          },
        },
      )
    }
    showMenu(e, menu)
  }, [menuCtx, showMenu, editMode, readMode, drawing])

  // Bare canvas. Creation lives here as well as in the toolbar because placing
  // something *at a spot* is inherently positional — the toolbar can only mean
  // "next click", which is a worse way to say the same thing.
  const canvasMenu = useCallback((e: React.MouseEvent) => {
    // Null off the image — the letterboxed margin, or a map whose image hasn't
    // loaded. Only the positional items need a point; the view actions are
    // always offered, so no part of the canvas is a dead right-click.
    const pt = pointFromEvent(e)
    const menu: MenuItem[] = []
    if (pt && editMode && !readMode) {
      menu.push({ label: 'New point of interest here', click: () => void createPOI(pt.x, pt.y) })
    }
    if (pt && measure.mapScale) {
      menu.push({
        label: measureMode ? 'Add a waypoint here' : 'Measure from here',
        click: () => { setTool('measure'); measure.addPoint(pt.x, pt.y) },
      })
    }
    if (menu.length) menu.push({ type: 'separator' })
    menu.push({ label: 'Reset view', click: resetView })
    // Nothing to ring: the target is the viewport itself, and outlining the
    // whole map would say less than saying nothing.
    showMenu(e, menu, { target: null })
  }, [pointFromEvent, editMode, readMode, createPOI, measure, measureMode, resetView, showMenu])

  // ── Shape interactions ────────────────────────────────────────────────────
  // The popup opens where the pointer landed, clamped inside the canvas. A
  // region has no single obvious anchor the way a pin does, and the click point
  // is the part of it the user was actually looking at.
  const popupPosFromClick = (clientX: number, clientY: number) => {
    const outer = outerRef.current
    if (!outer) return { top: 12, left: 12 }
    const rect = outer.getBoundingClientRect()
    const popW = 224, popH = 200
    let left = clientX - rect.left + 12
    let top = clientY - rect.top - 12
    if (left + popW > rect.width - 4) left = Math.max(4, clientX - rect.left - popW - 12)
    if (top + popH > rect.height - 8) top = Math.max(4, rect.height - popH - 8)
    return { top, left }
  }

  const handleShapeClick = (shape: MapShape, e: React.MouseEvent) => {
    // The click that ends a drag was a move, not a selection.
    if (drawing.consumeSuppressedClick()) return
    // Clicking the already-open shape closes it again.
    if (selectedShape?.id === shape.id) {
      drawing.setSelectedId(null)
      setSelectedShape(null)
      setShapePopupPos(null)
      return
    }
    drawing.setSelectedId(shape.id)
    setSelectedShape(shape)
    setShapePopupPos(popupPosFromClick(e.clientX, e.clientY))
  }

  const handleSaveShape = async (result: Parameters<typeof shapeStore.updateShape>[1]) => {
    if (!editingShape) return
    const updated = await shapeStore.updateShape(editingShape.id, result)
    setSelectedShape(prev => prev?.id === updated.id ? updated : prev)
    setEditingShape(null)
  }

  const handleDeleteShape = async () => {
    if (!editingShape) return
    await drawing.deleteShape(editingShape.id)
    setEditingShape(null)
    setSelectedShape(null)
  }

  // Recentre the viewport on a shape chosen from the layer panel.
  const focusShape = (shape: MapShape) => {
    const centre = centroidOf(shape.shape_type, parsePoints(shape.points))
    if (centre) centreOn(centre)
    drawing.setSelectedId(shape.id)
    setSelectedShape(shape)
    // Focused from the list, so the shape is now centred — anchor there.
    setShapePopupPos({ top: containerSize.h / 2 - 16, left: containerSize.w / 2 + 12 })
  }

  if (!currentMap) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
        <MapPin size={40} strokeWidth={1} color="var(--border-light)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No map selected</div>
          <div style={{ fontSize: 13 }}>Import a map image to get started</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Tool strip — top-left, clear of the zoom cluster on the right. Read
          mode gets no tools, only the layer switchboard. */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 30, display: 'flex', alignItems: 'flex-start', gap: 6 }}
        onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        {editMode && (
          <MapToolbar
            tool={tool}
            available={['select', 'pin', 'polygon', 'rect', 'triangle', 'ellipse', 'measure']}
            onPick={next => {
              setTool(next)
              if (isShapeTool(next)) setContentsOpen(true)
              if (next !== 'select') { setSelectedShape(null); setShapePopupPos(null) }
            }}
          />
        )}
        <button
          onClick={() => setContentsOpen(!showContents)}
          title={showContents ? 'Hide contents' : 'Everything on this map: points, visits, layers'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: showContents ? 'rgba(200,115,58,0.2)' : 'rgba(21,18,14,0.85)',
            border: `1px solid ${showContents ? 'rgba(200,115,58,0.4)' : 'var(--border-light)'}`,
            color: showContents ? '#c8733a' : 'var(--text-secondary)',
            borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
            backdropFilter: 'blur(8px)', transition: 'all var(--transition)',
          }}
        >
          <List size={12} /> Contents{extraLayersOn > 0 ? ` +${extraLayersOn}` : ''}
        </button>
      </div>

      {showContents && (
        <div style={{ position: 'absolute', top: 46, left: 12, zIndex: 29, maxHeight: 'calc(100% - 92px)', display: 'flex' }}>
          <MapContentsPanel
            stacked
            onClose={() => setContentsOpen(false)}
            pois={visiblePois}
            selectedPoiId={selectedPOI?.id ?? null}
            hoveredPoiId={hoveredPoiId}
            poiFilter={poiListFilter}
            onPoiFilterChange={setPoiListFilter}
            onPoiHover={setHoveredPoiId}
            onPoiFocus={focusPOIFromList}
            visits={visits}
            layers={shapeStore.layers}
            shapes={shapeStore.shapes}
            activeLayerId={shapeStore.activeLayerId}
            editable={editMode}
            onSetActiveLayer={shapeStore.setActiveLayerId}
            onToggleLayerVisible={shapeStore.toggleLayerVisible}
            onToggleLayerLocked={shapeStore.toggleLayerLocked}
            onRenameLayer={shapeStore.renameLayer}
            onDeleteLayer={shapeStore.deleteLayer}
            onCreateLayer={() => shapeStore.createLayer()}
            onSelectShape={focusShape}
          />
        </div>
      )}

      {/* Travel panel — top-right, clear of the left column and the zoom cluster */}
      {measureMode && (
        <div style={{ position: 'absolute', top: 46, right: 12, zIndex: 31 }}
          onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <TravelMeasurePanel
            scale={measure.mapScale}
            natural={imgNatural}
            waypoints={measure.waypoints}
            isCalibrating={measure.isCalibrating}
            calibDraft={measure.calibDraft}
            onExit={() => { backToSelect(); measure.reset() }}
            onBeginCalibrate={measure.beginCalibrate}
            onCancelCalibrate={measure.cancelCalibrate}
            onCommitScale={measure.commitScale}
            onUndoPoint={measure.undoPoint}
            onClearRoute={measure.clearRoute}
          />
        </div>
      )}

      {/* Shape popup, positioned in canvas space above the transform */}
      {selectedShape && shapePopupPos && !editingShape && (
        <div style={{ position: 'absolute', top: shapePopupPos.top, left: shapePopupPos.left, zIndex: 31 }}
          onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
          <ShapePopup
            shape={selectedShape}
            links={parseHubLinks(selectedShape.hub_links)}
            editMode={editMode}
            onClose={() => { setSelectedShape(null); setShapePopupPos(null) }}
            onEdit={() => setEditingShape(selectedShape)}
            onNavigateWiki={title => navigateToArticleByTitle(title)}
            onNavigateSession={id => navigateToSessionById(id)}
          />
        </div>
      )}

      {/* One hint, driven by the active tool */}
      {editMode && (
        <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none', userSelect: 'none', zIndex: 30, maxWidth: 380, lineHeight: 1.5 }}>
          {measureMode
            ? measure.hint
            : isShapeTool(tool) && shapeStore.layers.length === 0
              ? 'Add a drawing layer in the Layers panel, then draw onto it'
              : toolHint(tool, drawing.isDrawing)}
        </div>
      )}

      {editingShape && (
        <ShapeEditModal
          shape={editingShape}
          links={parseHubLinks(editingShape.hub_links)}
          layers={shapeStore.layers}
          sessions={sessions}
          articles={articleList}
          onSave={handleSaveShape}
          onDelete={handleDeleteShape}
          onClose={() => setEditingShape(null)}
        />
      )}

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(21,18,14,0.85)', border: '1px solid var(--border-light)',
        borderRadius: 4, padding: '4px 8px', backdropFilter: 'blur(8px)',
      }}>
        <button onClick={zoomOut} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>−</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>+</button>
        <div style={{ width: 1, height: 14, background: 'var(--border-light)', margin: '0 2px' }} />
        <button onClick={resetView} title="Reset view" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
          <Maximize size={11} />
        </button>
      </div>

      {/* Outer container — receives pan and wheel events */}
      <div
        data-map-outer
        ref={outerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        // Pins and shape vertices claim their own right-clicks and stop
        // propagation, so anything arriving here landed on bare canvas.
        onContextMenu={canvasMenu}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: cursorStyle, background: '#0a0908', userSelect: 'none' }}
      >
        {/* Inner container — this is what gets transformed */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt={currentMap.name}
              onLoad={e => { setImageLoaded(true); onImageLoad(e) }}
              style={{
                width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                opacity: imageLoaded ? 1 : 0, transition: 'opacity 300ms ease',
                pointerEvents: 'none', userSelect: 'none',
              }}
              draggable={false}
            />
          )}

          {imageLoaded && imgBounds && (
            <div style={{ position: 'absolute', left: imgBounds.left, top: imgBounds.top, width: imgBounds.w, height: imgBounds.h }}>
              {measureMode && (
                <MeasureOverlay
                  scale={scale}
                  mapScale={measure.mapScale}
                  waypoints={measure.waypoints}
                  isCalibrating={measure.isCalibrating}
                  calibPts={measure.calibPts}
                />
              )}
              {/* Regions paint under the pins so a district never hides a marker. */}
              <MapShapeLayer
                shapes={shapeStore.shapes}
                layers={shapeStore.layers}
                box={imgBounds}
                scale={scale}
                interactive={shapesInteractive}
                lockedLayerIds={lockedLayerIds}
                selectedId={drawing.selectedId ?? selectedShape?.id ?? null}
                hoveredId={hoveredShapeId}
                showHandles={drawing.editing}
                draft={drawing.draft}
                livePoints={drawing.livePoints}
                onShapeClick={handleShapeClick}
                onShapeContextMenu={shapeMenu}
                onShapeHover={setHoveredShapeId}
                onBodyDown={drawing.onBodyDown}
                onVertexDown={drawing.onVertexDown}
                // Right-click a corner while reshaping. It used to delete the point
                // outright, which nothing advertised; a one-item menu says so.
                // Not editing? Fall through and let the canvas menu take it.
                onVertexContextMenu={(shape, index, e) => {
                  if (!drawing.editing) return
                  showMenu(e, [{ label: 'Remove point', click: () => void drawing.removeVertex(shape, index) }])
                }}
                onMidpointDown={drawing.onMidpointDown}
              />
              {ghostPois.map(poi => (
                <POIMarker
                  key={poi.id}
                  poi={poi}
                  onSelect={selectPOI}
                  isSelected={false}
                  editMode={false}
                  scale={scale}
                  imgBoundsRef={imgBoundsRef}
                  ghost
                />
              ))}
              {livePois.map(poi => (
                <POIMarker
                  key={poi.id}
                  poi={poi}
                  onSelect={selectPOI}
                  onContextMenu={poiMenu}
                  isSelected={selectedPOI?.id === poi.id}
                  editMode={editMode}
                  scale={scale}
                  imgBoundsRef={imgBoundsRef}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}