// path: src/components/campaign/HubWorldMap.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/store'
import {
  Map, MoreHorizontal, Trash2, Pencil, Upload,
  Maximize, Image as ImageIcon, List,
} from 'lucide-react'
import type { GameMap, POI, MapShape, MapTool } from '../../types'
import { isShapeTool } from '../../types'
import Modal from '../Modal'
import EmptyState from '../EmptyState'
import TravelMeasurePanel from '../map/TravelMeasurePanel'
import MeasureOverlay from '../map/MeasureOverlay'
import MapContentsPanel from '../map/MapContentsPanel'
import MapPOIMarker from '../map/MapPOIMarker'
import MapShapeLayer from '../map/MapShapeLayer'
import MapToolbar, { toolHint } from '../map/MapToolbar'
import ShapePopup from '../map/ShapePopup'
import ShapeEditModal from '../map/ShapeEditModal'
import POIPopup from '../map/POIPopup'
import POIEditModal, {
  DEFAULT_HUB_POI_SIZE, MIN_HUB_POI_SIZE, type POIEditResult,
} from '../map/POIEditModal'
import { useMapShapes } from '../../hooks/useMapShapes'
import { useMapViewport } from '../../hooks/useMapViewport'
import { useMapCollection } from '../../hooks/useMapCollection'
import { useMapMeasure } from '../../hooks/useMapMeasure'
import { useShapeDrawing } from '../../hooks/useShapeDrawing'
import { centroidOf, parsePoints } from '../../utils/mapShapeGeometry'
import { makeDescriptionDoc as makePoiContent, parseHubLinks } from '../../utils/hubLinks'
import { useContextMenu, useMenuCtx } from '../../hooks/useContextMenu'
import { openItems, truncate, type MenuItem } from '../../utils/contextMenus'

// The map panel's tab strip, which every client→image coordinate conversion has
// to subtract before the percentage maths works out.
const TAB_STRIP_H = 34

// ── Hub World Map ──────────────────────────────────────────────────────────────

