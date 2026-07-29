// path: src/context/MapContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store/store'
import type { GameMap, MapLayer, POI } from '../types'

// ── Interface ─────────────────────────────────────────────────────────────────

export interface MapContextValue {
  currentMap:   GameMap | null
  pois:         POI[]
  selectedPOI:  POI | null
  poiPanelOpen: boolean
  editMode:     boolean
  // Visit-layer visibility: POIs on activeLayerId render live; layers in
  // ghostLayerIds render dimmed, read-only; other layers stay hidden. Base
  // POIs (layer_id null) render live only while showBaseLayer is on —
  // undefined means on (article editing, session-owned maps).
  activeLayerId?: number | null
  ghostLayerIds?: number[]
  showBaseLayer?: boolean

  // The visit layers themselves, so MapCanvas can list them in its Contents
  // panel. Absent on maps no session has run. Renaming is offered only where
  // it makes sense (an article's own map, not a session in progress); the base
  // toggle only on an attached map, where a base layer is a distinct thing.
  visitLayers?: MapLayer[]
  toggleGhostLayer?:  (id: number) => void
  toggleBaseLayer?:   () => void
  renameVisitLayer?:  (id: number, name: string) => void

  // Apply an already-persisted change to the map row (the measure tool saves a
  // calibration this way). Absent on surfaces whose map rows are read-only here.
  patchMap?:         (m: GameMap) => void

  selectPOI:         (p: POI | null) => void
  createPOI:         (x: number, y: number) => Promise<void>
  updatePOI:         (id: number, data: Partial<POI>) => Promise<void>
  deletePOI:         (id: number) => Promise<void>
  // Optimistic local update during drag — avoids a round-trip while dragging
  optimisticMovePOI: (id: number, x: number, y: number) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const MapContext = createContext<MapContextValue | null>(null)

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext)
  if (!ctx) throw new Error('useMapContext must be used inside a MapContext.Provider')
  return ctx
}

export { MapContext }

// ── StoreMapProvider — fills context from global Zustand store ────────────────
// Used by SessionPage so existing session maps work exactly as before.

export function StoreMapProvider({ children }: { children: ReactNode }) {
  const {
    currentMap, pois, selectedPOI, poiPanelOpen,
    sessionReadMode,                               // derive editMode from this
    selectPOI, createPOI, updatePOI, deletePOI,
    ghostLayerIds, showBaseLayer, toggleGhostLayer, toggleBaseLayer,
  } = useStore()

  // Other visits to this place, listed in the canvas's Contents panel. Only
  // attached maps have any — a session-owned scene map is visited once.
  const [visitLayers, setVisitLayers] = useState<MapLayer[]>([])
  useEffect(() => {
    if (!currentMap?.attached) { setVisitLayers([]); return }
    let cancelled = false
    window.api.getMapLayers(currentMap.id).then(ls => { if (!cancelled) setVisitLayers(ls) })
    return () => { cancelled = true }
  }, [currentMap?.id, currentMap?.attached])

  // On an attached article map, the session works on its visit layer and the
  // place's base POIs start hidden; on session-owned maps every POI is
  // base-layer, so base always shows and the distinction is moot.
  const activeLayerId = currentMap?.attached ? currentMap.layer_id ?? null : null
  const baseShown = currentMap?.attached ? showBaseLayer : true

  const editMode = !sessionReadMode               // store's editMode field is never set in session flow

  // The map row lives in the store on this surface, so patch it there.
  const patchMap = (m: GameMap) => {
    useStore.setState(s => ({
      maps: s.maps.map(x => x.id === m.id ? m : x),
      currentMap: s.currentMap?.id === m.id ? m : s.currentMap,
    }))
  }

  const optimisticMovePOI = (id: number, x: number, y: number) => {
    useStore.setState(s => ({
      pois:        s.pois.map(p => p.id === id ? { ...p, x, y } : p),
      selectedPOI: s.selectedPOI?.id === id ? { ...s.selectedPOI!, x, y } : s.selectedPOI,
    }))
  }

  return (
    <MapContext.Provider value={{
      currentMap, pois, selectedPOI, poiPanelOpen, editMode,
      activeLayerId, ghostLayerIds, showBaseLayer: baseShown,
      visitLayers,
      toggleGhostLayer,
      // Only an attached map has a base layer to hide; a scene map is all base.
      toggleBaseLayer: currentMap?.attached ? toggleBaseLayer : undefined,
      patchMap,
      selectPOI, createPOI, updatePOI, deletePOI, optimisticMovePOI,
    }}>
      {children}
    </MapContext.Provider>
  )
}