# Workspace Tabs & Context Menus — Project Plan

Branch: `workspace-tabs` (context menus land on the same branch, last)
Status: Stages 0–4 done; Stage 5 (undo for deletes) is next
Last updated: 2026-08-07

---

## 1. Goal & user stories

Turn DM Forge from a one-page-at-a-time app into a workspace: multiple pages open as
tabs, two of them side by side, and right-click menus that act on entities wherever
they appear.

- As the **DM**, I keep the session's battle map open in one pane and the NPC's
  article in the other, and I stop losing my place every time I look something up.
- As the **DM**, I middle-click an article in the wiki list and it opens in a
  background tab, exactly like a browser.
- As the **DM**, I right-click an NPC — in the wiki list, on a relations node, on a
  graph node, in an autolinked span — and get the same menu every time.
- As the **DM**, I right-click in any text field and get cut/copy/paste, which the
  app does not have today at all.

Non-goals: more than two panes; tearing a tab into its own OS window; tabs surviving
a campaign switch (a workspace belongs to a campaign).

---

## 2. Sequencing: one design, four stages

Tabs first, context menus last. Not because the menus depend on tabs to *build* —
they don't — but because "Open in new tab" / "Open in other pane" is the single most
common item in this app's menus, and the dispatch layer should be born knowing
where a target can open.

The stages exist so the risky refactor is bisectable, not because the design is
provisional. **No stage produces work that a later stage deletes.**

| Stage | What lands | User-visible? |
|---|---|---|
| 0 | Application menu + native editing menus | Yes (small) |
| 1 | Store split into shared + per-pane, exactly one pane | **No — app must behave identically** |
| 2 | Tab model, tab strip, per-tab history, persistence | Yes (the feature) |
| 3 | Second pane, splitter, drag tab across panes | Yes |
| 4 | Context-menu registry across entity surfaces | Yes |
| 5 | Undo for deletes | Yes |

The reason Stage 1 is alone: it touches 39 files and 98 call sites. Bundled with new
UI, any breakage is ambiguous. Alone, "does the app still do exactly what it did
yesterday?" is a complete test.

---

## 3. Data model

```ts
// Shared store
workspace: {
  panes: Pane[]            // 1 or 2; the model allows N, the UI caps at 2
  activePaneId: string
  splitRatio: number       // 0..1, only meaningful with 2 panes
}

interface Pane {
  id: string
  tabs: Tab[]
  activeTabId: string
}

interface Tab {
  id: string
  location: Location       // today's HistoryEntry, slimmed — see below
  back: Location[]         // per-tab history, browser-style
  forward: Location[]
}
```

A tab *is* a location with memory. That is not a new concept in this codebase:
`HistoryEntry` ([store.ts:29](../src/store/store.ts:29)) is already a serializable
location descriptor and `_navigateToEntry` ([store.ts:392](../src/store/store.ts:392))
already restores any location from one. Both get reused nearly as-is.

### One change to `HistoryEntry`: stop embedding objects

Today an entry embeds the whole `Campaign` and `Session` row. That is fine for an
in-memory Recent list and wrong for something persisted to localStorage across
restarts — the rows go stale, and a deleted session leaves a tab holding a ghost.

```ts
type Location =
  | { type: 'campaign' }
  | { type: 'session';  sessionId: number }
  | { type: 'article';  articleId: number }
  | { type: 'wiki' }
  | { type: 'relations'; webId?: number | null }
  | { type: 'dm-notes';  pageId?: number | null }
  | { type: 'loot-tables' | 'timeline' | 'soundboard' }
```

Labels and icons are derived at render time from the shared caches (`sessions`,
`allArticles`) rather than frozen into the entry. A location whose row no longer
exists renders as a dead tab the user can close — not a crash.

The campaign is *not* part of a location, because:

### `currentCampaign` stays shared

Two panes always show the same campaign. This is the decision that keeps the refactor
small: every campaign-scoped cache — `campaigns`, `sessions`, `drafts`, `arcs`,
`allArticles`, `players`, `grants`, `soundBoards` — stays exactly where it is today.
Switching campaigns replaces the whole workspace.

---

## 4. The store split

### Stays shared (module singleton, unchanged)

