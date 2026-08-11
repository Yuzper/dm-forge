// path: src/store/workspacePersist.ts
// The workspace — both panes, their tabs, and the splitter — is persisted per
// campaign, so switching campaigns and coming back finds the layout you left.
// Tabs store ids only (see location.ts), which is what makes this safe to write
// to disk at all.
import type { Location } from './location'
import type { Tab } from './pane'
import { ALL_PANE_IDS, eachPaneEntry, type PaneId } from './paneRegistry'

// v2 added the second pane; v1 payloads (single pane) are migrated on read.
const VERSION = 2
const key = (campaignId: number) => `dmforge:tabs:v${VERSION}:${campaignId}`
const legacyKey = (campaignId: number) => `dmforge:tabs:v1:${campaignId}`

export interface PanePayload {
  tabs: Tab[]
  activeTabId: string | null
}

export interface WorkspacePayload {
  panes: Partial<Record<PaneId, PanePayload>>
  paneIds: PaneId[]
  activePaneId: PaneId
  splitRatio: number
}

const LOCATION_TYPES = new Set([
  'campaign', 'session', 'article', 'wiki', 'relations',
  'dm-notes', 'loot-tables', 'timeline', 'soundboard',
])

function validLocation(loc: unknown): loc is Location {
  return !!loc && typeof loc === 'object' && LOCATION_TYPES.has((loc as any).type)
}

function readPane(raw: any): PanePayload | null {
  const tabs: Tab[] = (raw?.tabs ?? [])
    .filter((t: any) => t && typeof t.id === 'string' && validLocation(t.location))
    .map((t: any) => ({
      id: t.id,
      location: t.location,
      // History is best-effort; a malformed entry just drops out.
      back: Array.isArray(t.back) ? t.back.filter(validLocation) : [],
      forward: Array.isArray(t.forward) ? t.forward.filter(validLocation) : [],
      viewState: t.viewState && typeof t.viewState === 'object' ? t.viewState : undefined,
    }))
  if (!tabs.length) return null
  const activeTabId = tabs.some(t => t.id === raw?.activeTabId) ? raw.activeTabId : tabs[0].id
  return { tabs, activeTabId }
}

/** Gathers live pane state from the registry — callers never assemble this. */
export function saveWorkspace(
  campaignId: number | null | undefined,
  meta: { paneIds: PaneId[]; activePaneId: PaneId; splitRatio: number },
) {
  if (!campaignId) return
  const panes: Partial<Record<PaneId, PanePayload>> = {}
  for (const { id, state } of eachPaneEntry()) {
    // A pane that is being closed is still registered at this moment; skipping
    // ids outside `paneIds` keeps its tabs off disk, so re-splitting after a
    // restart opens fresh rather than resurrecting a pane you closed.
    if (!meta.paneIds.includes(id)) continue
    panes[id] = { tabs: state.tabs, activeTabId: state.activeTabId }
  }
  try {
    localStorage.setItem(key(campaignId), JSON.stringify({ panes, ...meta } satisfies WorkspacePayload))
  } catch { /* quota or private mode — the workspace just won't survive restart */ }
}

export function loadWorkspace(campaignId: number | null | undefined): WorkspacePayload | null {
  if (!campaignId) return null
  try {
    const raw = localStorage.getItem(key(campaignId))
    if (raw) {
      const parsed = JSON.parse(raw)
      const panes: Partial<Record<PaneId, PanePayload>> = {}
      for (const id of ALL_PANE_IDS) {
        const p = readPane(parsed?.panes?.[id])
        if (p) panes[id] = p
      }
      if (!panes.p0) return null
      const paneIds = (Array.isArray(parsed?.paneIds) ? parsed.paneIds : ['p0'])
        .filter((id: any): id is PaneId => ALL_PANE_IDS.includes(id) && !!panes[id as PaneId])
      return {
        panes,
        paneIds: paneIds.length ? paneIds : ['p0'],
        activePaneId: paneIds.includes(parsed?.activePaneId) ? parsed.activePaneId : paneIds[0] ?? 'p0',
        splitRatio: typeof parsed?.splitRatio === 'number' ? clampRatio(parsed.splitRatio) : 0.5,
      }
    }

    // v1: a single pane's tabs, no split. Migrate into p0.
    const legacy = localStorage.getItem(legacyKey(campaignId))
    if (legacy) {
      const p = readPane(JSON.parse(legacy))
      if (p) return { panes: { p0: p }, paneIds: ['p0'], activePaneId: 'p0', splitRatio: 0.5 }
    }
    return null
  } catch {
    return null
  }
}

export function clampRatio(n: number): number {
  return Math.min(0.8, Math.max(0.2, n))
}

// ── Pinned locations ──────────────────────────────────────────────────────────
// The sidebar's curated list. Same shape and same safety as tabs — ids only, so
// a pinned article that gets deleted resolves to nothing and drops out of the
// list rather than resurrecting a ghost. Kept here to share `validLocation`.

const pinsKey = (campaignId: number) => `dmforge:pins:v1:${campaignId}`

export function savePins(campaignId: number | null | undefined, pins: Location[]) {
  if (!campaignId) return
  try {
    localStorage.setItem(pinsKey(campaignId), JSON.stringify(pins))
  } catch { /* quota or private mode — pins just won't survive restart */ }
}

export function loadPins(campaignId: number | null | undefined): Location[] {
  if (!campaignId) return []
  try {
    const raw = localStorage.getItem(pinsKey(campaignId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(validLocation) : []
  } catch {
    return []
  }
}
