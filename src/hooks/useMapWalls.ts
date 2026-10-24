// path: src/hooks/useMapWalls.ts
// A map's sight-blocking walls and their CRUD, so both the canvas editor and
// the fog preview stay thin. Mirrors useMapShapes.
//
// Walls usually arrive by the hundred from a VTT import, so edits are applied
// optimistically: waiting on a round trip per dragged endpoint would make the
// editor feel like treacle.
import { useCallback, useEffect, useState } from 'react'
import type { CreateMapWallInput, MapWall, MapWallKind } from '../types'

export function useMapWalls(mapId: number | null) {
  const [walls, setWalls] = useState<MapWall[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    if (mapId == null) { setWalls([]); setSelectedId(null); return }
    let cancelled = false
    window.api.getWalls(mapId).then(ws => { if (!cancelled) setWalls(ws) })
    return () => { cancelled = true }
  }, [mapId])

  const createWall = useCallback(async (
    seg: { x1: number; y1: number; x2: number; y2: number },
    kind: MapWallKind = 'wall',
  ) => {
    if (mapId == null) return null
    const input: CreateMapWallInput = { map_id: mapId, ...seg, kind }
    const wall = await window.api.createWall(input)
    setWalls(prev => [...prev, wall])
    return wall
  }, [mapId])

  const patchWall = useCallback(async (id: number, data: Partial<MapWall>) => {
    setWalls(prev => prev.map(w => w.id === id ? { ...w, ...data } : w))
    await window.api.updateWall(id, data)
  }, [])

  /**
   * Local-only move, for dragging an endpoint. The write happens once when
   * the gesture ends — a round trip per mouse move would make the drag lag
   * behind the cursor on a map carrying hundreds of imported walls.
   */
  const setWallsLocal = useCallback((id: number, data: Partial<MapWall>) => {
    setWalls(prev => prev.map(w => w.id === id ? { ...w, ...data } : w))
  }, [])

  const removeWall = useCallback(async (id: number) => {
    setWalls(prev => prev.filter(w => w.id !== id))
    setSelectedId(prev => prev === id ? null : prev)
    await window.api.deleteWall(id)
  }, [])

  /** Wall → door → window → wall. One key cycles a mis-imported segment. */
  const cycleKind = useCallback((wall: MapWall) => {
    const next: MapWallKind = wall.kind === 'wall' ? 'door' : wall.kind === 'door' ? 'window' : 'wall'
    return patchWall(wall.id, { kind: next, door_open: 0 })
  }, [patchWall])

  const toggleDoor = useCallback((wall: MapWall) => {
    if (wall.kind !== 'door') return Promise.resolve()
    return patchWall(wall.id, { door_open: wall.door_open ? 0 : 1 })
  }, [patchWall])

  const clearWalls = useCallback(async () => {
    if (mapId == null) return
    setWalls([])
    setSelectedId(null)
    await window.api.clearWalls(mapId)
  }, [mapId])

  /** After an import, which adds rows the renderer has not seen. */
  const reload = useCallback(async () => {
    if (mapId == null) return
    setWalls(await window.api.getWalls(mapId))
  }, [mapId])

  return {
    walls, selectedId, setSelectedId,
    createWall, patchWall, setWallsLocal, removeWall, cycleKind, toggleDoor, clearWalls, reload,
  }
}