- `campaigns`, `currentCampaign`, `loadCampaigns`, `createCampaign`, `updateCampaign`, `deleteCampaign`
- `sessions`, `drafts`, `loadSessions`, `createSession`, `deleteSession`, `updateSession`, `patchSessionInMemory`, `promoteSession`, `reorderDrafts`
- `arcs`, `lastUsedArcId`, all arc actions
- `allArticles`, `loadAllArticles`, `createArticle`, `updateArticle`, `deleteArticle`, `getArticleBacklinks`
- `players`, `grants`, `playersManagerOpen`, all player/visibility actions
- `soundboardOpen`, `soundboardMinimized`, `soundBoards`, `soundsVersion`, board actions
- `statBlockOverlays`, `openStatBlockOverlay`, `closeStatBlockOverlay`
- `bgStyle`, `colorTheme`, `textTheme`, `showHints`, `dismissedHints`
- `searchOpen`
- `workspace` (new)

### Moves per-pane

- `view`, `campaignSubView`
- `currentSession`, `selectSession`
- `maps`, `currentMap`, `selectMap`, `loadMaps`, `importMap`, `createScene`, `deleteMap`, `updateMap`, `reorderMaps`, `reorderSessionTabs`, `moveMapToSession`, `attachMapToSession`, `detachMapFromSession`
- `ghostLayerIds`, `toggleGhostLayer`, `rememberVisitView`, `showBaseLayer`, `toggleBaseLayer`
- `pois`, `selectedPOI`, `poiPanelOpen`, `editMode`, `sessionReadMode`, and the POI actions
- `articles` (the *filtered* list — driven by `wikiFilter`, so it is view state), `currentArticle`, `openArticle`, `selectArticle`, `navigateToArticleByTitle`, `loadArticles`
- `wikiFilter`, `wikiSearch`, `wikiTagFilter`, `wikiShowTags`, `wikiSearchFields`
- `relationsOpenWebId`, `relationsFocusArticleId`, `dmNotesOpenPageId`, `wikiGraphFocusId`
- `hintContext`, `hintMinimized`
- per-tab navigation (replaces `navigationHistory` / `navigateBack` / `navigateToHistoryEntry`)

Note `articles` vs `allArticles`: the filtered list is per-pane, the unfiltered cache
is shared. That split already exists in the code and comments
([store.ts:130](../src/store/store.ts:130)) — it lines up exactly.

### Sidebar "Recent" survives

Per-tab back/forward is *navigation*. The sidebar's Recent list is *discovery* —
different job. It stays, as a shared MRU of the last ~5 locations across all tabs,
and clicking one opens it in the active pane. Removing it would be a regression.

---

## 5. Migration mechanics

Three things make this safe rather than a big-bang rewrite.

### 5a. A merged hook keeps all 98 call sites compiling

Keep the name `useStore`. Reimplement it as a hook that subscribes to *both* the
shared singleton and the pane store from context, returning a merged snapshot:

```ts
// src/store/store.ts
export function useStore(): AppStore
export function useStore<T>(selector: (s: AppStore) => T): T
```

Implemented over `useSyncExternalStore` with a merged snapshot cached until either
store's version changes. Components carry on destructuring exactly as they do today;
whether a field is shared or per-pane becomes invisible at the call site. Splitting
imports for render-perf is a later, optional pass — not part of this work.

### 5b. Cross-slice fan-out needs a pane registry

A shared action that invalidates per-pane state must reach every live pane. Keep a
module-level `Set<PaneStore>` that providers add to on mount and remove on unmount.

Actions needing fan-out:

| Shared action | Must reach panes to… |
|---|---|
| `deleteArticle` | clear `currentArticle`, drop the tab, prune history |
| `updateArticle` | refresh `currentArticle` if it's the same row (title renames) |
| `deleteSession` | clear `currentSession`, `maps`, `pois`; drop the tab |
| `updateSession` | refresh `currentSession` |
| `deleteCampaign` | reset the whole workspace |
| `deleteSoundBoard` | already patches `currentSession.soundboard_id` — now per-pane |

This is the part most likely to produce subtle bugs. It is also the part that today's
code already does inline (`navigationHistory.filter(...)` at
[store.ts:687](../src/store/store.ts:687) and
[store.ts:1049](../src/store/store.ts:1049)) — the same logic, now fanned out.

### 5c. The 13 `getState()` sites are the fiddly bit

`useStore.getState()` outside React can only resolve the *shared* store — there is no
context to read. Call sites and their fix:

