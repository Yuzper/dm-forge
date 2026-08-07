// path: src/store/store.ts
// `useStore` is the single hook the whole app consumes. Underneath it now reads
// two stores — the campaign-wide shared slice and the current pane's slice —
// and presents them merged, so call sites never have to know which side a field
// lives on. That is what let the pane split land without touching ~100 call
// sites.
//
// Selector granularity is preserved: zustand's React binding compares the
// selected value, so `useStore(s => s.currentArticle)` still only re-renders
// when that article changes, not on every store write.
import { useStore as useZustandStore } from 'zustand'
import { sharedStore } from './shared'
import type { SharedSlice } from './shared'
import type { PaneSlice } from './pane'
import { getActivePane, type PaneStoreApi } from './paneRegistry'
import { usePaneStoreApi, defaultPaneStore } from '../context/PaneContext'

export type AppStore = SharedSlice & PaneSlice

export type { View, Tab, TabViewState } from './pane'
export type { StatBlockOverlayEntry } from './shared'
export type { Location } from './location'
export { sharedStore }

// ── Merged snapshot ───────────────────────────────────────────────────────────
// useSyncExternalStore requires getSnapshot to return a referentially stable
// value when nothing changed, so the merge is cached per pane and only rebuilt
// when one of the two underlying states actually swaps identity.

interface Cached { shared: SharedSlice; pane: PaneSlice; merged: AppStore }
const snapshots = new WeakMap<PaneStoreApi, Cached>()

function mergedSnapshot(pane: PaneStoreApi): AppStore {
  const shared = sharedStore.getState()
  const paneState = pane.getState()
  const hit = snapshots.get(pane)
  if (hit && hit.shared === shared && hit.pane === paneState) return hit.merged
  const merged = { ...shared, ...paneState } as AppStore
  snapshots.set(pane, { shared, pane: paneState, merged })
  return merged
}

// Which slice owns a given key. Derived from the pane store's own state so it
// can never drift from the actual split.
const PANE_KEYS = new Set(Object.keys(defaultPaneStore.getState()))

type Partialize = Partial<AppStore> | ((s: AppStore) => Partial<AppStore>)

function routeSetState(pane: PaneStoreApi, update: Partialize, replace?: boolean) {
  if (replace) throw new Error('useStore.setState(..., true) is not supported across the shared/pane split')
  const patch = typeof update === 'function' ? update(mergedSnapshot(pane)) : update
  const sharedPatch: Record<string, unknown> = {}
  const panePatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    (PANE_KEYS.has(k) ? panePatch : sharedPatch)[k] = v
  }
  if (Object.keys(sharedPatch).length) sharedStore.setState(sharedPatch as Partial<SharedSlice>)
  if (Object.keys(panePatch).length) pane.setState(panePatch as Partial<PaneSlice>)
}

// A StoreApi-shaped view over the pair, memoised so its identity is stable —
// zustand's binding subscribes through it.
interface MergedApi {
  getState: () => AppStore
  getInitialState: () => AppStore
  subscribe: (listener: (s: AppStore, prev: AppStore) => void) => () => void
  setState: (update: Partialize, replace?: boolean) => void
}

const apis = new WeakMap<PaneStoreApi, MergedApi>()

function mergedApi(pane: PaneStoreApi): MergedApi {
  const hit = apis.get(pane)
  if (hit) return hit
  const api: MergedApi = {
    getState: () => mergedSnapshot(pane),
    getInitialState: () => mergedSnapshot(pane),
    subscribe: (listener) => {
      let prev = mergedSnapshot(pane)
      const notify = () => {
        const next = mergedSnapshot(pane)
        if (next === prev) return
        const before = prev
        prev = next
        listener(next, before)
      }
      const offShared = sharedStore.subscribe(notify)
      const offPane = pane.subscribe(notify)
      return () => { offShared(); offPane() }
    },
    setState: (update, replace) => routeSetState(pane, update, replace),
  }
  apis.set(pane, api)
  return api
}

// ── The hook ──────────────────────────────────────────────────────────────────

function useStoreImpl(): AppStore
function useStoreImpl<T>(selector: (s: AppStore) => T): T
function useStoreImpl<T>(selector?: (s: AppStore) => T) {
  const pane = usePaneStoreApi()
  return useZustandStore(mergedApi(pane) as any, selector as any)
}

/** The pane the non-React escape hatches below resolve against. */
function activePane(): PaneStoreApi {
  return getActivePane() ?? defaultPaneStore
}

export const useStore = Object.assign(useStoreImpl, {
  /**
   * Merged shared + active-pane state, for callers outside React (event
   * handlers, Tiptap extensions). With one pane this is exact; once a second
   * pane exists it resolves against whichever pane has focus, so components
   * that need *their own* pane should prefer the hook.
   */
  getState: (): AppStore => mergedSnapshot(activePane()),
  setState: (update: Partialize, replace?: boolean) => routeSetState(activePane(), update, replace),
  subscribe: (listener: (s: AppStore, prev: AppStore) => void) => mergedApi(activePane()).subscribe(listener),
})
