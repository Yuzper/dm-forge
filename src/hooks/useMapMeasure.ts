// path: src/hooks/useMapMeasure.ts
// The measure/travel tool's state: a per-map distance calibration plus an
// ephemeral route. Extracted from HubWorldMap so article and session maps can
// measure too — a dungeon or city map benefits from "how far is that" just as
// much as a world map does.
//
// The calibration lives on the map row (`maps.map_scale`); the route does not,
// because a route is a question you ask once at the table, not a saved artefact.
import { useCallback, useEffect, useState } from 'react'
import type { DistanceUnit, GameMap, MapScale } from '../types'
import type { CalibDraft } from '../components/map/TravelMeasurePanel'

export interface MeasurePoint { x: number; y: number; label?: string }

export function useMapMeasure({ map, onMapPatched }: {
  map: GameMap | null
  /** Receives the updated map row after a calibration is saved. */
  onMapPatched?: (map: GameMap) => void
}) {
  const [mapScale, setMapScale] = useState<MapScale | null>(null)
  const [waypoints, setWaypoints] = useState<MeasurePoint[]>([])
  const [isCalibrating, setIsCalibrating] = useState(false)
  // Two reference points a known distance apart define the scale.
  const [calibPts, setCalibPts] = useState<{ x: number; y: number }[]>([])

  const calibDraft: CalibDraft | null = calibPts.length === 2
    ? { x1: calibPts[0].x, y1: calibPts[0].y, x2: calibPts[1].x, y2: calibPts[1].y }
    : null

  // Changing map drops the route and re-reads that map's own calibration.
  useEffect(() => {
    setWaypoints([])
    setIsCalibrating(false)
    setCalibPts([])
    try { setMapScale(map?.map_scale ? JSON.parse(map.map_scale) : null) }
    catch { setMapScale(null) }
  }, [map?.id, map?.map_scale])

  /**
   * A click while calibrating collects a reference point (a third click starts
   * over); otherwise it appends a route waypoint.
   */
  const addPoint = useCallback((x: number, y: number, label?: string) => {
    if (isCalibrating) {
      setCalibPts(prev => { const next = [...prev, { x, y }]; return next.length > 2 ? [{ x, y }] : next })
    } else {
      setWaypoints(prev => [...prev, { x, y, label }])
    }
  }, [isCalibrating])

  const commitScale = useCallback(async (distance: number, unit: DistanceUnit) => {
    if (calibPts.length < 2 || !map) return
    const scale: MapScale = {
      x1: calibPts[0].x, y1: calibPts[0].y,
      x2: calibPts[1].x, y2: calibPts[1].y,
      distance, unit,
    }
    setMapScale(scale)
    setIsCalibrating(false)
    setCalibPts([])
    const updated = await window.api.updateMap(map.id, { map_scale: JSON.stringify(scale) } as any)
    onMapPatched?.(updated)
  }, [calibPts, map, onMapPatched])

  const beginCalibrate = useCallback(() => { setIsCalibrating(true); setCalibPts([]) }, [])
  const cancelCalibrate = useCallback(() => { setIsCalibrating(false); setCalibPts([]) }, [])
  const undoPoint = useCallback(() => setWaypoints(prev => prev.slice(0, -1)), [])
  const clearRoute = useCallback(() => setWaypoints([]), [])
  const reset = useCallback(() => {
    setWaypoints([]); setIsCalibrating(false); setCalibPts([])
  }, [])

  /** One-line guidance for the state the tool is currently in. */
  const hint = isCalibrating
    ? 'Click two points a known distance apart'
    : mapScale
      ? 'Click points to trace a route · snaps to nearby locations'
      : 'Set a map scale to start measuring'

  return {
    mapScale, waypoints, isCalibrating, calibPts, calibDraft, hint,
    addPoint, commitScale, beginCalibrate, cancelCalibrate, undoPoint, clearRoute, reset,
  }
}