- **[RichEditor.tsx](../src/components/RichEditor.tsx) ×2, [WikiLinkExtension.ts](../src/components/WikiLinkExtension.ts), [WikiAutolinkExtension.ts](../src/components/WikiAutolinkExtension.ts)** — Tiptap extensions built inside a pane. Pass the pane store handle through the extension's options at construction. This is the only genuinely invasive change in Stage 1.
- **[GlobalSearch.tsx](../src/components/GlobalSearch.tsx), [PlayersManager.tsx](../src/components/PlayersManager.tsx)** — global overlays, outside any pane. They act on the *active* pane: use `getActivePaneStore()`.
- **[POIPanel.tsx](../src/components/POIPanel.tsx), [CombatPanel.tsx](../src/components/CombatPanel.tsx), [LootTableView/Editor/ResultModal](../src/components/LootTableView.tsx), [RelationsPage.tsx](../src/pages/RelationsPage.tsx), [DMNotesPage.tsx](../src/pages/DMNotesPage.tsx)** — rendered inside a pane; swap for a `usePaneStore()` handle captured in a ref.

### 5d. The sidebar lives outside the panes

`Sidebar` renders `POIList` under `StoreMapProvider` when `view === 'session'`
([Sidebar.tsx:328](../src/components/Sidebar.tsx:328)), and its breadcrumb/nav
buttons call `setView`. All of that must follow the **active pane**. So the sidebar
wraps its pane-dependent parts in an `<ActivePaneProvider>` that re-points as focus
moves between panes.

---

## 6. Stages in detail

### Stage 0 — application menu ✅ DONE 2026-07-31

There is no `Menu.setApplicationMenu` call anywhere in `electron/`, so Electron's
default menu is live — which means **Ctrl+W currently closes the window**. That has to
be ours before Stage 2 can bind it to "close tab."

Set an explicit application menu with proper roles. This also delivers, for free,
settle-first item 1 from TODO.txt: give the `context-menu` handler in
[window.ts:50](../electron/main/window.ts:50) an `params.isEditable` branch
(undo/redo/cut/copy/paste/select-all as Electron roles) and a `params.selectionText`
branch (copy). Roles mean paste works with no renderer plumbing at all.

*Acceptance:* right-click in any input offers editing commands; spellcheck
suggestions still appear on misspelled words; Ctrl+W no longer closes the window.

### Stage 1 — store split, one pane, zero behaviour change ✅ DONE 2026-07-31

Built: [shared.ts](../src/store/shared.ts), [pane.ts](../src/store/pane.ts),
[paneRegistry.ts](../src/store/paneRegistry.ts),
[PaneContext.tsx](../src/context/PaneContext.tsx), and [store.ts](../src/store/store.ts)
reduced to the merged `useStore`. No component call site changed.

Two things came out easier than this plan predicted:

- **The Tiptap plumbing (5c) was unnecessary.** All four extension call sites read
  only `allArticles` and `currentCampaign` — both of which stay *shared*, so they
  need no pane handle at all. Same for the loot and combat `getState()` sites.
- **`useStore.getState()` / `.setState()` needed no call-site changes either.** They
  resolve pane fields against the *active* pane and route mixed patches by key, so
  all 16 static-API sites kept working verbatim. (Stage 3 caveat: a component in a
  non-focused pane using the static API would resolve against the wrong pane. With
  one pane it is exact; revisit when the second lands.)

One deliberate fidelity choice: `deleteArticle` clears `currentArticle`
unconditionally on the initiating pane, matching pre-split behaviour, while sibling
panes only clear it if they were showing the deleted article.

*Verified in the running app* (2026-07-31) against a disposable copy of the real
database: campaign opens, then Wiki / Timeline / Loot Tables / Relations / DM Notes /
Sessions each render distinctly, and opening a session hydrates maps + POIs and the
sidebar POI list. The shared `currentCampaign` survived every pane `setView`. Zero
failures, zero non-security console errors. Driven headlessly by attaching to the
main process via `NODE_OPTIONS=--require` — no app code touched (see
[[project_verification_techniques]] in memory).

*Verified* by differential test rather than inspection: the pre-split store was
recovered from git, both versions were driven through an identical 16-step scripted
flow (campaign select → wiki filters → article update → session select → mixed
`setState` → session update → article delete → session delete), and the recorded
state snapshots were diffed. **Zero differences.** Separately confirmed snapshot
identity is stable when nothing changed (required by `useSyncExternalStore`), and
that the React binding renders with correct selector granularity.

