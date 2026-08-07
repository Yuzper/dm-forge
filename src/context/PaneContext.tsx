// path: src/context/PaneContext.tsx
// Supplies the pane store that `useStore` resolves per-pane fields against.
//
// App wraps everything in a provider bound to the *active* pane, so chrome
// living outside the panes — the sidebar, the search palette — follows focus.
// Each pane then overrides that with its own store for its own subtree.
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createPaneStore } from '../store/pane'
import { registerPane, type PaneId, type PaneStoreApi } from '../store/paneRegistry'
import { sharedStore } from '../store/shared'

// Stores are created once per pane id and kept for the app's lifetime.
// Recreating on every mount would drop tab state on an incidental remount.
const stores = new Map<PaneId, PaneStoreApi>()

export function paneStoreFor(id: PaneId): PaneStoreApi {
  let s = stores.get(id)
  if (!s) { s = createPaneStore(); stores.set(id, s) }
  return s
}

/** The primary pane's store — the fallback when no provider is above. */
export const defaultPaneStore = paneStoreFor('p0')
registerPane('p0', defaultPaneStore)

const PaneContext = createContext<PaneStoreApi>(defaultPaneStore)

export function usePaneStoreApi(): PaneStoreApi {
  return useContext(PaneContext)
}

/** Binds a subtree to a specific pane. */
export function PaneProvider({ paneId, children }: { paneId: PaneId; children: ReactNode }) {
  const store = useMemo(() => paneStoreFor(paneId), [paneId])

  useEffect(() => {
    // p0 is registered at module load and outlives every mount; a second pane
    // registers on mount and unregisters when the split closes.
    if (paneId === 'p0') return
    const unregister = registerPane(paneId, store)
    const shared = sharedStore.getState()
    const seed = shared.consumePaneSeed(paneId)
    const retained = store.getState().tabs.length > 0

    if (retained) {
      // Closed via the pane button, so its tabs are still here — reopening
      // restores them. An explicit target still opens as a new tab.
      if (seed) void store.getState().openTab(seed)
    } else if (seed) {
      store.getState()._initTabs(null, null, seed)
    } else if (shared.currentCampaign) {
      // Nothing retained and no target: start at the campaign hub. This is the
      // case after the pane was emptied by closing its last tab.
      store.getState()._enterCampaign(shared.currentCampaign)
    }
    shared.persistWorkspace()
    return unregister
  }, [paneId, store])

  return <PaneContext.Provider value={store}>{children}</PaneContext.Provider>
}

/** Binds a subtree to whichever pane currently has focus. */
export function ActivePaneProvider({ children }: { children: ReactNode }) {
  // Subscribed directly rather than through useStore, which would be circular:
  // useStore resolves its pane *from* this context.
  const activePaneId = useSyncExternalStore(
    sharedStore.subscribe,
    () => sharedStore.getState().activePaneId,
  )
  // Resolved from the store cache, not the registry: a pane that has just been
  // split open is not registered until its provider's effect runs, and nothing
  // would re-render this to correct the fallback afterwards. That sent Ctrl+W
  // to the old pane, collapsing the wrong one.
  const store = paneStoreFor(activePaneId)
  return <PaneContext.Provider value={store}>{children}</PaneContext.Provider>
}

export { createPaneStore }
