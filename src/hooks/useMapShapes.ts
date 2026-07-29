// path: src/hooks/useMapShapes.ts
// Loads a map's drawing layers and shapes and owns their CRUD, so both map
// surfaces (the campaign world map and article/session maps) stay thin.
import { useCallback, useEffect, useState } from 'react'
import type { MapShape, MapShapeLayer } from '../types'

export function useMapShapes(mapId: number | null) {
  const [shapes, setShapes] = useState<MapShape[]>([])
  const [layers, setLayers] = useState<MapShapeLayer[]>([])
  // Which layer new shapes are filed under. Defaults to the first layer so
  // drawing works immediately after adding one.
  const [activeLayerId, setActiveLayerId] = useState<number | null>(null)

  useEffect(() => {
    if (mapId == null) { setShapes([]); setLayers([]); setActiveLayerId(null); return }
    let cancelled = false
    Promise.all([window.api.getShapeLayers(mapId), window.api.getMapShapes(mapId)])
      .then(([ls, ss]) => {
        if (cancelled) return
        setLayers(ls)
        setShapes(ss)
        setActiveLayerId(ls[0]?.id ?? null)
      })
    return () => { cancelled = true }
  }, [mapId])

  const createLayer = useCallback(async (name?: string) => {
    if (mapId == null) return null
    const layer = await window.api.createShapeLayer(mapId, name)
    setLayers(prev => [...prev, layer])
    setActiveLayerId(layer.id)
    return layer
  }, [mapId])

  const patchLayer = useCallback(async (id: number, data: Partial<MapShapeLayer>) => {
    const updated = await window.api.updateShapeLayer(id, data)
    // Preserve shape_count, which the update handler doesn't recompute.
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l))
  }, [])

  const toggleLayerVisible = useCallback((layer: MapShapeLayer) =>
    patchLayer(layer.id, { visible: layer.visible === 1 ? 0 : 1 }), [patchLayer])

  const toggleLayerLocked = useCallback((layer: MapShapeLayer) =>
    patchLayer(layer.id, { locked: layer.locked === 1 ? 0 : 1 }), [patchLayer])

  const renameLayer = useCallback((layer: MapShapeLayer, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === layer.name) return Promise.resolve()
    return patchLayer(layer.id, { name: trimmed })
  }, [patchLayer])

  const deleteLayer = useCallback(async (layer: MapShapeLayer) => {
    await window.api.deleteShapeLayer(layer.id)
    setLayers(prev => prev.filter(l => l.id !== layer.id))
    // The DB cascades the shapes away; mirror that locally.
    setShapes(prev => prev.filter(s => s.layer_id !== layer.id))
    setActiveLayerId(prev => prev === layer.id ? null : prev)
  }, [])

  const updateShape = useCallback(async (id: number, data: Partial<MapShape>) => {
    const updated = await window.api.updateMapShape(id, data)
    setShapes(prev => prev.map(s => s.id === updated.id ? updated : s))
    return updated
  }, [])

  return {
    shapes, setShapes,
    layers, setLayers,
    activeLayerId, setActiveLayerId,
    createLayer, toggleLayerVisible, toggleLayerLocked, renameLayer, deleteLayer,
    updateShape,
  }
}