### Stage 2 — tabs in one pane ✅ DONE 2026-08-07

Built: [location.ts](../src/store/location.ts) (id-based `Location` + label
derivation), [workspacePersist.ts](../src/store/workspacePersist.ts),
tab state and actions in [pane.ts](../src/store/pane.ts),
[TabStrip.tsx](../src/components/TabStrip.tsx),
[useTabShortcuts.ts](../src/hooks/useTabShortcuts.ts), and a rebuilt Recent list
in [Sidebar.tsx](../src/components/Sidebar.tsx).

Notes on what changed against this plan:

- **Tabs live on the pane store, not in a shared `workspace`.** Each pane owning
  its tabs makes Stage 3 purely additive — a second pane is a second store that
  already has tabs. Persistence walks panes instead of reading one blob.
- **Added `Tab.viewState`**, which this plan did not anticipate. Only the active
  tab is materialised, so without parking the outgoing tab's wiki filter / search /
  DM-notes page, returning to a filtered tab silently reset it.
- **Dead tabs render as "Unavailable" rather than being dropped at load.** The
  shared caches are not populated when tabs rehydrate, so there is nothing to
  validate against yet; letting the user close them is more forgiving than
  silently discarding a tab.
- **Pages must remount on a tab switch** (fixed 2026-08-07, found in use). Two tabs
  of the same kind share a `view`, so React kept the page mounted across a switch
  and its local state leaked between tabs. `RelationsPage` made it worse: its
  `patchLocation` effect wrote the *stale* `openWeb` onto the tab being switched
  to, so two relation tabs converged on one web. Fix is a `<Fragment key={activeTabId}>`
  around the page switch in [App.tsx](../src/App.tsx) — remounts without adding a
  DOM node — plus a `settled` guard in RelationsPage so its mount-time null
  doesn't erase the webId it is about to restore.
- **Tab labels need a name registry** (added 2026-08-07). Session and article tabs
  label themselves from the shared caches, but a relation web and a DM notes page
  have no cache — so two relation tabs both read "Relations". Added
  `locationNames` to the shared slice, filled on campaign select and then kept
  current by the pages *publishing the lists they already hold* (an effect on
  `webs` / `pages`) rather than ~10 mutation sites each remembering to invalidate.
  Renaming a web from inside the canvas view publishes explicitly, since that
  happens away from the hub's list.
- **The autosave risk turned out to be already covered.** `ArticleEditor` is
  rendered with `key={currentArticle.id}` ([WikiPage.tsx:289](../src/pages/WikiPage.tsx:289)),
  so switching between article tabs remounts it and its unmount-flush fires.

*Verified* three ways. Headless store flow: view state survives a tab switch
(`npc` → other tab shows `all` → back shows `npc`), background tabs don't steal
focus, `deleteArticle` closes its tab *and* scrubs the surviving tabs'
back/forward stacks, and closing every tab falls back rather than leaving an empty
strip. Real app: navigation doesn't spawn tabs, Ctrl+T inserts right of active,
Ctrl+Tab/1/9 move focus, per-tab Back moves only its own tab, Ctrl+W closes.
Restart round-trip: six tabs built, app exited, relaunched — same six tabs, same
order.

### Stage 2 — original plan

- Tab strip above `<main>` in [App.tsx](../src/App.tsx). Reuse the drag-reorder tab
  pattern already built for map tabs in
  [SessionPage.tsx:680](../src/pages/SessionPage.tsx:680) — same visual language,
  proven interaction.
- Per-tab back/forward; sidebar Recent becomes shared MRU.
- Ctrl+T (new), Ctrl+W (close), Ctrl+Tab / Ctrl+Shift+Tab (cycle), Ctrl+1..9 (jump),
  middle-click to close, middle-click a link to open in a background tab.
- Persist `workspace` to localStorage keyed by campaign id; rehydrate by id on load,
  dropping locations whose rows are gone.
- Guard: closing a tab with an unsaved editor buffer. `RichEditor` autosaves with a
  debounce flushed on unmount ([SessionPage.tsx:338](../src/pages/SessionPage.tsx:338)) —
  confirm that flush still runs on tab close, not just on unmount-by-navigation.

