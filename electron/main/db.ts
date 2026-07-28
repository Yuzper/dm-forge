// path: electron/main/db.ts
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import log from 'electron-log'
import { syncCreatureImages, loadDefaultLootTables } from './defaults'

// Live binding — assigned once by initDatabase() at startup, imported everywhere.
export let db!: InstanceType<typeof Database>

export function initDatabase() {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'dmforge.db')
  const imagesPath = path.join(userDataPath, 'images')
  if (!fs.existsSync(imagesPath)) fs.mkdirSync(imagesPath, { recursive: true })
  syncCreatureImages(imagesPath)
  const soundsPath = path.join(userDataPath, 'sounds')
  if (!fs.existsSync(soundsPath)) fs.mkdirSync(soundsPath, { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      system      TEXT    NOT NULL DEFAULT 'D&D 5e',
      cover_image TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS arcs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      color       TEXT    NOT NULL DEFAULT '#c8a84b',
      is_default  INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id    INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name           TEXT    NOT NULL,
      session_number INTEGER NOT NULL DEFAULT 1,
      session_sub    TEXT    NOT NULL DEFAULT '',
      arc_id         INTEGER,
      date           TEXT,
      notes          TEXT    NOT NULL DEFAULT '',
      is_draft       INTEGER NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      image_path TEXT    NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pois (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      label      TEXT    NOT NULL,
      x          REAL    NOT NULL,
      y          REAL    NOT NULL,
      content    TEXT    NOT NULL DEFAULT '{"type":"doc","content":[]}',
      poi_type   TEXT    NOT NULL DEFAULT 'location',
      color      TEXT    NOT NULL DEFAULT '#c8a84b',
      loot_table TEXT    NOT NULL DEFAULT '{"name":"Loot","items":[]}',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- POI visit-layers on a map. POIs with layer_id NULL form the "base layer"
    -- (the place's own features, edited from its location article); each visit
    -- to the location gets its own layer holding that visit's POIs.
    CREATE TABLE IF NOT EXISTS map_layers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- A session "runs" an article-owned map on a specific layer. Several
    -- sessions may share one layer (a visit spanning multiple sessions);
    -- a later revisit links the same map with a fresh layer.
    CREATE TABLE IF NOT EXISTS session_maps (
      session_id INTEGER NOT NULL REFERENCES sessions(id)   ON DELETE CASCADE,
      map_id     INTEGER NOT NULL REFERENCES maps(id)       ON DELETE CASCADE,
      layer_id   INTEGER NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, map_id)
    );

    CREATE TABLE IF NOT EXISTS articles (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      title            TEXT    NOT NULL,
      content          TEXT    NOT NULL DEFAULT '{"type":"doc","content":[]}',
      article_type     TEXT    NOT NULL DEFAULT 'location',
      tags             TEXT    NOT NULL DEFAULT '[]',
      cover_image      TEXT,
      portrait_image   TEXT,
      tracks           TEXT    NOT NULL DEFAULT '{}',
      statblock        TEXT    NOT NULL DEFAULT '{}',
      item_block       TEXT    NOT NULL DEFAULT '',
      loot_table       TEXT    NOT NULL DEFAULT '{"name":"Loot","items":[]}',
      status           TEXT    NOT NULL DEFAULT '',
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(campaign_id, title)
    );

    CREATE TABLE IF NOT EXISTS combat_encounters (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      poi_id     INTEGER NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(poi_id)
    );

    CREATE TABLE IF NOT EXISTS combat_creatures (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      encounter_id          INTEGER NOT NULL REFERENCES combat_encounters(id) ON DELETE CASCADE,
      article_id            INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      instance_number       INTEGER NOT NULL DEFAULT 1,
      max_hp                INTEGER NOT NULL DEFAULT 0,
      current_hp            INTEGER NOT NULL DEFAULT 0,
      ac_override           INTEGER,
      is_dead               INTEGER NOT NULL DEFAULT 0,
      initiative            INTEGER,
      loot_result           TEXT,
      resources             TEXT    NOT NULL DEFAULT '[]',
      variant_name          TEXT,
      variant_statblock     TEXT,
      variant_loot_table_id INTEGER,
      variant_loot_table    TEXT,
      cr                    TEXT,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dm_notes_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL DEFAULT 'New Group',
      color       TEXT    NOT NULL DEFAULT '#9b7de8',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dm_notes_pages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL DEFAULT 'Untitled',
      content     TEXT    NOT NULL DEFAULT '{"type":"doc","content":[]}',
      group_id    INTEGER REFERENCES dm_notes_groups(id) ON DELETE SET NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loot_tables (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      category    TEXT    NOT NULL DEFAULT 'custom',
      items       TEXT    NOT NULL DEFAULT '[]',
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relation_webs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL DEFAULT 'New Web',
      description TEXT    NOT NULL DEFAULT '',
      template    TEXT    NOT NULL DEFAULT 'custom',
      ranks       TEXT    NOT NULL DEFAULT '[]',
      article_id  INTEGER REFERENCES articles(id) ON DELETE SET NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relation_nodes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      web_id     INTEGER NOT NULL REFERENCES relation_webs(id) ON DELETE CASCADE,
      article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
      label      TEXT    NOT NULL DEFAULT 'New node',
      node_type  TEXT    NOT NULL DEFAULT 'person',
      rank_id    TEXT    NOT NULL DEFAULT '',
      pos_x      REAL    NOT NULL DEFAULT 100,
      pos_y      REAL    NOT NULL DEFAULT 100,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relation_edges (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      web_id       INTEGER NOT NULL REFERENCES relation_webs(id) ON DELETE CASCADE,
      from_node_id INTEGER NOT NULL REFERENCES relation_nodes(id) ON DELETE CASCADE,
      to_node_id   INTEGER NOT NULL REFERENCES relation_nodes(id) ON DELETE CASCADE,
      label_from   TEXT    NOT NULL DEFAULT '',
      label_to     TEXT    NOT NULL DEFAULT '',
      edge_type    TEXT    NOT NULL DEFAULT 'standard',
      from_handle  TEXT    NOT NULL DEFAULT '',
      to_handle    TEXT    NOT NULL DEFAULT '',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relation_web_articles (
      web_id     INTEGER NOT NULL REFERENCES relation_webs(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id)      ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (web_id, article_id)
    );

    CREATE TABLE IF NOT EXISTS sound_boards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL DEFAULT 'New Board',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sounds (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id   INTEGER NOT NULL REFERENCES sound_boards(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL DEFAULT 'Untitled',
      category   TEXT    NOT NULL DEFAULT 'effect',
      file_path  TEXT    NOT NULL DEFAULT '',
      hotkey     TEXT    NOT NULL DEFAULT '',
      volume     REAL    NOT NULL DEFAULT 1.0,
      loop       INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clocks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      article_id  INTEGER          REFERENCES articles(id)  ON DELETE CASCADE,
      name        TEXT    NOT NULL DEFAULT 'New clock',
      segments    INTEGER NOT NULL DEFAULT 6,
      filled      INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'active',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Player-facing pages ──────────────────────────────────────────────────
    -- Players who get a curated, per-player read-only view of the wiki/map.
    -- The password is a DM-assigned share password kept locally; at publish time it
    -- derives that player's bundle-encryption key (see docs/player-pages-plan.md).
    CREATE TABLE IF NOT EXISTS players (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      username      TEXT    NOT NULL,
      display_name  TEXT    NOT NULL DEFAULT '',
      password      TEXT    NOT NULL DEFAULT '',
      pc_article_id INTEGER          REFERENCES articles(id) ON DELETE SET NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(campaign_id, username)
    );

    -- Deny-by-default visibility grants: one row = "this entity is visible to this
    -- grantee." No row = hidden. player_id NULL means the whole party (all players).
    -- Polymorphic over first-class entities only (article/map/poi/layer); track &
    -- subtrack visibility lives in a companion JSON on the article, not here.
    CREATE TABLE IF NOT EXISTS visibility_grants (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      entity_type TEXT    NOT NULL,   -- 'article' | 'map' | 'poi' | 'layer'
      entity_id   INTEGER NOT NULL,
      player_id   INTEGER          REFERENCES players(id) ON DELETE CASCADE,  -- NULL = party
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Grant uniqueness needs two partial indexes because SQLite treats NULLs as
  // distinct in a normal UNIQUE — so (type,id,NULL) party rows wouldn't dedupe.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_party
      ON visibility_grants(entity_type, entity_id)
      WHERE player_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_player
      ON visibility_grants(entity_type, entity_id, player_id)
      WHERE player_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_grants_campaign ON visibility_grants(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_players_campaign ON players(campaign_id);
  `)

  // ── Migrations for existing databases ────────────────────────────────────────
  const articleCols = db.pragma('table_info(articles)') as { name: string }[]
  if (!articleCols.some(c => c.name === 'tracks')) {
    db.exec(`ALTER TABLE articles ADD COLUMN tracks TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!articleCols.some(c => c.name === 'statblock')) {
    db.exec(`ALTER TABLE articles ADD COLUMN statblock TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!articleCols.some(c => c.name === 'item_block')) {
    db.exec(`ALTER TABLE articles ADD COLUMN item_block TEXT NOT NULL DEFAULT ''`)
  }
  if (!articleCols.some(c => c.name === 'loot_table')) {
    db.exec(`ALTER TABLE articles ADD COLUMN loot_table TEXT NOT NULL DEFAULT '{"name":"Loot","items":[]}'`)
  }
  if (!articleCols.some(c => c.name === 'loot_table_id')) {
    db.exec(`ALTER TABLE articles ADD COLUMN loot_table_id INTEGER REFERENCES loot_tables(id) ON DELETE SET NULL`)
  }
  if (!articleCols.some(c => c.name === 'substeps')) {
  db.exec(`ALTER TABLE articles ADD COLUMN substeps TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!articleCols.some(c => c.name === 'rewards')) {
    db.exec(`ALTER TABLE articles ADD COLUMN rewards TEXT NOT NULL DEFAULT '[]'`)
  }
  // Per-track / per-milestone player visibility (companion to `tracks`). JSON:
  // { tracks: { <key>: {mode,players?} }, milestones: { <id>: {mode,players?} } }.
  // Empty = inherit-by-default (see docs/player-pages-plan.md).
  if (!articleCols.some(c => c.name === 'track_visibility')) {
    db.exec(`ALTER TABLE articles ADD COLUMN track_visibility TEXT NOT NULL DEFAULT '{}'`)
  }


  // Mapless "scenes" are map rows with an empty image_path; this column holds
  // their rich-text body (unused/empty for image maps).
  const mapContentCols = db.pragma('table_info(maps)') as { name: string }[]
  if (!mapContentCols.some(c => c.name === 'content')) {
    db.exec(`ALTER TABLE maps ADD COLUMN content TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}'`)
  }

  // Distance-scale calibration for the world-map travel/measure tool: a JSON
  // MapScale ({ x1,y1,x2,y2, distance, unit }) or NULL when not yet calibrated.
  if (!mapContentCols.some(c => c.name === 'map_scale')) {
    db.exec(`ALTER TABLE maps ADD COLUMN map_scale TEXT`)
  }

  const poiCols = db.pragma('table_info(pois)') as { name: string }[]
  if (!poiCols.some(c => c.name === 'loot_table')) {
    db.exec(`ALTER TABLE pois ADD COLUMN loot_table TEXT NOT NULL DEFAULT '{"name":"Loot","items":[]}'`)
  }
  if (!poiCols.some(c => c.name === 'loot_table_id')) {
    db.exec(`ALTER TABLE pois ADD COLUMN loot_table_id INTEGER REFERENCES loot_tables(id) ON DELETE SET NULL`)
  }
  if (!poiCols.some(c => c.name === 'hub_links')) {
    db.exec(`ALTER TABLE pois ADD COLUMN hub_links TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!poiCols.some(c => c.name === 'hub_size')) {
    db.exec(`ALTER TABLE pois ADD COLUMN hub_size REAL NOT NULL DEFAULT 11`)
  }
  if (!poiCols.some(c => c.name === 'hub_opacity')) {
    db.exec(`ALTER TABLE pois ADD COLUMN hub_opacity REAL NOT NULL DEFAULT 1`)
  }
  // NULL = base layer (place features); set = belongs to that visit layer.
  if (!poiCols.some(c => c.name === 'layer_id')) {
    db.exec(`ALTER TABLE pois ADD COLUMN layer_id INTEGER REFERENCES map_layers(id) ON DELETE CASCADE`)
  }

  const creatureCols = db.pragma('table_info(combat_creatures)') as { name: string }[]
  if (!creatureCols.some(c => c.name === 'loot_result')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN loot_result TEXT`)
  }
  if (!creatureCols.some(c => c.name === 'resources')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN resources TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!creatureCols.some(c => c.name === 'variant_name')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN variant_name TEXT`)
  }
  if (!creatureCols.some(c => c.name === 'variant_statblock')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN variant_statblock TEXT`)
  }
  if (!creatureCols.some(c => c.name === 'variant_loot_table_id')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN variant_loot_table_id INTEGER`)
  }
  if (!creatureCols.some(c => c.name === 'variant_loot_table')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN variant_loot_table TEXT`)
  }
  if (!creatureCols.some(c => c.name === 'cr')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN cr TEXT`)
  }

  const campaignCols = db.pragma('table_info(campaigns)') as { name: string }[]
  // Stable identity that survives export/import and renames — used by backup
  // import to detect that an incoming campaign already exists here.
  if (!campaignCols.some(c => c.name === 'uuid')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN uuid TEXT`)
  }
  {
    const missing = db.prepare('SELECT id FROM campaigns WHERE uuid IS NULL OR uuid = \'\'').all() as { id: number }[]
    const setUuid = db.prepare('UPDATE campaigns SET uuid = ? WHERE id = ?')
    for (const r of missing) setUuid.run(randomUUID(), r.id)
  }
  if (!campaignCols.some(c => c.name === 'timeline_base_year')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN timeline_base_year INTEGER NOT NULL DEFAULT 1507`)
  }
  if (!campaignCols.some(c => c.name === 'timeline_eras')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN timeline_eras TEXT`)
  }
  if (!campaignCols.some(c => c.name === 'timeline_show_lifespans')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN timeline_show_lifespans INTEGER NOT NULL DEFAULT 0`)
  }
  // Calendar definition (JSON: unitName, spans[], campaign start date). NULL
  // falls back to a single 365-day span anchored to timeline_base_year.
  if (!campaignCols.some(c => c.name === 'timeline_calendar')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN timeline_calendar TEXT`)
  }

  const sessionCols = db.pragma('table_info(sessions)') as { name: string }[]
  if (!sessionCols.some(c => c.name === 'session_sub')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN session_sub TEXT NOT NULL DEFAULT ''`)
  }
  if (!sessionCols.some(c => c.name === 'arc_id')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN arc_id INTEGER`)
  }
  if (!sessionCols.some(c => c.name === 'in_world_day')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN in_world_day INTEGER`)
  }
  if (!sessionCols.some(c => c.name === 'in_world_day_end')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN in_world_day_end INTEGER`)
  }
  if (!sessionCols.some(c => c.name === 'is_draft')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0`)
  }
  if (!sessionCols.some(c => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
  }

  const mapCols = db.pragma('table_info(maps)') as { name: string; notnull: number }[]
    if (!mapCols.some(c => c.name === 'campaign_id')) {
      db.exec(`ALTER TABLE maps ADD COLUMN campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE`)
    }
    const sessionIdCol = mapCols.find(c => c.name === 'session_id')
    if (sessionIdCol && sessionIdCol.notnull === 1) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE maps_new (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
          article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
          name       TEXT    NOT NULL,
          image_path TEXT    NOT NULL,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO maps_new SELECT id, session_id, article_id, name, image_path, created_at FROM maps;
        DROP TABLE maps;
        ALTER TABLE maps_new RENAME TO maps;
        PRAGMA foreign_keys = ON;
      `)
    }

  const arcCols = db.pragma('table_info(arcs)') as { name: string }[]
  if (!arcCols.some(c => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE arcs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
    // Preserve the previous name-alphabetical ordering as the initial manual order,
    // per campaign, so existing arc lists don't visually shuffle on first launch.
    const campaigns = db.prepare('SELECT id FROM campaigns').all() as { id: number }[]
    const setOrder = db.prepare('UPDATE arcs SET sort_order = ? WHERE id = ?')
    for (const c of campaigns) {
      const arcs = db.prepare('SELECT id FROM arcs WHERE campaign_id = ? ORDER BY name ASC').all(c.id) as { id: number }[]
      arcs.forEach((a, i) => setOrder.run(i, a.id))
    }
  }

  const dmNotesPageCols = db.pragma('table_info(dm_notes_pages)') as { name: string }[]
  if (!dmNotesPageCols.some(c => c.name === 'group_id')) {
    db.exec(`ALTER TABLE dm_notes_pages ADD COLUMN group_id INTEGER REFERENCES dm_notes_groups(id) ON DELETE SET NULL`)
  }
  if (!dmNotesPageCols.some(c => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE dm_notes_pages ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
    db.exec(`UPDATE dm_notes_pages SET sort_order = id`)
  }
  if (!dmNotesPageCols.some(c => c.name === 'session_id')) {
    db.exec(`ALTER TABLE dm_notes_pages ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL`)
  }

  const dmNotesGroupCols = db.pragma('table_info(dm_notes_groups)') as { name: string }[]
  if (!dmNotesGroupCols.some(c => c.name === 'is_system')) {
    db.exec(`ALTER TABLE dm_notes_groups ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0`)
  }

  const mapSortCols = db.pragma('table_info(maps)') as { name: string }[]
  if (!mapSortCols.some(c => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE maps ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
    // Seed manual order from the previous created_at ordering, per session,
    // so existing map tab rows don't visually shuffle on first launch.
    const owners = db.prepare('SELECT DISTINCT session_id FROM maps WHERE session_id IS NOT NULL').all() as { session_id: number }[]
    const setOrder = db.prepare('UPDATE maps SET sort_order = ? WHERE id = ?')
    for (const o of owners) {
      const ms = db.prepare('SELECT id FROM maps WHERE session_id = ? ORDER BY created_at ASC').all(o.session_id) as { id: number }[]
      ms.forEach((m, i) => setOrder.run(i, m.id))
    }
  }

  // Partial index: only sequenced (non-draft) sessions must be unique by number.
  // Drafts all share session_number 0 and are exempt. Drop-and-recreate so DBs
  // that already have the non-partial index pick up the new predicate.
  db.exec(`DROP INDEX IF EXISTS idx_sessions_unique`)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_unique
    ON sessions(campaign_id, session_number, session_sub)
    WHERE is_draft = 0
  `)

  // ── Relation table migrations (additive, safe for existing DBs) ───────────
  const webCols = db.pragma('table_info(relation_webs)') as { name: string }[]
  if (!webCols.some(c => c.name === 'template')) {
    db.exec(`ALTER TABLE relation_webs ADD COLUMN template TEXT NOT NULL DEFAULT 'custom'`)
  }
  if (!webCols.some(c => c.name === 'ranks')) {
    db.exec(`ALTER TABLE relation_webs ADD COLUMN ranks TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!webCols.some(c => c.name === 'article_id')) {
    db.exec(`ALTER TABLE relation_webs ADD COLUMN article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL`)
  }
  // Many-to-many web↔article links. Backfill from the legacy single article_id
  // (which is retained as the "primary" link used by hierarchy derivation).
  db.exec(`
    CREATE TABLE IF NOT EXISTS relation_web_articles (
      web_id     INTEGER NOT NULL REFERENCES relation_webs(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id)      ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (web_id, article_id)
    );
  `)
  db.exec(`
    INSERT OR IGNORE INTO relation_web_articles (web_id, article_id)
    SELECT id, article_id FROM relation_webs WHERE article_id IS NOT NULL
  `)
  const nodeCols2 = db.pragma('table_info(relation_nodes)') as { name: string }[]
  if (!nodeCols2.some(c => c.name === 'node_type')) {
    db.exec(`ALTER TABLE relation_nodes ADD COLUMN node_type TEXT NOT NULL DEFAULT 'person'`)
  }
  if (!nodeCols2.some(c => c.name === 'rank_id')) {
    db.exec(`ALTER TABLE relation_nodes ADD COLUMN rank_id TEXT NOT NULL DEFAULT ''`)
  }
  const edgeCols2 = db.pragma('table_info(relation_edges)') as { name: string }[]
  if (!edgeCols2.some(c => c.name === 'edge_type')) {
    db.exec(`ALTER TABLE relation_edges ADD COLUMN edge_type TEXT NOT NULL DEFAULT 'standard'`)
  }
  if (!edgeCols2.some(c => c.name === 'from_handle')) {
    db.exec(`ALTER TABLE relation_edges ADD COLUMN from_handle TEXT NOT NULL DEFAULT ''`)
  }
  if (!edgeCols2.some(c => c.name === 'to_handle')) {
    db.exec(`ALTER TABLE relation_edges ADD COLUMN to_handle TEXT NOT NULL DEFAULT ''`)
  }
  // Give existing union-member edges a neat default: partner's bottom dot → union's
  // top dot. Only touches auto-created edges that never had handles set.
  db.exec(`
    UPDATE relation_edges SET from_handle = 'bottom', to_handle = 'top'
    WHERE edge_type = 'person_to_union' AND from_handle = '' AND to_handle = ''
  `)

  // Per-sound loop flag. New column defaults to 1 (loop), but existing effects
  // should stay one-shots — backfill them to 0 to preserve prior behaviour.
  const soundCols = db.pragma('table_info(sounds)') as { name: string }[]
  if (soundCols.length > 0 && !soundCols.some(c => c.name === 'loop')) {
    db.exec(`ALTER TABLE sounds ADD COLUMN loop INTEGER NOT NULL DEFAULT 1`)
    db.exec(`UPDATE sounds SET loop = 0 WHERE category = 'effect'`)
  }

  // Optional default soundboard per session — auto-selected in the widget on entry.
  const sessionCols2 = db.pragma('table_info(sessions)') as { name: string }[]
  if (!sessionCols2.some(c => c.name === 'soundboard_id')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN soundboard_id INTEGER REFERENCES sound_boards(id) ON DELETE SET NULL`)
  }

  // Backfill price / weight / description onto already-seeded default loot tables.
  // Earlier seeds dropped these fields; here we fill only blanks (matched by item
  // name against the bundled defaults), so existing campaigns get the values
  // without a manual reset and any user edits are preserved. Idempotent.
  try {
    const defs = loadDefaultLootTables()
    if (defs.length > 0) {
      const meta: Record<string, { price: string; weight: string; description: string }> = {}
      for (const t of defs) {
        for (const it of (t.items ?? [])) {
          if (!meta[it.name]) {
            meta[it.name] = { price: it.price ?? '', weight: it.weight ?? '', description: it.description ?? '' }
          }
        }
      }
      const rows = db.prepare('SELECT id, items FROM loot_tables WHERE is_default = 1').all() as { id: number; items: string }[]
      const upd = db.prepare('UPDATE loot_tables SET items = ? WHERE id = ?')
      for (const row of rows) {
        let items: any[]
        try { items = JSON.parse(row.items) } catch { continue }
        let changed = false
        for (const it of items) {
          const m = meta[it.name]
          if (!m) continue
          if (!it.price && m.price)             { it.price = m.price; changed = true }
          if (!it.weight && m.weight)           { it.weight = m.weight; changed = true }
          if (!it.description && m.description) { it.description = m.description; changed = true }
        }
        if (changed) upd.run(JSON.stringify(items), row.id)
      }
    }
  } catch (e) {
    log.warn('Loot default backfill failed:', e)
  }

  // `players` is CREATE TABLE IF NOT EXISTS, so a table made by an earlier dev
  // build of the player-pages feature never picks up columns added later. Publish
  // reads pc_article_id (own-PC grant + statblock), so backfill it defensively.
  const playerCols = db.pragma('table_info(players)') as { name: string }[]
  if (playerCols.length > 0 && !playerCols.some(c => c.name === 'pc_article_id')) {
    db.exec(`ALTER TABLE players ADD COLUMN pc_article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL`)
  }

  // Location `Size` was a catch-all that mixed magnitude words (City, Kingdom…)
  // with kind-of-place words (Ruins, Dungeon…). The kind words now live in a
  // separate `Type` track, so move any that were stored under `Size` over to it
  // (carrying a per-value visibility rule if one exists). Idempotent: once
  // moved, `Size` no longer holds a kind word.
  try {
    const KIND = new Set(['Ruins', 'Dungeon', 'Wilderness', 'Landmark', 'Natural Wonder'])
    const locs = db.prepare(
      `SELECT id, tracks, track_visibility FROM articles WHERE article_type = 'location'`
    ).all() as { id: number; tracks: string; track_visibility: string }[]
    const updTracks = db.prepare('UPDATE articles SET tracks = ? WHERE id = ?')
    const updBoth = db.prepare('UPDATE articles SET tracks = ?, track_visibility = ? WHERE id = ?')
    for (const row of locs) {
      let t: Record<string, string>
      try { t = JSON.parse(row.tracks) } catch { continue }
      if (!t || typeof t !== 'object' || !KIND.has(t.Size)) continue
      t.Type = t.Size
      delete t.Size
      // Carry any per-value visibility rule from Size → Type.
      let visStr: string | null = null
      try {
        const vis = JSON.parse(row.track_visibility || '{}')
        if (vis?.tracks?.Size && !vis.tracks?.Type) {
          vis.tracks.Type = vis.tracks.Size
          delete vis.tracks.Size
          visStr = JSON.stringify(vis)
        }
      } catch { /* leave visibility untouched */ }
      if (visStr) updBoth.run(JSON.stringify(t), visStr, row.id)
      else updTracks.run(JSON.stringify(t), row.id)
    }
  } catch (e) {
    log.warn('Location Size/Type split migration failed:', e)
  }

  return { userDataPath, imagesPath }
}
