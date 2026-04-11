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
| UI framework | React 18 + TypeScript |
| Build tool | electron-vite |
| Database | SQLite via better-sqlite3 |
| Rich text | TipTap 2 |
| State | Zustand |
| Icons | Lucide React |

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
│   ├── main/index.ts       # Main process: window, SQLite, IPC handlers
│   └── preload/index.ts    # Secure bridge: exposes window.api
├── src/
│   ├── types/index.ts      # Shared TypeScript types
│   ├── store/store.ts      # Zustand global state
│   ├── components/
│   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   ├── MapCanvas.tsx       # Map image + POI marker overlay
│   │   ├── POIPanel.tsx        # Sliding POI detail panel
│   │   ├── RichEditor.tsx      # TipTap toolbar + editor
│   │   └── WikiLinkExtension.ts # Custom [[wikilink]] TipTap mark
│   ├── pages/
│   │   ├── CampaignsPage.tsx   # Campaign grid home
│   │   ├── CampaignDetailPage.tsx # Sessions list
│   │   ├── SessionPage.tsx     # Map tabs + canvas
│   │   └── WikiPage.tsx        # Wiki browser + article editor
│   └── index.css           # Dark grimoire theme + global styles
├── electron.vite.config.ts
└── package.json
```

### Adding New POI Types

In `src/components/POIPanel.tsx` and `src/components/MapCanvas.tsx`, extend the `POI_TYPES` / `TYPE_COLORS` arrays with your new type.

### Adding New Article Types

In `src/pages/WikiPage.tsx`, extend the `ARTICLE_TYPES` array.

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