*Acceptance:* open six tabs, restart the app, get six tabs back. Delete an article in
one tab, its tab elsewhere closes cleanly.

### Stage 3 — the second pane ✅ DONE 2026-08-07

Built: pane ids + registry rework ([paneRegistry.ts](../src/store/paneRegistry.ts)),
pane layout state in [shared.ts](../src/store/shared.ts),
[PaneView.tsx](../src/components/PaneView.tsx),
[PaneSplitter.tsx](../src/components/PaneSplitter.tsx),
`ActivePaneProvider` in [PaneContext.tsx](../src/context/PaneContext.tsx), and a
workspace-wide persistence format (v2, migrating v1 single-pane payloads).

Notes against this plan:

- **Pane ids are fixed strings** (`p0`/`p1`) rather than generated. The UI caps at
  two, and stable ids make per-pane persistence trivial to key.
- **`ActivePaneProvider` was the piece this plan under-specified.** Chrome outside
  the panes — the sidebar, the search palette, the tab shortcuts — has to resolve
  `useStore` against whichever pane has focus. App wraps everything in a provider
  bound to the active pane; each pane then overrides it for its own subtree. The
  shortcuts hook had to move *inside* that provider, since App's own body sits
  outside it and would have always acted on `p0`.
- **Splitting opens the new pane at the campaign hub** (changed 2026-08-07 on user
  feedback; it originally duplicated the active tab's location). Duplicating just
  gives you the same page twice; the hub is a launchpad. An explicit target still
  wins, which is the hook Stage 4's "Open in other pane" will use. A pane closed
  via its own button keeps its tabs and restores them on re-split; a pane emptied
  by closing its last tab starts fresh. `saveWorkspace` skips panes outside
  `paneIds`, so a closed pane leaves nothing on disk to resurrect after a restart.
- **Bug found in use and fixed:** `ActivePaneProvider` resolved the focused pane
  through the *registry*, but a just-split pane is not registered until its
  provider's effect runs — so it fell back to `p0`, and nothing re-rendered to
  correct it. Ctrl+W then collapsed the wrong pane. It now resolves through the
  store cache (`paneStoreFor`), which is populated synchronously; `setActivePaneId`
  likewise no longer requires registration.
- **Closing a split pane's last tab collapses the pane** rather than falling back
  to a campaign tab.
### Stage 3 — original plan

- Splitter with a draggable ratio; cap at 2 panes.
- Drag a tab from one pane's strip to the other's.
- "Open in split" from the command palette and (Stage 4) context menus.
- Focus ring / subtle active-pane indicator, since the sidebar now follows focus.
- Closing the last tab in a pane collapses that pane.

*Acceptance:* map in the left pane, article in the right, edit both without either
losing state.

### Stage 4 — context menus ✅ DONE 2026-08-07

Built: [menu.ts](../electron/main/menu.ts) (the `menu:popup` channel),
[contextMenus.ts](../src/utils/contextMenus.ts) (pure builders),
[useContextMenu.ts](../src/hooks/useContextMenu.ts) (dispatch + the store-bound
`MenuCtx`), [clipboard.ts](../src/utils/clipboard.ts), plus `navigateTo` and the
tab-management actions on [pane.ts](../src/store/pane.ts).

Surfaces wired: wiki cards · wiki graph nodes · relations canvas nodes ·
wiki-link and autolink spans in the editor · backlink / affiliation / geography
chips · sidebar Recent rows · tab strip (and the blank strip) · soundboard
library and board rows · the soundboard widget · session rows and draft rows ·
DM notes pages · campaign cards · loot table rows · timeline entries (axis and
outline) · map pins, regions and bare canvas on both the session map and the
world map · shape vertices.

Notes on what changed against this plan:

- **Builders are pure; ids are assigned by the dispatcher.** A builder returns
  items carrying plain `click` closures and never names an id, so two menus
  can't collide and no builder has to invent a namespace. `showContextMenu`
  numbers them, strips the closures for IPC, and runs whichever id comes back.
- **The hook subscribes to nothing.** `useMenuCtx` captures the pane store
  handle and reads state at click time, so putting a menu on 300 article cards
  costs zero extra re-renders. That's why `useArticleContextMenu()` could be
  sprinkled across every chip and link in the app without a perf pass.
- **"Show in relations" is resolved per right-click.** One indexed query
  (`listRelationWebsForMember`) runs while the menu is being built, which is
  what lets the item be a real submenu when an article is in several webs — and
  be absent rather than a dead end when it's in none. This is the only reason
  `buildArticleMenu` is async.
- **Menus resolve from both the click and the dismissal** (fixed after probing).
  The plan's `setTimeout(…, 0)` guard is still there, but the click handler now
  resolves the promise directly too. A promise settles once, so the ordering
  race the TODO warned about stops mattering — proven by clicking an item and
  dismissing the menu in the same tick, which the timeout alone lost.
- **Separators are tidied at dispatch time.** Builders compose optional sections,
  so a menu with no relation webs, no stat block and no delete used to render
  doubled and dangling rules. `tidy()` drops them, and no builder has to reason
  about which of its neighbours survived.
- **Accelerators are shown but never registered** (`registerAccelerator: false`).
  A popup menu that registered Ctrl+W would fight the renderer's own handler and
  undo Stage 0's deliberate unbinding.
- **The map canvas menu always appears** (fixed after probing). It first only
  built a menu when the pointer was over the image, so the letterboxed margin —
  and any map whose image failed to load — gave nothing at all. Now only the
  positional items need a point; "Reset view" is always offered.
- **The vertex right-click became an actual menu.** It used to delete the corner
  outright with nothing advertising it; it now offers "Remove point", which is
  what this plan asked for.
- **Tab menus were not in the plan** but are the most expected right-click in a
  tabbed app: close / close others / close to the right / duplicate / move to
  the other pane. They needed `closeOtherTabs`, `closeTabsToRight`,
  `duplicateTab` and an `after` option on `openTab`.
- **Campaign cards and loot rows get no open-trio**, because neither is a
  `Location`: switching campaigns replaces the whole workspace, and every loot
  table shares the single `loot-tables` location. Their menus are accelerators
  only. Campaign delete also keeps its confirm dialog — an in-memory undo stack
  is not the right safety net for losing a campaign.
- **Destructive items fire immediately, as decided** — except where the surface
  can't own the deletion: session-notes pages in DM Notes (they mirror a
  session's notes) and library sounds from the *widget* (the library is
  app-wide and the widget is used mid-session).

