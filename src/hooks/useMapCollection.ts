// path: src/hooks/useMapCollection.ts
// The set of maps *owned* by one parent, plus their lifecycle: list, select,
// import, rename, replace image, delete.
//
// Scope note: this covers ownership only — the `maps.campaign_id` / `article_id`
// columns, where "the maps for X" is a single query on a single column. Sessions
// are deliberately excluded. A session doesn't just own maps, it *assembles* a
// working set: scenes it owns plus article maps borrowed through the
// `session_maps` link table, each with its own visit layer and a sort order
// spanning two tables. That's a different relation, not a third parent, and
// folding it in here would buy one abstraction with a session-shaped branch
// through every method. Session maps stay in store.ts.
import { useCallback, useEffect, useState } from 'react'
import type { GameMap } from '../types'

export type MapOwner =
  | { kind: 'campaign'; id: number }
  | { kind: 'article'; id: number }

export interface UseMapCollectionArgs {
  owner: MapOwner | null
  /**
   * localStorage key under which to remember the last-viewed map. Omit and the
   * surface always opens on its first map (what article maps do). Callers pass
   * their historical key so existing saved selections keep working.
   */
  selectionKey?: string
  /**
   * Fires whenever the current map changes, including the initial load and the
   * fallback after a delete. Hosts load POIs, layers and the image here — this
   * hook deliberately knows nothing about a map's contents.
   */
  onSelect?: (map: GameMap | null) => void
  /** Fires when the list length changes; the hub uses it to show/hide chrome. */
  onCountChange?: (count: number) => void
}

export function useMapCollection({
  owner, selectionKey, onSelect, onCountChange,
}: UseMapCollectionArgs) {
  const [maps, setMaps] = useState<GameMap[]>([])
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [importing, setImporting] = useState(false)

  const ownerKey = owner ? `${owner.kind}:${owner.id}` : null

  // ── Owner-specific IPC ──────────────────────────────────────────────────────
  const listMaps = useCallback((o: MapOwner): Promise<GameMap[]> =>
    o.kind === 'campaign'
      ? window.api.getMapsForCampaign(o.id)
      : window.api.getMapsForArticle(o.id), [])

  const pickImage = useCallback((o: MapOwner) =>
    o.kind === 'campaign'
      ? window.api.importMapForCampaign(o.id)
      : window.api.importMapForArticle(o.id), [])

  const ownerColumns = useCallback((o: MapOwner) =>
    o.kind === 'campaign' ? { campaign_id: o.id } : { article_id: o.id }, [])

  // ── Selection ───────────────────────────────────────────────────────────────
  const selectMap = useCallback((map: GameMap | null) => {
    setCurrentMap(map)
    if (selectionKey && map) localStorage.setItem(selectionKey, String(map.id))
    onSelect?.(map)
  }, [selectionKey, onSelect])

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!owner) { setMaps([]); setCurrentMap(null); return }
    let cancelled = false
    listMaps(owner).then(fetched => {
      if (cancelled) return
      setMaps(fetched)
      onCountChange?.(fetched.length)
      const savedId = selectionKey ? Number(localStorage.getItem(selectionKey)) : NaN
      selectMap(fetched.find(m => m.id === savedId) ?? fetched[0] ?? null)
    })
    return () => { cancelled = true }
    // Keyed on the owner identity, not the callbacks: hosts pass inline
    // closures, and depending on those would refetch on every render.
  }, [ownerKey])

  // ── Mutations ───────────────────────────────────────────────────────────────
  const addMap = useCallback(async () => {
    if (!owner) return null
    setImporting(true)
    try {
      const picked = await pickImage(owner)
      if (!picked) return null
      const map = await window.api.createMap({
        ...ownerColumns(owner), name: picked.name, image_path: picked.path,
      })
      const next = [...maps, map]
      setMaps(next)
      onCountChange?.(next.length)
      selectMap(map)
      return map
    } finally {
      setImporting(false)
    }
  }, [owner, maps, pickImage, ownerColumns, selectMap, onCountChange])

  const renameMap = useCallback(async (map: GameMap, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const updated = await window.api.updateMap(map.id, { name: trimmed })
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
    setCurrentMap(prev => prev?.id === updated.id ? updated : prev)
  }, [])

  // Swaps the image but keeps the map row, so POIs, shapes and visit layers —
  // all keyed to the map id — survive the swap.
  const replaceImage = useCallback(async (map: GameMap) => {
    const result = await window.api.replaceMapImage(map.id)
    if (!result) return null
    const updated = await window.api.updateMap(map.id, { image_path: result.path })
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
    setCurrentMap(prev => prev?.id === updated.id ? updated : prev)
    return updated
  }, [])

  // Deleting the open map falls through to the first survivor, or to no map.
  const deleteMap = useCallback(async (id: number) => {
    await window.api.deleteMap(id)
    const next = maps.filter(m => m.id !== id)
    setMaps(next)
    onCountChange?.(next.length)
    if (currentMap?.id === id) selectMap(next[0] ?? null)
  }, [maps, currentMap, selectMap, onCountChange])

  /** Apply a locally-known update (e.g. a saved map scale) without a refetch. */
  const patchMap = useCallback((updated: GameMap) => {
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
    setCurrentMap(prev => prev?.id === updated.id ? updated : prev)
  }, [])

  return {
    maps, currentMap, importing,
    selectMap, addMap, renameMap, replaceImage, deleteMap, patchMap,
  }
}
