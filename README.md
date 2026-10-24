# DM Forge 🎲

A desktop companion app for Dungeon Masters — manage campaigns, sessions, interactive maps with points of interest, and a full campaign wiki.

## Features

- **Campaign Manager** — organise multiple campaigns, each with sessions
- **Session Planner** — each session holds multiple maps (import PNG/JPEG)
- **Interactive Maps** — place Points of Interest anywhere on a map; click to open detailed side panels
- **POI Panels** — rich text descriptions, environment details, characters, loot, event triggers, and more
- **Campaign Wiki** — Wikipedia-style articles for locations, characters, items, quests, factions, and lore
- **Wiki Linking** — type `[[Article Title]]` anywhere to create links between articles
- **Rich Text Editor** — headings, bold/italic, lists, blockquotes, images, highlights, and more
- **Auto-save** — all content saves automatically as you type

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 29 |
| UI framework | React 19 + TypeScript 5 |
| Build tool | electron-vite (app) + Vite (player viewer) |
| Packaging | electron-builder, electron-updater |
| Database | SQLite via better-sqlite3 (WAL) |
| Rich text | TipTap 2 + custom marks/extensions |
| State | Zustand (split shared / per-pane stores) |
| Graphs & layout | ReactFlow, dagre, d3-force |
| Icons | Lucide React |

The app builds to four targets: the Electron **main** process, the **preload**
bridge, the **renderer** (the DM-facing React app), and a standalone **player
viewer** — a plain static web app with no Electron and no `window.api`, bundled
into the installer and copied into each published player site.