*Verified in the running app* against a disposable copy of the real database:
43 checks across five probes, zero failures, no renderer console errors. The
`menu:popup` round trip was exercised for real — template in, native menu built
and popped, item clicked, id back — by wrapping `Menu.buildFromTemplate` in the
probe to get a handle on the built menu. Every other surface was driven with the
handler swapped for a spy, which both records the template each surface produces
and lets the probe pick an item and confirm the action ran (Duplicate tab adds a
tab; Open in new tab adds a background tab; Open in split view opens the second
pane seeded with the article, after which the third item re-words itself to
"Open in other pane"). Confirmed too that plain prose in the editor is *not*
claimed, so the native cut/copy/paste menu still wins there.

Two things the probes had to learn the hard way, worth remembering for Stage 5:
the disposable profile must be **wiped between runs** (the app persists its
workspace and hub layout to localStorage, so a leftover profile changes which
screen a probe starts on), and the real `images` directory has to be
**junctioned into the profile** — map pins and regions only render once the
image loads, so without it the map probes report false failures.

### Stage 4 — original plan

Per TODO.txt, keyed by **entity**, not by screen:

```
src/utils/contextMenus.ts   -> buildArticleMenu(article, ctx), buildMapMenu, buildSoundMenu, …
src/hooks/useContextMenu.ts -> returns an onContextMenu handler
```

One generic `menu:popup` IPC channel: the renderer sends a serializable template
(id, label, type, enabled, accelerator), main builds and pops it, and resolves with
the chosen id. Keep the gotcha you noted — resolve on `setTimeout(…, 0)`, since
`menu.popup`'s callback can fire before the item's own click handler.

Every entity menu gets **Open** / **Open in new tab** / **Open in other pane** at the
top, which is the whole reason this stage is last.

**Destructive items fire immediately — decided 2026-07-31.** `useConfirmDelete`'s
click-again-within-3s ([useConfirmDelete.ts](../src/hooks/useConfirmDelete.ts)) cannot
work in a native menu, which closes on the first click. Rather than build a
replacement confirm step, context-menu deletes just delete. The kebab menus keep
their existing click-again behaviour untouched, so the deliberate path stays
deliberate. Saves the confirm-dialog work entirely.

