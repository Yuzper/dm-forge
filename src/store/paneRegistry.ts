// path: src/store/paneRegistry.ts
// Every live pane store registers itself here so campaign-level actions in the
// shared slice can reach per-pane state they invalidate — deleting a session has
// to clear it out of whichever panes are showing it.
//
// Pane ids are fixed strings ('p0', 'p1') rather than generated, because the UI
// caps at two panes and stable ids make per-pane persistence trivial to key.
import type { StoreApi } from 'zustand'
import type { PaneSlice } from './pane'

export type PaneStoreApi = StoreApi<PaneSlice>
export type PaneId = 'p0' | 'p1'

export const ALL_PANE_IDS: PaneId[] = ['p0', 'p1']

const panes = new Map<PaneId, PaneStoreApi>()

// The pane that owns focus. `useStore.getState()` / `.setState()` — the
// non-React escape hatches — resolve pane fields against this one, and the
// sidebar follows it.
let activePaneId: PaneId = 'p0'

export function registerPane(id: PaneId, store: PaneStoreApi): () => void {
  panes.set(id, store)
  return () => {
    panes.delete(id)
    if (activePaneId === id) activePaneId = panes.keys().next().value ?? 'p0'
  }
}

export function getPane(id: PaneId): PaneStoreApi | undefined {
  return panes.get(id)
}

export function livePaneIds(): PaneId[] {
  return ALL_PANE_IDS.filter(id => panes.has(id))
}

export function setActivePaneId(id: PaneId) {
  // Deliberately not gated on registration: splitPane focuses the new pane
  // before its provider has mounted, and dropping that would leave the
  // non-React escape hatches resolving against the pane you just left.
  activePaneId = id
}

export function getActivePaneId(): PaneId {
  return activePaneId
}

export function getActivePane(): PaneStoreApi | null {
  return panes.get(activePaneId) ?? panes.values().next().value ?? null
}

export function paneIdOf(store: PaneStoreApi): PaneId | null {
  for (const [id, s] of panes) if (s === store) return id
  return null
}

/** Run `fn` against every live pane, optionally skipping the one that initiated. */
export function forEachPane(fn: (pane: PaneSlice) => void, except?: PaneStoreApi) {
  for (const store of panes.values()) {
    if (store === except) continue
    fn(store.getState())
  }
}

/** Snapshot every live pane's tab state, for persistence. */
export function eachPaneEntry(): { id: PaneId; state: PaneSlice }[] {
  return livePaneIds().map(id => ({ id, state: panes.get(id)!.getState() }))
}