export default function HubWorldMap({ fullBleed = false, onHasMapsChange, listSlot = null }: {
  fullBleed?: boolean
  onHasMapsChange?: (has: boolean) => void
  // In the map hub, the location list is portaled into this left-stack slot so it
  // stacks below the floating panels instead of overlapping them.
  listSlot?: HTMLElement | null
}) {
  const { currentCampaign, sessions, navigateToArticleByTitle, navigateToSessionById } = useStore()
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()

  const [localArticles, setLocalArticles] = useState<{ id: number; title: string }[]>([])
  const [pois, setPois] = useState<POI[]>([])

  // The campaign's owned maps and their lifecycle. Selecting a map reloads its
  // pins here; the collection itself knows nothing about a map's contents.
  const {
    maps, currentMap, importing,
    selectMap: handleSelectMap, addMap: handleUploadNew,
    renameMap, replaceImage, deleteMap: handleDeleteMap, patchMap,
  } = useMapCollection({
    owner: currentCampaign ? { kind: 'campaign', id: currentCampaign.id } : null,
    // Historical key, kept so existing remembered selections still load.
    selectionKey: currentCampaign ? `worldmap-selected-${currentCampaign.id}` : undefined,
    onCountChange: count => onHasMapsChange?.(count > 0),
    onSelect: map => {
      setPois([])
      setSelectedPOI(null)
      if (map) window.api.getPOIs(map.id).then(setPois)
    },
  })
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // One tool owns canvas clicks. This replaced three mutually exclusive mode
  // booleans (edit / measure / shape) that each had to remember to switch the
  // others off. 'select' is the resting state: nothing gets placed, and pins
  // and regions are both clickable.
  const [tool, setTool] = useState<MapTool>('select')
  const backToSelect = useCallback(() => setTool('select'), [])

  // Browsing is the default: the hub map is something you look at far more often
  // than you edit, and a stray click shouldn't be able to drop a pin or nudge a
  // border. Edit unlocks placing, dragging, reshaping and map management —
  // mirroring an article page's Read/Edit toggle.
  const [editable, setEditable] = useState(false)
  const measureMode = tool === 'measure'

  // Leaving edit mode must not strand a half-drawn shape or an open editor.
  const leaveEditMode = useCallback(() => {
    setEditable(false)
    setTool('select')
    setSelectedPOI(null)
    setEditingPOI(null)
    setSelectedShape(null)
    setShapePopupPos(null)
    setEditingShape(null)
  }, [])

  const [mapVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem('worldmap-map-visible')
    return stored === null ? true : stored === 'true'
  })

  const [renamingMap, setRenamingMap] = useState<GameMap | null>(null)
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [hoveredPoiId, setHoveredPoiId] = useState<number | null>(null)
  // One panel lists everything on the map — pins and drawing layers both.
  const [showContents, setShowContents] = useState(() => localStorage.getItem('worldmap-contents') === 'true')
  const [poiListFilter, setPoiListFilter] = useState('')
  const toggleContents = () => setShowContents(v => { localStorage.setItem('worldmap-contents', String(!v)); return !v })
  const [editingPOI, setEditingPOI] = useState<POI | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)

  // ── Measure / travel ──────────────────────────────────────────────────────
  const measure = useMapMeasure({ map: currentMap, onMapPatched: patchMap })

  // ── Drawing shapes ────────────────────────────────────────────────────────
  const [selectedShape, setSelectedShape] = useState<MapShape | null>(null)
  const [shapePopupPos, setShapePopupPos] = useState<{ top: number; left: number } | null>(null)
  const [editingShape, setEditingShape] = useState<MapShape | null>(null)
  const [hoveredShapeId, setHoveredShapeId] = useState<number | null>(null)
  // Pan, zoom, image fitting and viewport persistence come from the shared hook.
  // The 34px tab strip is the only thing that makes this surface's coordinate
  // maths differ from an article map's, and it is a parameter now.
  const vp = useMapViewport({
    mapId: currentMap?.id ?? null,
    storagePrefix: 'worldmap-view',
    topInset: TAB_STRIP_H,
  })
  const {
    containerRef: mapRef, scale, offset, scaleRef, offsetRef,
    imgNatural, imgBounds, imgBoundsRef, onImageLoad,
    zoomIn, zoomOut, resetView, centreOn, toPercent, toContainerPoint,
  } = vp
  const [cursorStyle, setCursorStyle] = useState('grab')

  // ── Shapes ────────────────────────────────────────────────────────────────
  const shapeStore = useMapShapes(currentMap?.id ?? null)

  const drawing = useShapeDrawing({
    mapId: currentMap?.id ?? null,
    activeLayerId: shapeStore.activeLayerId,
    setShapes: shapeStore.setShapes,
    box: imgBounds,
    scale,
    tool,
    enabled: editable,
    defaultFill: '#c8a84b',
    defaultStroke: '#c8a84b',
    // A fresh shape is nameless and unlinked, so go straight to its editor.
    onCreated: shape => setEditingShape(shape),
    onToolFinished: backToSelect,
  })

  useEffect(() => { drawing.setToPercent(toPercent) }, [drawing.setToPercent, toPercent])

  // A locked layer's shapes stay visible but inert — the point of locking a
  // finished border set while drawing on top of it.
  const lockedLayerIds = shapeStore.layers.filter(l => l.locked === 1).map(l => l.id)

  // Only Select lets shapes catch clicks. Every other tool needs the click to
  // reach the canvas underneath — which is also why a kingdom-sized polygon
  // never blocks dropping a pin inside its borders.
  const shapesInteractive = tool === 'select'

  // Article titles for the POI/shape link pickers.
  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((list: any[]) =>
      setLocalArticles(list.map((a: any) => ({ id: a.id, title: a.title })))
    )
  }, [currentCampaign?.id])

  // The hook restores the saved viewport on map change; this only loads the image.
  useEffect(() => {
    if (!currentMap) { setImageUrl(null); return }
    window.api.getImagePath(currentMap.image_path).then(setImageUrl)
  }, [currentMap?.id, currentMap?.image_path])

  // Every tool that places something gets the crosshair; Select still pans.
  const placing = tool !== 'select'
  useEffect(() => {
    setCursorStyle(placing ? 'crosshair' : 'grab')
  }, [placing])

  // ── Pan handlers ──────────────────────────────────────────────────────────
  const handlePanDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-poi]')) return
    // A box tool wants this drag for the shape it's drawing, not for panning.
    const pt = toPercent(e.clientX, e.clientY)
    if (pt && drawing.handleCanvasMouseDown(pt, e)) return
    vp.panDown(e)
    setCursorStyle('grabbing')
  }

  const handlePanMove = (e: React.MouseEvent) => {
    // Feed the polygon rubber band even when no drag is in progress.
    if (drawing.tool === 'polygon') {
      const pt = toPercent(e.clientX, e.clientY)
      if (pt) drawing.handleCanvasMouseMove(pt)
    }
    vp.panMove(e)
  }

  const handlePanUp = () => {
    vp.panUp()
    setCursorStyle(placing ? 'crosshair' : 'grab')
  }

  // Replacing the image needs the new file re-resolved for display.
  const handleReplaceMapImage = async (map: GameMap) => {
    const updated = await replaceImage(map)
    if (updated && currentMap?.id === updated.id) {
      window.api.getImagePath(updated.image_path).then(setImageUrl)
    }
  }

  const handleRenameMap = async (map: GameMap, name: string) => {
    await renameMap(map, name)
    setRenamingMap(null)
  }

  // ── POI popup positioning ─────────────────────────────────────────────────
  // Convert a POI's % coords through the current transform to map-panel space.
  // Anchor a popup beside a percent-space point, flipped and clamped to stay
  // inside the panel. Shared by pins and regions.
  const popupPosFor = (pt: { x: number; y: number }) => {
    const rect = mapRef.current!.getBoundingClientRect()
    const { x: dotX, y: dotY } = toContainerPoint(pt)
    const popW = 224, popH = 200
    let left = dotX + 14
    let top = dotY - 16
    if (left + popW > rect.width - 4) left = dotX - popW - 14
    if (top + popH > rect.height - 8) top = rect.height - popH - 8
    if (top < TAB_STRIP_H + 4) top = TAB_STRIP_H + 4
    return { top, left }
  }

  const computePopupPos = (poi: POI) => popupPosFor(poi)

  const handlePOIClick = (poi: POI, e: React.MouseEvent) => {
    e.stopPropagation()
    // In measure mode, clicking a marker snaps the route/scale point to it.
    if (measureMode) { measure.addPoint(poi.x, poi.y, poi.label); return }
    if (selectedPOI?.id === poi.id) { setSelectedPOI(null); setPopupPos(null); return }
    setSelectedPOI(poi)
    setPopupPos(computePopupPos(poi))
  }

  // ── Focus a POI from the list — recenter the map on it, then open its popup ─
  const focusPOIFromList = (poi: POI) => {
    // centreOn writes offsetRef synchronously, so computePopupPos below sees it.
    centreOn(poi)
    setSelectedPOI(poi)
    setPopupPos(computePopupPos(poi))
  }

  // ── Shape interactions ────────────────────────────────────────────────────
  // The popup anchors on the shape's centroid, converted through the current
  // transform into map-panel space, exactly as computePopupPos does for a pin.
  const computeShapePopupPos = (shape: MapShape) => {
    const centre = centroidOf(shape.shape_type, parsePoints(shape.points))
    return centre ? popupPosFor(centre) : { top: TAB_STRIP_H + 26, left: 60 }
  }

  const handleShapeClick = (shape: MapShape) => {
    // Ignore the click that ends a drag — the user was moving, not selecting.
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
    setShapePopupPos(computeShapePopupPos(shape))
  }

  // A world-map region is usually a kingdom or a district with an article behind
  // it, so the menu leads with opening that — a border you can't click through
  // is just decoration.
  const shapeMenu = useCallback((shape: MapShape, e: React.MouseEvent) => {
    const article = parseHubLinks(shape.hub_links).find(l => l.type === 'wiki' && l.article_id)
    const menu: MenuItem[] = []
    if (article) {
      menu.push(...openItems(
        { type: 'article', articleId: article.article_id! }, menuCtx,
        `Open “${truncate(article.title ?? 'linked article')}”`,
      ), { type: 'separator' })
    }
    menu.push(
      { label: 'Edit region…', click: () => setEditingShape(shape) },
      { label: 'Edit points', click: () => drawing.setSelectedId(shape.id) },
      { type: 'separator' },
      {
        label: `Delete “${truncate(shape.label || 'this region')}”`,
        click: async () => {
          await drawing.deleteShape(shape.id)
          setSelectedShape(prev => prev?.id === shape.id ? null : prev)
          setShapePopupPos(null)
        },
      },
    )
    showMenu(e, menu)
  }, [menuCtx, showMenu, drawing])

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
    setShapePopupPos(null)
  }

  // Recentre on a shape picked from the layer panel, then open its popup.
  const focusShape = (shape: MapShape) => {
    const centre = centroidOf(shape.shape_type, parsePoints(shape.points))
    if (centre) centreOn(centre)
    drawing.setSelectedId(shape.id)
    setSelectedShape(shape)
    setShapePopupPos(computeShapePopupPos(shape))
  }

  // Map-panel-space position of a pin, used to snap a nearby measure click onto it.
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

  // ── Map background click — routed entirely by the active tool ─────────────
  const handleMapClick = (e: React.MouseEvent) => {
    if (vp.consumePan()) return
    if (!currentMap) return
    const rect = mapRef.current!.getBoundingClientRect()
    const ib = imgBoundsRef.current
    if (!ib) return
    const innerX = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current
    const innerY = (e.clientY - rect.top - 34 - offsetRef.current.y) / scaleRef.current
    let x = (innerX - ib.left) / ib.w * 100
    let y = (innerY - ib.top) / ib.h * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return

    if (measureMode) {
      // Snap onto a POI if the click lands close to one (town-to-town measuring).
      const snap = nearestPoi(e.clientX - rect.left, e.clientY - rect.top, 16)
      if (snap) { x = snap.x; y = snap.y }
      measure.addPoint(x, y, snap?.label)
      return
    }

    // A shape tool takes the click to place a vertex.
    if (drawing.handleCanvasClick({ x, y })) return

    if (tool === 'pin') {
      if ((e.target as HTMLElement).closest('[data-poi]')) return
      window.api.createPOI({ map_id: currentMap.id, label: 'New Location', x, y }).then((poi: POI) => {
        setPois((prev: POI[]) => [...prev, poi])
        setSelectedPOI(poi)
        setEditingPOI(poi)
        // One pin per click of the tool: placing a location almost always means
        // naming and linking it, so drop back to Select with its editor open.
        backToSelect()
      })
      return
    }

    // Select: a click that reaches the canvas missed everything, so clear the
    // selection. Shape and pin clicks stop propagating before this.
    if (tool === 'select') {
      drawing.setSelectedId(null)
      if (selectedShape) { setSelectedShape(null); setShapePopupPos(null) }
    }
  }

  // ── POI drag (scale-aware) ────────────────────────────────────────────────
  const dragRef = useRef<{ poi: POI; startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Pins drag under Select and Pin. A drag needs a deliberate grab on the marker
  // plus 4px of movement, so this can't fire while measuring or drawing.
  const canDragPOI = editable && (tool === 'select' || tool === 'pin')

  const handlePOIMouseDown = (poi: POI, e: React.MouseEvent) => {
    if (!canDragPOI) return
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { poi, startX: e.clientX, startY: e.clientY, origX: poi.x, origY: poi.y }
    const onMove = (mv: MouseEvent) => {
      if (!dragRef.current || !mapRef.current) return
      const rect = mapRef.current.getBoundingClientRect()
      const ib2 = imgBoundsRef.current
      const bw2 = ib2 ? ib2.w : rect.width
      const bh2 = ib2 ? ib2.h : (rect.height - 34)
      const dx = ((mv.clientX - dragRef.current.startX) / (bw2 * scaleRef.current)) * 100
      const dy = ((mv.clientY - dragRef.current.startY) / (bh2 * scaleRef.current)) * 100
      const newX = Math.max(0, Math.min(100, dragRef.current.origX + dx))
      const newY = Math.max(0, Math.min(100, dragRef.current.origY + dy))
      setPois((prev: POI[]) => prev.map(p => p.id === poi.id ? { ...p, x: newX, y: newY } : p))
      if (selectedPOI?.id === poi.id) setSelectedPOI(prev => prev ? { ...prev, x: newX, y: newY } : prev)
    }
    const onUp = async (uv: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!dragRef.current || !mapRef.current) return
      const rect = mapRef.current.getBoundingClientRect()
      const moved = Math.abs(uv.clientX - dragRef.current.startX) > 4 || Math.abs(uv.clientY - dragRef.current.startY) > 4
      if (moved) {
        const ib3 = imgBoundsRef.current
        const bw3 = ib3 ? ib3.w : rect.width
        const bh3 = ib3 ? ib3.h : (rect.height - 34)
        const dx = ((uv.clientX - dragRef.current.startX) / (bw3 * scaleRef.current)) * 100
        const dy = ((uv.clientY - dragRef.current.startY) / (bh3 * scaleRef.current)) * 100
        const newX = Math.max(0, Math.min(100, dragRef.current.origX + dx))
        const newY = Math.max(0, Math.min(100, dragRef.current.origY + dy))
        await window.api.updatePOI(poi.id, { x: newX, y: newY })
      }
      dragRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── POI save / delete ─────────────────────────────────────────────────────
  const handleSavePOI = async ({ label, description, links, color, size, opacity }: POIEditResult) => {
    if (!editingPOI) return
    const content = makePoiContent(description)
    const hub_links = JSON.stringify(links)
    const updated = await window.api.updatePOI(editingPOI.id, { label, content, hub_links, color, hub_size: size, hub_opacity: opacity } as any)
    setPois((prev: POI[]) => prev.map(p => p.id === updated.id ? updated : p))
    setSelectedPOI(updated)
    setEditingPOI(null)
  }

  // `target` lets a pin's context menu delete a pin without opening its editor.
  const handleDeletePOI = async (target?: POI) => {
    const doomed = target ?? editingPOI
    if (!doomed) return
    await window.api.deletePOI(doomed.id)
    setPois((prev: POI[]) => prev.filter(p => p.id !== doomed.id))
    setSelectedPOI(null)
    setEditingPOI(null)
    setPopupPos(null)
  }

  // The world map's pins are the campaign's index of places, so the menu leads
  // with wherever a pin points rather than with editing it.
  const poiMenu = useCallback((poi: POI, e: React.MouseEvent) => {
    const links = parseHubLinks((poi as any).hub_links || '[]')
    const article = links.find(l => l.type === 'wiki' && l.article_id)
    const session = links.find(l => l.type === 'session' && l.session_id)
    const menu: MenuItem[] = []
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
    menu.push(
      { label: 'Edit pin…', click: () => setEditingPOI(poi) },
      { type: 'separator' },
      { label: `Delete “${truncate(poi.label || 'this pin')}”`, click: () => void handleDeletePOI(poi) },
    )
    showMenu(e, menu)
  }, [menuCtx, showMenu])

  // ── Contents panel ────────────────────────────────────────────────────────
  // `stacked` = the map hub's left panel column; otherwise it floats over the
  // classic-hub map. The world map has no visit history, so no Visits section.
  const renderContents = (stacked: boolean) => (
    <MapContentsPanel
      stacked={stacked}
      onClose={toggleContents}
      pois={pois}
      pointsTitle="Locations"
      selectedPoiId={selectedPOI?.id ?? null}
      hoveredPoiId={hoveredPoiId}
      poiFilter={poiListFilter}
      onPoiFilterChange={setPoiListFilter}
      onPoiHover={setHoveredPoiId}
      onPoiFocus={focusPOIFromList}
      layers={shapeStore.layers}
      shapes={shapeStore.shapes}
      activeLayerId={shapeStore.activeLayerId}
      editable={editable}
      onSetActiveLayer={shapeStore.setActiveLayerId}
      onToggleLayerVisible={shapeStore.toggleLayerVisible}
      onToggleLayerLocked={shapeStore.toggleLayerLocked}
      onRenameLayer={shapeStore.renameLayer}
      onDeleteLayer={shapeStore.deleteLayer}
      onCreateLayer={() => shapeStore.createLayer()}
      onSelectShape={focusShape}
    />
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={fullBleed ? { height: '100%' } : undefined}>
      {/* Map-hub contents panel — portaled into MapHub's left stack so it sits
          below the floating panels rather than overlapping them. */}
      {fullBleed && listSlot && maps.length > 0 && showContents && createPortal(renderContents(true), listSlot)}

      {/* Map panel */}
      <div
        ref={mapRef}
        style={{
          position: 'relative', width: '100%', height: fullBleed ? '100%' : (mapVisible ? 520 : 34),
          borderRadius: fullBleed ? 0 : 'var(--radius-lg)',
          border: fullBleed ? 'none' : '1px solid var(--border)',
          overflow: 'hidden',
          background: fullBleed ? 'var(--bg-base)' : 'var(--bg-elevated)',
          cursor: cursorStyle,
          userSelect: 'none',
        }}
        onMouseDown={handlePanDown}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanUp}
        onMouseLeave={handlePanUp}
        onClick={handleMapClick}
      >
        {/* Tab strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.55)', borderBottom: '1px solid rgba(255,255,255,0.07)', zIndex: 10 }}>
          {maps.map(map => (
            <div key={map.id}
              onClick={e => { e.stopPropagation(); handleSelectMap(map) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px 0 12px', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.07)', borderBottom: currentMap?.id === map.id ? '2px solid #c8733a' : '2px solid transparent', background: currentMap?.id === map.id ? 'rgba(200,115,58,0.12)' : 'transparent', color: currentMap?.id === map.id ? '#c8733a' : 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: currentMap?.id === map.id ? 600 : 400, whiteSpace: 'nowrap', userSelect: 'none', transition: 'all var(--transition)', position: 'relative' }}
              onMouseEnter={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (currentMap?.id !== map.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Map size={11} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</span>
              {editable && (
                <button onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === map.id ? null : map.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', padding: '0 2px', marginLeft: 2, borderRadius: 2 }}>
                  <MoreHorizontal size={11} />
                </button>
              )}
              {editable && menuOpenId === map.id && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 36, left: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 130, zIndex: 100, overflow: 'hidden' }}>
                  <button onClick={() => { setRenamingMap(map); setMenuOpenId(null) }} className="menu-item">
                    <Pencil size={12} /> Rename
                  </button>
                  <button onClick={() => { handleReplaceMapImage(map); setMenuOpenId(null) }} className="menu-item">
                    <ImageIcon size={12} /> Replace image
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <button onClick={() => { handleDeleteMap(map.id); setMenuOpenId(null) }} className="menu-item menu-item-danger">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
          {editable && (
            <button onClick={e => { e.stopPropagation(); handleUploadNew() }} disabled={importing}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: importing ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'color var(--transition)', '--hover-accent': 'rgba(255,255,255,0.65)' } as React.CSSProperties}
              className="hover-accent">
              <Upload size={11} /> {importing ? 'Importing…' : 'Add map'}
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
            {maps.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); toggleContents() }}
                title={showContents ? 'Hide map contents' : 'Locations and drawing layers on this map'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: showContents ? 'rgba(200,115,58,0.2)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${showContents ? 'rgba(200,115,58,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  color: showContents ? '#c8733a' : 'rgba(255,255,255,0.55)',
                  borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', transition: 'all var(--transition)',
                }}
              >
                <List size={12} /> Contents
              </button>
            )}
            {editable
              ? <button onClick={e => { e.stopPropagation(); leaveEditMode() }}
                  title="Finish editing — the map becomes read-only again"
                  style={{ background: 'rgba(200,115,58,0.2)', border: '1px solid rgba(200,115,58,0.4)', color: '#c8733a', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                  Done
                </button>
              : <button onClick={e => { e.stopPropagation(); setEditable(true) }}
                  title="Place pins, draw regions and manage maps"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', transition: 'all var(--transition)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' }}>
                  Edit
                </button>
            }
          </div>
        </div>

        {/* Empty state */}
        {maps.length === 0 && (
          <EmptyState
            style={{ position: 'absolute', inset: 0, gap: 14 }}
            icon={<Map size={44} strokeWidth={1} color="var(--border-light)" />}
            title="No world map yet"
            description="Import a PNG or JPEG to get started"
            action={
              <button className="btn btn-primary" onClick={e => { e.stopPropagation(); handleUploadNew() }} disabled={importing}
                style={{ background: '#c8733a', borderColor: '#c8733a' }}>
                <Upload size={14} /> {importing ? 'Importing…' : 'Import Map'}
              </button>
            }
          />
        )}

        {/* Transformable content layer (below tab strip) */}
        {maps.length > 0 && (
          <div style={{ position: 'absolute', top: 34, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: '0 0',
            }}>
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={currentMap?.name}
                  onLoad={onImageLoad}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
                  draggable={false}
                />
              )}
              {imageUrl && imgBoundsRef.current && (
              <div style={{ position: 'absolute', left: imgBoundsRef.current.left, top: imgBoundsRef.current.top, width: imgBoundsRef.current.w, height: imgBoundsRef.current.h }}>
              {/* Drawing shapes sit under the pins so a border never hides a town. */}
              <MapShapeLayer
                shapes={shapeStore.shapes}
                layers={shapeStore.layers}
                box={imgBoundsRef.current}
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
              {/* Measure overlay: reference line, route legs, waypoint dots.
                  %coords resolve against this box (like POIs); strokes/radii are
                  divided by the zoom `scale` to stay a constant on-screen size. */}
              {measureMode && (
                <MeasureOverlay
                  scale={scale}
                  mapScale={measure.mapScale}
                  waypoints={measure.waypoints}
                  isCalibrating={measure.isCalibrating}
                  calibPts={measure.calibPts}
                />
              )}
              {pois.map(poi => (
                <MapPOIMarker
                  key={poi.id}
                  poi={poi}
                  // The world map sizes pins individually. The floor keeps the
                  // type glyph legible; below it the marker falls back to a dot.
                  size={Math.max(poi.hub_size ?? DEFAULT_HUB_POI_SIZE, MIN_HUB_POI_SIZE)}
                  scale={scale}
                  selected={selectedPOI?.id === poi.id}
                  hovered={hoveredPoiId === poi.id}
                  opacity={poi.hub_opacity ?? 1}
                  draggable={canDragPOI}
                  onSelect={(p, e) => handlePOIClick(p, e)}
                  onMouseDown={(p, e) => handlePOIMouseDown(p, e)}
                  onContextMenu={poiMenu}
                  onHoverChange={setHoveredPoiId}
                />
              ))}
              </div>
              )}
            </div>
          </div>
        )}

        {/* Contents, classic hub: floats top-left over the map (its cell has no
            other overlays). In the map hub it's portaled into the left stack
            instead — see the portal render above. */}
        {maps.length > 0 && showContents && mapVisible && !fullBleed && renderContents(false)}

        {/* Tool strip — centred under the tab strip so the travel panel (right)
            and the contents panel (left) stay clear of it. Always present: the
            tool *is* the mode, so there is nothing to enter or leave. */}
        {maps.length > 0 && (mapVisible || fullBleed) && (
          <div style={{ position: 'absolute', top: 42, left: '50%', transform: 'translateX(-50%)', zIndex: 17 }}>
            <MapToolbar
              tool={tool}
              available={editable
                ? ['select', 'pin', 'polygon', 'rect', 'triangle', 'ellipse', 'measure']
                // Browsing keeps the two tools that can't change anything.
                : ['select', 'measure']}
              onPick={next => {
                setTool(next)
                setSelectedPOI(null)
                // Picking a draw tool without the contents panel would hide the
                // only place to choose which layer receives the new shape.
                if (isShapeTool(next) && !showContents) toggleContents()
                if (next !== 'select') { setSelectedShape(null); setShapePopupPos(null) }
              }}
            />
          </div>
        )}

        {/* Shape popup — like the POI popup, in map-panel space above the transform */}
        {selectedShape && shapePopupPos && !editingShape && (
          <div style={{ position: 'absolute', top: shapePopupPos.top, left: shapePopupPos.left, zIndex: 20 }}
            onClick={e => e.stopPropagation()}>
            <ShapePopup
              shape={selectedShape}
              links={parseHubLinks(selectedShape.hub_links)}
              editMode={editable}
              onClose={() => { setSelectedShape(null); setShapePopupPos(null) }}
              onEdit={() => setEditingShape(selectedShape)}
              onNavigateWiki={title => navigateToArticleByTitle(title)}
              onNavigateSession={id => navigateToSessionById(id)}
            />
          </div>
        )}

        {/* Popup — rendered outside the transform layer in map-panel space */}
        {selectedPOI && popupPos && !editingPOI && (
          <div style={{ position: 'absolute', top: popupPos.top, left: popupPos.left, zIndex: 20 }}
            onClick={e => e.stopPropagation()}>
            <POIPopup
              poi={selectedPOI}
              links={parseHubLinks((selectedPOI as any).hub_links || '[]')}
              onClose={() => { setSelectedPOI(null); setPopupPos(null) }}
              onEdit={() => setEditingPOI(selectedPOI)}
              editMode={editable}
              onNavigateWiki={title => navigateToArticleByTitle(title)}
              onNavigateSession={id => navigateToSessionById(id)}
            />
          </div>
        )}

        {/* Click outside popup closes it */}
        {selectedPOI && !editingPOI && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 4 }}
            onClick={() => { setSelectedPOI(null); setPopupPos(null) }} />
        )}

        {/* Zoom controls */}
        {maps.length > 0 && (mapVisible || fullBleed) && (
          <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 15, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '4px 8px' }}
            onMouseDown={e => e.stopPropagation()}>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
            <button onClick={zoomOut} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>−</button>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>+</button>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
            <button onClick={resetView} title="Reset view" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
              <Maximize size={11} />
            </button>
          </div>
        )}

        {/* One hint, driven by the active tool */}
        {maps.length > 0 && (
          <div style={{ position: 'absolute', ...(fullBleed ? { bottom: 14, left: 14 } : { bottom: 10, left: 12 }), fontSize: 10, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none', userSelect: 'none', zIndex: 15, maxWidth: 380, lineHeight: 1.5 }}>
            {measureMode
              ? measure.hint
              : isShapeTool(tool) && shapeStore.layers.length === 0
                ? 'Add a drawing layer in the Layers panel, then draw onto it'
                : toolHint(tool, drawing.isDrawing)}
          </div>
        )}

        {/* Travel / measure panel — top-right, clear of the location list & zoom */}
        {maps.length > 0 && measureMode && (mapVisible || fullBleed) && (
          <div style={{ position: 'absolute', top: 42, right: 10, zIndex: 16 }} onMouseDown={e => e.stopPropagation()}>
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
              canCalibrate={editable}
              onUndoPoint={measure.undoPoint}
              onClearRoute={measure.clearRoute}
            />
          </div>
        )}
      </div>

      {/* Modals */}

      {renamingMap && (
        <Modal title="Rename map" onClose={() => setRenamingMap(null)}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" defaultValue={renamingMap.name} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRenameMap(renamingMap, (e.target as HTMLInputElement).value) }}
              id="rename-map-input" />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setRenamingMap(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => {
              const val = (document.getElementById('rename-map-input') as HTMLInputElement)?.value || ''
              handleRenameMap(renamingMap, val)
            }}>Save</button>
          </div>
        </Modal>
      )}

      {editingPOI && (
        <POIEditModal
          poi={editingPOI}
          links={parseHubLinks((editingPOI as any).hub_links || '[]')}
          sessions={sessions}
          articles={localArticles}
          onSave={handleSavePOI}
          onDelete={handleDeletePOI}
          onClose={() => setEditingPOI(null)}
        />
      )}

      {editingShape && (
        <ShapeEditModal
          shape={editingShape}
          links={parseHubLinks(editingShape.hub_links)}
          layers={shapeStore.layers}
          sessions={sessions}
          articles={localArticles}
          onSave={handleSaveShape}
          onDelete={handleDeleteShape}
          onClose={() => setEditingShape(null)}
        />
      )}
    </div>
  )
}

