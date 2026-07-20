// path: src/context/MapContext.tsx
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store/store'
import type { GameMap, POI } from '../types'

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
    ghostLayerIds, showBaseLayer,
  } = useStore()

  // On an attached article map, the session works on its visit layer and the
  // place's base POIs start hidden; on session-owned maps every POI is
  // base-layer, so base always shows and the distinction is moot.
  const activeLayerId = currentMap?.attached ? currentMap.layer_id ?? null : null
  const baseShown = currentMap?.attached ? showBaseLayer : true

  const editMode = !sessionReadMode               // store's editMode field is never set in session flow

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
      selectPOI, createPOI, updatePOI, deletePOI, optimisticMovePOI,
    }}>
      {children}
    </MapContext.Provider>
  )
}