Order of surfaces: article surfaces (wiki cards, relations nodes, graph nodes,
autolinked spans) → soundboard sounds → Tier 2 accelerators (session cards, DM notes
pages, campaign cards, loot rows, timeline events) → map canvas last.

**One correction to the TODO's risk note.** The right-click conflict on the map is
much narrower than "right-click is already taken." `onVertexContextMenu`
([useShapeDrawing.ts:345](../src/hooks/useShapeDrawing.ts:345)) early-returns unless
`editing` is true, and only fires on a vertex handle. So it is not a map-wide
conflict at all: while actively editing a shape, right-click on a vertex keeps its
current meaning; everywhere else on the canvas the menu is free. Add "Remove point"
to the vertex menu anyway for discoverability. Map canvas still goes last, because
it is the only surface with any existing binding.

*Acceptance:* right-clicking the same NPC in five different places gives one menu.

---

### Stage 5 — undo for deletes

Decided 2026-07-31, reversing the earlier "no trash/undo" call — right-click puts
deletion one gesture away, so it needs a way back.

- **Scope: deletes only.** Edits are autosaved and visible; a delete is the only
  action that silently destroys something. Renames/moves/reorders stay un-undoable.
- **Mechanism: in-memory restore stack.** Each destructive IPC handler captures the
  row *and its dependents* before deleting, and returns that snapshot; undo
  re-inserts it with the original ids. No schema change, no query changes, no risk
  of a missed `deleted_at` filter resurrecting data.
- The stack is lost on restart. Acceptable — this exists for "wrong menu item", not
  for archaeology.
- Ctrl+Z routes to this stack only when focus is **not** in a text field, so Tiptap
  keeps owning prose undo. The Edit menu's `undo` role (added Stage 0) continues to
  serve text.
- The real cost is per-entity cascade capture: deleting an article also touches
  relations edges, visibility grants, web nodes, and POI link targets. Each entity
  type needs its snapshot shape worked out and tested.

Runs after Stage 4 — right-click is what makes it urgent, and Stage 4 is what tells
us which deletes are reachable in one click.

## 7. Risks

- **Stage 1 has no payoff and all the risk.** Mitigated by shipping it alone, and by
  the acceptance criterion being "nothing changed."
- **The merged `useStore` re-renders more than a split one would.** The no-arg form
  already re-renders on any change today, so this is not a regression — but the
  selector form must not silently become coarser. Worth a look at
  [MapCanvas.tsx](../src/components/MapCanvas.tsx) and
  [WikiGraphView.tsx](../src/components/wiki/WikiGraphView.tsx), the two heaviest
  renderers.
- **Tiptap extension plumbing** (5c) is the one place Stage 1 cannot stay mechanical.
- **Native menus are OS chrome** — light-themed on Windows, no icons, no swatches.
  Already accepted in TODO.txt; the escape hatch is that any single menu needing a
  colour swatch falls back to the existing `.menu-item` pattern.

---

## 8. Open questions

1. ~~**Does the empty-map-canvas menu include create actions**~~ — **answered
   yes, 2026-08-07, and shipped.** Placing something *at a spot* is inherently
   positional, and the toolbar can only ever mean "next click", which is a worse
   way to say the same thing. The canvas menu offers "New point of interest
   here" (edit mode only) and "Measure from here" (once the map has a scale).
   Region drawing was deliberately left out: starting a polygon is a multi-click
   gesture, so a one-shot menu item can't finish it, and switching the tool from
   a menu just hides what the toolbar already says plainly. Say so if you'd
   rather the canvas stayed view-only — it is two lines to remove.
2. **Does a tab remember scroll position and transient view state?** Cheap for the
   wiki list, awkward for a zoomed map viewport. Proposal: persist map viewport
   (it's already stateful via `useMapViewport`), skip scroll for everything else in
   Stage 2, revisit if it grates.
3. **What happens to the workspace on campaign switch?** Proposal: each campaign
   keeps its own persisted workspace, so switching back restores the tabs you left.
4. **Should the second pane be openable without a tab strip of its own** (a simple
   "peek" pane) — or is it a full peer with its own tabs? Plan assumes full peer;
   it's the same code either way, so this is purely a UI-density call.
