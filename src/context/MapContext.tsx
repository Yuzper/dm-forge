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
  } = useStore()

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
      selectPOI, createPOI, updatePOI, deletePOI, optimisticMovePOI,
    }}>
      {children}
    </MapContext.Provider>
  )
}