## Setup

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Python** (for native module compilation) — usually pre-installed on macOS/Linux; on Windows install via [python.org](https://python.org) or `winget install Python.Python.3`
- **Visual Studio Build Tools** (Windows only) — run `npm install --global windows-build-tools` as admin

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start in development mode
npm run dev
```

The app window will open automatically.

### Build for Distribution

```bash
# Build for your current platform
npm run package
```

Output will be in the `dist/` folder.

## Usage Guide

### Campaigns
1. Open the app — you start on the Campaigns screen
2. Click **New Campaign** and give it a name, system, and description
3. Click a campaign card to open it

### Sessions
1. Inside a campaign, click **New Session**
2. Name it (e.g. "Session 3: The Goblin Warren") and set a date
3. Click the session to enter it

### Maps & POIs
1. Inside a session, click **Import Map** to load a PNG or JPEG
2. Switch between maps using the tabs at the top
3. Click **View → Editing** mode (top-left toggle on the map)
4. In edit mode, **click anywhere on the map** to place a Point of Interest
5. The POI panel slides in from the right — rename the POI, set its type, and write notes
6. In view mode, **click any POI marker** to open its panel (read-only or editable)
7. Drag POIs to reposition them in edit mode

### Wiki
1. Click **Wiki** in the sidebar
2. Click **New** to create an article — choose a type (Location, Character, Item, etc.)
3. Write freely in the rich text editor
4. Type `[[Article Title]]` to create a wikilink to another article
5. Clicking a wikilink navigates to that article (creating it if it doesn't exist yet)

### Linking Wiki to POIs
In any POI panel, you can use `[[Article Title]]` in the rich text content to link to wiki articles. Clicking the link (while viewing) will jump to the wiki.

## Data Storage

All your data is stored locally on your machine:
- **Database**: `%APPDATA%/dm-forge/dmforge.db` (Windows) or `~/Library/Application Support/dm-forge/dmforge.db` (macOS) or `~/.config/dm-forge/dmforge.db` (Linux)
- **Images**: Same directory, in an `images/` subfolder

No data is ever sent anywhere. Everything is yours, offline-first.

## Development Notes

### Project Structure

```
dm-forge/
├── electron/
│   ├── main/
│   │   ├── index.ts            # Startup: menu → window → DB → register IPC
│   │   ├── db.ts               # SQLite schema (~27 tables) + column migrations
│   │   ├── defaults.ts         # Seed creatures, loot tables, sound library
│   │   ├── window.ts  appMenu.ts  menu.ts  contextMenu.ts  updater.ts
│   │   ├── relationsSync.ts    # Derives each campaign's auto "territory web"
│   │   └── ipc/                # One module per domain, each `register*IPC()`
│   │       ├── campaigns.ts  sessions.ts  maps.ts  articles.ts
│   │       ├── combat.ts  dmNotes.ts  lootTables.ts  relations.ts
│   │       ├── sounds.ts  clocks.ts  players.ts  search.ts
│   │       ├── files.ts  backup.ts
│   │       ├── publish.ts      # Electron shell for the player-site export
│   │       └── publishCore.ts  # Pure projection + crypto (no electron/db)
│   └── preload/index.ts        # contextBridge → window.api
├── src/                        # Renderer (DM-facing app)
│   ├── App.tsx                 # Pane layout, floating widgets, backgrounds
│   ├── types/index.ts          # Shared types incl. the window.api surface
│   ├── store/
│   │   ├── store.ts            # The merged `useStore` hook over both slices
│   │   ├── shared.ts           # Campaign-wide state (campaigns, articles, …)
│   │   ├── pane.ts             # Per-pane state: view, tabs, back/forward
│   │   ├── location.ts         # A Location = where a tab points, stored by id
│   │   ├── paneRegistry.ts     workspacePersist.ts
│   ├── context/                # MapContext, PaneContext (active-pane routing)
│   ├── pages/                  # One per `view`
│   │   ├── CampaignsPage.tsx   CampaignDetailPage.tsx  SessionPage.tsx
│   │   ├── WikiPage.tsx        DMNotesPage.tsx         LootTablesPage.tsx
│   │   └── RelationsPage.tsx   TimelinePage.tsx        SoundboardPage.tsx
│   ├── components/
│   │   ├── PaneView.tsx  TabStrip.tsx  PaneSplitter.tsx   # Workspace shell
│   │   ├── RichEditor.tsx                                 # TipTap toolbar + editor
│   │   ├── WikiLinkExtension.ts  WikiAutolinkExtension.ts
│   │   ├── SessionLinkExtension.ts  SpellLinkExtension.tsx  DmOnlyMark.ts
│   │   ├── MapCanvas.tsx  POIPanel.tsx  POIList.tsx
│   │   ├── CombatPanel.tsx  EncounterBalance.tsx  StatBlockEditor.tsx
│   │   ├── SoundboardWidget.tsx  GlobalSearch.tsx  SettingsModal.tsx
│   │   ├── map/                # POI markers, shape layers, measure, travel
│   │   ├── wiki/               # ArticleEditor, graph view, relations panel
│   │   ├── relations/          # ReactFlow relation-web canvas + modals
│   │   ├── campaign/           # Campaign hub, hub world map, sessions view
│   │   ├── clocks/  sidebar/
│   ├── constants/              # POI & article types, themes, sections, hints
│   ├── hooks/                  # Map viewport/shapes/measure, tabs, menus
│   ├── utils/                  # Geometry, travel, encounter budget, timeline
│   ├── data/                   # Spells 2014/2024, starter monsters, loot, sounds
│   └── index.css               # Theme tokens + global styles
├── viewer/                     # Player-facing static site (no Electron)
│   ├── src/App.tsx  MapView.tsx  GraphView.tsx  StatBlock.tsx
│   ├── src/crypto.ts           # WebCrypto decrypt of the published bundle
│   └── vite.config.ts          # Builds to dist-viewer/
├── docs/                       # Design plans (player pages, tabs & menus)
├── electron.vite.config.ts
└── package.json
```

### Architecture Notes

**Store split.** `useStore` is one hook over two Zustand stores: `shared.ts` holds
campaign-wide state (campaigns, sessions, arcs, the article index, players and
visibility grants, soundboard, appearance), while `pane.ts` holds what *one* view
of the campaign is showing (current view, tabs with their own back/forward stacks,
current article/map/POI). `store.ts` routes writes to the correct side and caches
merged snapshots per pane. Rule of thumb: if two panes could legitimately disagree
about a value, it belongs on the pane.

**Workspace.** `App.tsx` renders one or two panes; each `PaneView` is a tab strip
plus the page its active tab points at. Tabs store a `Location` by id rather than
an embedded row, so a persisted tab never holds a stale or deleted entity — labels
and icons resolve at render time from the shared caches.

**Articles are the source of truth.** Maps hang off articles, and sessions *attach*
article-maps (optionally scoped to a visit layer) rather than owning them.

**Publishing.** `publish.ts` writes a per-player static site: each player's redacted
corpus is projected first, and tags and backlinks are derived from *that* corpus
only — never the DM master. Bundles are encrypted PBKDF2-SHA256 → AES-256-GCM and
decrypted in the browser by the viewer.

### Adding New POI Types

In `src/constants/POITypes.ts`, add an entry to `POI_TYPE_LIST` (value, label, icon,
colour) and to `TYPE_ORDER`, then add the value to the `POIType` union in
`src/types/index.ts`.

### Adding New Article Types

In `src/components/wiki/wikiConstants.tsx`, add an entry to `ARTICLE_TYPES`, add the
value to the `ArticleType` union in `src/types/index.ts`, and give it a colour in
`src/constants/articleTypes.ts`.

## Roadmap Ideas

- [ ] Session notes panel alongside the map
- [ ] Initiative tracker overlay
- [ ] Export campaign to PDF
- [ ] Article backlinks (see what links here)
- [ ] Campaign cover image support
- [ ] POI image attachments
- [ ] Tag system for articles
- [ ] Map fog-of-war / reveal mechanic
- [ ] Quick-search across all POIs and articles (Cmd+K)
