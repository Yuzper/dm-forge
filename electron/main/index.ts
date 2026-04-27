// path: electron/main/index.ts
import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

function initUpdater(mainWindow: BrowserWindow) {
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('Updater error:', err)
  })

  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 1000 * 60 * 60 * 4)

  ipcMain.handle('updater:check',   () => autoUpdater.checkForUpdates())
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())
}

let db!: InstanceType<typeof Database>

// Load default loot tables from bundled JSON
function loadDefaultLootTables(): any[] {
  try {
    // In dev: relative to project root. In prod: next to the main bundle.
    const candidates = [
      path.join(__dirname, '../../src/data/loot_tables_default.json'),
      path.join(__dirname, '../renderer/loot_tables_default.json'),
      path.join(process.resourcesPath ?? '', 'loot_tables_default.json'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
    log.warn('loot_tables_default.json not found in any candidate path')
    return []
  } catch (e) {
    log.error('Failed to load default loot tables:', e)
    return []
  }
}

function seedDefaultTables(campaignId: number): any[] {
  const defaults = loadDefaultLootTables()
  if (defaults.length === 0) return []

  const insert = db.prepare(`
    INSERT INTO loot_tables (campaign_id, name, description, category, items, is_default)
    VALUES (@campaign_id, @name, @description, @category, @items, 1)
  `)

  const results: any[] = []
  const tx = db.transaction(() => {
    for (const t of defaults) {
      const result = insert.run({
        campaign_id: campaignId,
        name: t.name,
        description: t.description ?? '',
        category: t.category ?? 'custom',
        items: JSON.stringify(
          (t.items ?? []).map((item: any, idx: number) => ({
            id: `default_${Date.now()}_${idx}`,
            name: item.name,
            description: item.description ?? '',
            quantity: item.quantity ?? '1',
            chance: item.chance ?? 100,
          }))
        ),
      })
      results.push(db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(result.lastInsertRowid))
    }
  })
  tx()
  return results.map(r => ({ ...r, is_default: r.is_default === 1 }))
}

function initDatabase() {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'dmforge.db')
  const imagesPath = path.join(userDataPath, 'images')
  if (!fs.existsSync(imagesPath)) fs.mkdirSync(imagesPath, { recursive: true })

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
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      image_path TEXT    NOT NULL,
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

    CREATE TABLE IF NOT EXISTS articles (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id    INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      title          TEXT    NOT NULL,
      content        TEXT    NOT NULL DEFAULT '{"type":"doc","content":[]}',
      article_type   TEXT    NOT NULL DEFAULT 'location',
      tags           TEXT    NOT NULL DEFAULT '[]',
      cover_image    TEXT,
      portrait_image TEXT,
      tracks         TEXT    NOT NULL DEFAULT '{}',
      statblock      TEXT    NOT NULL DEFAULT '{}',
      loot_table     TEXT    NOT NULL DEFAULT '{"name":"Loot","items":[]}',
      status         TEXT    NOT NULL DEFAULT '',
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(campaign_id, title)
    );

    CREATE TABLE IF NOT EXISTS combat_encounters (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      poi_id     INTEGER NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(poi_id)
    );

    CREATE TABLE IF NOT EXISTS combat_creatures (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      encounter_id    INTEGER NOT NULL REFERENCES combat_encounters(id) ON DELETE CASCADE,
      article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      instance_number INTEGER NOT NULL DEFAULT 1,
      max_hp          INTEGER NOT NULL DEFAULT 0,
      current_hp      INTEGER NOT NULL DEFAULT 0,
      ac_override     INTEGER,
      is_dead         INTEGER NOT NULL DEFAULT 0,
      initiative      INTEGER,
      loot_result     TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
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
  `)

  // ── Migrations for existing databases ────────────────────────────────────────
  const articleCols = db.pragma('table_info(articles)') as { name: string }[]
  if (!articleCols.some(c => c.name === 'tracks')) {
    db.exec(`ALTER TABLE articles ADD COLUMN tracks TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!articleCols.some(c => c.name === 'statblock')) {
    db.exec(`ALTER TABLE articles ADD COLUMN statblock TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!articleCols.some(c => c.name === 'loot_table')) {
    db.exec(`ALTER TABLE articles ADD COLUMN loot_table TEXT NOT NULL DEFAULT '{"name":"Loot","items":[]}'`)
  }
  if (!articleCols.some(c => c.name === 'loot_table_id')) {
    db.exec(`ALTER TABLE articles ADD COLUMN loot_table_id INTEGER REFERENCES loot_tables(id) ON DELETE SET NULL`)
  }

  const poiCols = db.pragma('table_info(pois)') as { name: string }[]
  if (!poiCols.some(c => c.name === 'loot_table')) {
    db.exec(`ALTER TABLE pois ADD COLUMN loot_table TEXT NOT NULL DEFAULT '{"name":"Loot","items":[]}'`)
  }
  if (!poiCols.some(c => c.name === 'loot_table_id')) {
    db.exec(`ALTER TABLE pois ADD COLUMN loot_table_id INTEGER REFERENCES loot_tables(id) ON DELETE SET NULL`)
  }

  const creatureCols = db.pragma('table_info(combat_creatures)') as { name: string }[]
  if (!creatureCols.some(c => c.name === 'loot_result')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN loot_result TEXT`)
  }
  if (!creatureCols.some(c => c.name === 'resources')) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN resources TEXT NOT NULL DEFAULT '[]'`)
  }

  const sessionCols = db.pragma('table_info(sessions)') as { name: string }[]
  if (!sessionCols.some(c => c.name === 'session_sub')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN session_sub TEXT NOT NULL DEFAULT ''`)
  }
  if (!sessionCols.some(c => c.name === 'arc_id')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN arc_id INTEGER`)
  }

  const dmNotesPageCols = db.pragma('table_info(dm_notes_pages)') as { name: string }[]
  if (!dmNotesPageCols.some(c => c.name === 'group_id')) {
    db.exec(`ALTER TABLE dm_notes_pages ADD COLUMN group_id INTEGER REFERENCES dm_notes_groups(id) ON DELETE SET NULL`)
  }
  if (!dmNotesPageCols.some(c => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE dm_notes_pages ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
    db.exec(`UPDATE dm_notes_pages SET sort_order = id`)
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_unique
    ON sessions(campaign_id, session_number, session_sub)
  `)

  return { userDataPath, imagesPath }
}

// ── Image Processing ───────────────────────────────────────────────────────────

function processAndSaveImage(
  srcPath: string,
  destDir: string,
  baseName: string,
  maxWidth: number,
  quality = 85,
): string {
  const img = nativeImage.createFromPath(srcPath)
  if (img.isEmpty()) {
    const ext = path.extname(srcPath)
    const fallbackName = baseName + ext
    fs.copyFileSync(srcPath, path.join(destDir, fallbackName))
    return fallbackName
  }
  const { width } = img.getSize()
  const processed = width > maxWidth ? img.resize({ width: maxWidth }) : img
  const outName = baseName + '.jpg'
  fs.writeFileSync(path.join(destDir, outName), processed.toJPEG(quality))
  return outName
}

// ── Inline Image Cleanup ───────────────────────────────────────────────────────

function extractInlineImagePaths(contentJson: string, userDataPath: string): string[] {
  try {
    const doc = JSON.parse(contentJson)
    const imagesDir = path.join(userDataPath, 'images')
    const found: string[] = []
    function walk(node: any) {
      if (node?.type === 'image' && node.attrs?.src) {
        const src = node.attrs.src as string
        const filePath = src.startsWith('file://') ? src.slice(7) : src
        if (filePath.startsWith(imagesDir)) found.push(filePath)
      }
      if (Array.isArray(node?.content)) node.content.forEach(walk)
    }
    walk(doc)
    return found
  } catch { return [] }
}

function safeUnlink(filePath: string) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
}

function safeUnlinkRelative(relativePath: string | null | undefined, userDataPath: string) {
  if (!relativePath) return
  safeUnlink(path.join(userDataPath, relativePath))
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0b09',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: true,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
//    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
  return mainWindow
}

function registerIPC(imagesPath: string) {

  // ── Campaigns ─────────────────────────────────────────────────────────────────

  ipcMain.handle('campaigns:get-all', () => {
    return db.prepare(`
      SELECT c.*, COUNT(s.id) as session_count
      FROM campaigns c
      LEFT JOIN sessions s ON s.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `).all()
  })

  ipcMain.handle('campaigns:get', (_e, id: number) => {
    return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) ?? null
  })

  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('campaigns:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO campaigns (name, description, system, cover_image)
      VALUES (@name, @description, @system, @cover_image)
    `).run({ cover_image: null, ...data })
    return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('campaigns:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE campaigns SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id)
  })

  ipcMain.handle('campaigns:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const maps = db.prepare(`
      SELECT m.image_path FROM maps m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.campaign_id = ?
    `).all(id) as { image_path: string }[]
    const articles = db.prepare(
      'SELECT content, cover_image, portrait_image FROM articles WHERE campaign_id = ?'
    ).all(id) as { content: string; cover_image: string | null; portrait_image: string | null }[]

    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)

    for (const map of maps) safeUnlinkRelative(map.image_path, userDataPath)
    for (const article of articles) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink)
      safeUnlinkRelative(article.cover_image, userDataPath)
      safeUnlinkRelative(article.portrait_image, userDataPath)
    }
  })

  // ── Sessions ──────────────────────────────────────────────────────────────────

  ipcMain.handle('sessions:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT s.*, COUNT(m.id) as map_count
      FROM sessions s
      LEFT JOIN maps m ON m.session_id = s.id
      WHERE s.campaign_id = ?
      GROUP BY s.id
      ORDER BY s.session_number ASC, s.session_sub ASC
    `).all(campaignId)
  })

  ipcMain.handle('sessions:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO sessions (campaign_id, name, session_number, session_sub, arc_id, date, notes)
      VALUES (@campaign_id, @name, @session_number, @session_sub, @arc_id, @date, @notes)
    `).run({ date: null, notes: '', session_sub: '', arc_id: null, ...data })
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('sessions:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE sessions SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  })

  ipcMain.handle('sessions:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const maps = db.prepare('SELECT image_path FROM maps WHERE session_id = ?').all(id) as { image_path: string }[]
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    for (const map of maps) safeUnlinkRelative(map.image_path, userDataPath)
  })

  // ── Arcs ──────────────────────────────────────────────────────────────────────

  ipcMain.handle('arcs:get-all', (_e, campaignId: number) => {
    let arcs = db.prepare(
      'SELECT * FROM arcs WHERE campaign_id = ? ORDER BY name ASC'
    ).all(campaignId) as any[]
    if (arcs.length === 0) {
      const result = db.prepare(`
        INSERT INTO arcs (campaign_id, name, color, is_default)
        VALUES (?, 'Main Story', '#c8a84b', 1)
      `).run(campaignId)
      arcs = [db.prepare('SELECT * FROM arcs WHERE id = ?').get(result.lastInsertRowid)]
    }
    return arcs.map(a => ({ ...a, is_default: a.is_default === 1 }))
  })

  ipcMain.handle('arcs:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO arcs (campaign_id, name, color, is_default)
      VALUES (@campaign_id, @name, @color, 0)
    `).run({ color: '#c8a84b', ...data })
    const arc = db.prepare('SELECT * FROM arcs WHERE id = ?').get(result.lastInsertRowid) as any
    return { ...arc, is_default: false }
  })

  ipcMain.handle('arcs:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE arcs SET ${fields} WHERE id = @id`).run({ ...data, id })
    const arc = db.prepare('SELECT * FROM arcs WHERE id = ?').get(id) as any
    return { ...arc, is_default: arc.is_default === 1 }
  })

  ipcMain.handle('arcs:delete', (_e, id: number) => {
    const arc = db.prepare('SELECT * FROM arcs WHERE id = ?').get(id) as any
    if (!arc) return { success: false, error: 'Arc not found' }
    if (arc.is_default) return { success: false, error: 'Cannot delete the default arc' }
    const defaultArc = db.prepare(
      'SELECT id FROM arcs WHERE campaign_id = ? AND is_default = 1'
    ).get(arc.campaign_id) as any
    if (defaultArc) {
      db.prepare('UPDATE sessions SET arc_id = ? WHERE arc_id = ?').run(defaultArc.id, id)
    }
    db.prepare('DELETE FROM arcs WHERE id = ?').run(id)
    return { success: true }
  })

  // ── Maps ──────────────────────────────────────────────────────────────────────

  ipcMain.handle('maps:get-all', (_e, sessionId: number) => {
    return db.prepare(`
      SELECT m.*, COUNT(p.id) as poi_count
      FROM maps m
      LEFT JOIN pois p ON p.map_id = m.id
      WHERE m.session_id = ?
      GROUP BY m.id
      ORDER BY m.created_at ASC
    `).all(sessionId)
  })

  ipcMain.handle('maps:create', (_e, data: any) => {
    const result = db.prepare(
      'INSERT INTO maps (session_id, name, image_path) VALUES (@session_id, @name, @image_path)'
    ).run(data)
    return db.prepare('SELECT * FROM maps WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('maps:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE maps SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM maps WHERE id = ?').get(id)
  })

  ipcMain.handle('maps:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const map = db.prepare('SELECT image_path FROM maps WHERE id = ?').get(id) as { image_path: string } | undefined
    db.prepare('DELETE FROM maps WHERE id = ?').run(id)
    if (map?.image_path) safeUnlinkRelative(map.image_path, userDataPath)
  })

  ipcMain.handle('maps:import-image', async (_e, sessionId: number) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Map Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const srcPath = result.filePaths[0]
    const baseName = `map_${sessionId}_${Date.now()}`
    const filename = processAndSaveImage(srcPath, imagesPath, baseName, 4000, 85)
    const name = path.basename(srcPath, path.extname(srcPath))
    return { path: `images/${filename}`, name }
  })

  // ── POIs ──────────────────────────────────────────────────────────────────────

  ipcMain.handle('pois:get-all', (_e, mapId: number) => {
    return db.prepare('SELECT * FROM pois WHERE map_id = ? ORDER BY created_at ASC').all(mapId)
  })

  ipcMain.handle('pois:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO pois (map_id, label, x, y, content, poi_type, color)
      VALUES (@map_id, @label, @x, @y, @content, @poi_type, @color)
    `).run({
      content: '{"type":"doc","content":[]}',
      poi_type: 'location',
      color: '#c8a84b',
      ...data,
    })
    return db.prepare('SELECT * FROM pois WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('pois:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE pois SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM pois WHERE id = ?').get(id)
  })

  ipcMain.handle('pois:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const poi = db.prepare('SELECT content FROM pois WHERE id = ?').get(id) as { content: string } | undefined
    db.prepare('DELETE FROM pois WHERE id = ?').run(id)
    if (poi?.content) extractInlineImagePaths(poi.content, userDataPath).forEach(safeUnlink)
  })

  // ── Articles ──────────────────────────────────────────────────────────────────

  ipcMain.handle('articles:get-all', (_e, filter?: any) => {
    let query = 'SELECT * FROM articles WHERE 1=1'
    const params: any[] = []
    if (filter?.campaignId) { query += ' AND campaign_id = ?'; params.push(filter.campaignId) }
    if (filter?.type && filter.type !== 'all') { query += ' AND article_type = ?'; params.push(filter.type) }
    if (filter?.search) {
      query += ' AND (title LIKE ? OR content LIKE ?)'
      params.push(`%${filter.search}%`, `%${filter.search}%`)
    }
    query += ' ORDER BY title ASC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('articles:get-list', (_e, filter?: any) => {
    let query = `
      SELECT id, campaign_id, title, article_type, tags, cover_image, tracks,
             loot_table, loot_table_id, created_at, updated_at
      FROM articles WHERE 1=1
    `
    const params: any[] = []
    if (filter?.campaignId) { query += ' AND campaign_id = ?'; params.push(filter.campaignId) }
    if (filter?.type && filter.type !== 'all') { query += ' AND article_type = ?'; params.push(filter.type) }
    if (filter?.tag) { query += ' AND tags LIKE ?'; params.push(`%"${filter.tag}"%`) }
    if (filter?.search) {
      const byTitle = filter.searchTitle !== false
      const byTags  = filter.searchTags  !== false
      const clauses = [
        ...(byTitle ? ['title LIKE ?'] : []),
        ...(byTags  ? ['tags LIKE ?']  : []),
      ]
      if (clauses.length) {
        query += ` AND (${clauses.join(' OR ')})`
        clauses.forEach(() => params.push(`%${filter.search}%`))
      }
    }
    query += ' ORDER BY title ASC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('articles:get', (_e, id: number) => {
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(id) ?? null
  })

  ipcMain.handle('articles:get-by-title', (_e, title: string, campaignId: number) => {
    return db.prepare(
      'SELECT * FROM articles WHERE title = ? COLLATE NOCASE AND campaign_id = ?'
    ).get(title, campaignId) ?? null
  })

  ipcMain.handle('articles:get-backlinks', (_e, title: string, campaignId: number) => {
    return db.prepare(`
      SELECT id, campaign_id, title, article_type, tags, tracks, updated_at
      FROM articles
      WHERE campaign_id = ? AND content LIKE ? AND title != ?
      ORDER BY title ASC
    `).all(campaignId, `%"title":"${title}"%`, title)
  })

  ipcMain.handle('articles:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO articles (campaign_id, title, content, article_type, tags, tracks, statblock, loot_table, loot_table_id)
      VALUES (@campaign_id, @title, @content, @article_type, @tags, @tracks, @statblock, @loot_table, @loot_table_id)
    `).run({
      content: '{"type":"doc","content":[]}',
      article_type: 'location',
      tags: '[]',
      tracks: '{}',
      statblock: '{}',
      loot_table: '{"name":"Loot","items":[]}',
      loot_table_id: null,
      ...data,
    })
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('articles:update', (_e, id: number, data: any) => {
    const userDataPath = app.getPath('userData')
    const old = db.prepare(
      'SELECT content, cover_image, portrait_image FROM articles WHERE id = ?'
    ).get(id) as { content: string; cover_image: string | null; portrait_image: string | null } | undefined

    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE articles SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })

    if (old) {
      if (old.cover_image && data.cover_image !== undefined && data.cover_image !== old.cover_image) {
        safeUnlinkRelative(old.cover_image, userDataPath)
      }
      if (old.portrait_image && data.portrait_image !== undefined && data.portrait_image !== old.portrait_image) {
        safeUnlinkRelative(old.portrait_image, userDataPath)
      }
      if (data.content !== undefined && data.content !== old.content) {
        const oldPaths = new Set(extractInlineImagePaths(old.content, userDataPath))
        const newPaths = new Set(extractInlineImagePaths(data.content, userDataPath))
        for (const p of oldPaths) { if (!newPaths.has(p)) safeUnlink(p) }
      }
    }

    return db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
  })

  ipcMain.handle('articles:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const article = db.prepare(
      'SELECT content, cover_image, portrait_image FROM articles WHERE id = ?'
    ).get(id) as { content: string; cover_image: string | null; portrait_image: string | null } | undefined

    db.prepare('DELETE FROM articles WHERE id = ?').run(id)

    if (article) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink)
      safeUnlinkRelative(article.cover_image, userDataPath)
      safeUnlinkRelative(article.portrait_image, userDataPath)
    }
  })

  // ── Combat ────────────────────────────────────────────────────────────────────

  ipcMain.handle('combat:get-encounter', (_e, poiId: number) => {
    let enc = db.prepare('SELECT * FROM combat_encounters WHERE poi_id = ?').get(poiId)
    if (!enc) {
      const result = db.prepare('INSERT INTO combat_encounters (poi_id) VALUES (?)').run(poiId)
      enc = db.prepare('SELECT * FROM combat_encounters WHERE id = ?').get(result.lastInsertRowid)
    }
    return enc
  })

  ipcMain.handle('combat:get-creatures', (_e, encounterId: number) => {
    const rows = db.prepare(`
      SELECT cc.*, a.title, a.statblock, a.loot_table, a.loot_table_id
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.encounter_id = ?
      ORDER BY
        CASE WHEN cc.initiative IS NULL THEN 1 ELSE 0 END,
        cc.initiative DESC,
        cc.instance_number ASC
    `).all(encounterId) as any[]
    return rows.map(r => ({ ...r, is_dead: r.is_dead === 1 }))
  })

  ipcMain.handle('combat:add-creature', (_e, encounterId: number, articleId: number, maxHp: number) => {
    const { cnt } = db.prepare(
      'SELECT COUNT(*) as cnt FROM combat_creatures WHERE encounter_id = ? AND article_id = ?'
    ).get(encounterId, articleId) as { cnt: number }
    const instanceNumber = cnt + 1
    const result = db.prepare(`
      INSERT INTO combat_creatures (encounter_id, article_id, instance_number, max_hp, current_hp)
      VALUES (?, ?, ?, ?, ?)
    `).run(encounterId, articleId, instanceNumber, maxHp, maxHp)
    const row = db.prepare(`
      SELECT cc.*, a.title, a.statblock, a.loot_table, a.loot_table_id
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.id = ?
    `).get(result.lastInsertRowid) as any
    return { ...row, is_dead: row.is_dead === 1 }
  })

  ipcMain.handle('combat:save-creatures', (_e, creatures: any[]) => {
    const stmt = db.prepare(`
      UPDATE combat_creatures
      SET current_hp = @current_hp, ac_override = @ac_override,
          is_dead = @is_dead, initiative = @initiative,
          resources = @resources
      WHERE id = @id
    `)
    const transaction = db.transaction((list: any[]) => {
      for (const c of list) stmt.run({ ...c, is_dead: c.is_dead ? 1 : 0 })
    })
    transaction(creatures)
  })

  ipcMain.handle('combat:save-loot-result', (_e, creatureId: number, lootResult: any[]) => {
    db.prepare('UPDATE combat_creatures SET loot_result = ? WHERE id = ?')
      .run(JSON.stringify(lootResult), creatureId)
  })

  ipcMain.handle('combat:get-loot-results', (_e, encounterId: number) => {
    return db.prepare(
      'SELECT id, loot_result FROM combat_creatures WHERE encounter_id = ?'
    ).all(encounterId)
  })

  // ── Stat Block Window ─────────────────────────────────────────────────────────

  ipcMain.handle('statblock:open-window', async (_e, articleId: number) => {
    const existing = BrowserWindow.getAllWindows().find(w => {
      try {
        const url = w.webContents.getURL()
        return url.includes(`articleId=${articleId}`) && url.includes('mode=statblock')
      } catch { return false }
    })
    if (existing) { existing.focus(); return }

    const win = new BrowserWindow({
      width: 420, height: 650, minWidth: 360, minHeight: 400,
      title: 'Stat Block', alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true, nodeIntegration: false, webSecurity: false,
      },
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?mode=statblock&articleId=${articleId}`)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { mode: 'statblock', articleId: String(articleId) },
      })
    }
  })

  // ── Files ─────────────────────────────────────────────────────────────────────

  ipcMain.handle('file:select-image', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const srcPath = result.filePaths[0]
    const baseName = `img_${Date.now()}`
    const filename = processAndSaveImage(srcPath, imagesPath, baseName, 1200, 85)
    return `images/${filename}`
  })

  ipcMain.handle('file:get-image-path', (_e, relativePath: string) => {
    const userDataPath = app.getPath('userData')
    return `file://${path.join(userDataPath, relativePath)}`
  })

  // ── Backup ────────────────────────────────────────────────────────────────────

  ipcMain.handle('backup:export', async () => {
    if (!mainWindow) return { success: false, error: 'No window' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Backup Destination Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }
    try {
      const userDataPath = app.getPath('userData')
      db.pragma('wal_checkpoint(TRUNCATE)')
      const date = new Date().toISOString().slice(0, 10)
      const backupDir = path.join(result.filePaths[0], `dm-forge-backup-${date}`)
      fs.mkdirSync(backupDir, { recursive: true })
      const dbSrc = path.join(userDataPath, 'dmforge.db')
      if (fs.existsSync(dbSrc)) fs.copyFileSync(dbSrc, path.join(backupDir, 'dmforge.db'))
      const imgSrc = path.join(userDataPath, 'images')
      const imgDst = path.join(backupDir, 'images')
      if (fs.existsSync(imgSrc)) {
        fs.mkdirSync(imgDst, { recursive: true })
        for (const file of fs.readdirSync(imgSrc)) {
          fs.copyFileSync(path.join(imgSrc, file), path.join(imgDst, file))
        }
      }
      return { success: true, path: backupDir }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('backup:import', async () => {
    if (!mainWindow) return { success: false, error: 'No window' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Backup Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }
    const backupDir = result.filePaths[0]
    const backupDb = path.join(backupDir, 'dmforge.db')
    if (!fs.existsSync(backupDb)) {
      return { success: false, error: 'No dmforge.db found in the selected folder' }
    }
    try {
      const userDataPath = app.getPath('userData')
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
      fs.copyFileSync(backupDb, path.join(userDataPath, 'dmforge.db'))
      const backupImages = path.join(backupDir, 'images')
      const imagesDir = path.join(userDataPath, 'images')
      if (fs.existsSync(backupImages)) {
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })
        for (const file of fs.readdirSync(backupImages)) {
          fs.copyFileSync(path.join(backupImages, file), path.join(imagesDir, file))
        }
      }
      app.relaunch()
      app.exit(0)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── DM Notes — Pages ──────────────────────────────────────────────────────────

  ipcMain.handle('dm-notes:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT id, campaign_id, title, group_id, sort_order, created_at, updated_at
      FROM dm_notes_pages
      WHERE campaign_id = ?
      ORDER BY sort_order ASC
    `).all(campaignId)
  })

  ipcMain.handle('dm-notes:get', (_e, id: number) => {
    return db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(id) ?? null
  })

  ipcMain.handle('dm-notes:create', (_e, campaignId: number, groupId: number | null) => {
    const maxRow = groupId != null
      ? db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE campaign_id = ? AND group_id = ?').get(campaignId, groupId) as { m: number }
      : db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE campaign_id = ? AND group_id IS NULL').get(campaignId) as { m: number }
    const sortOrder = maxRow.m + 1
    const result = db.prepare(`
      INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order)
      VALUES (?, 'Untitled', '{"type":"doc","content":[]}', ?, ?)
    `).run(campaignId, groupId ?? null, sortOrder)
    return db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('dm-notes:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE dm_notes_pages SET ${fields}, updated_at = datetime('now') WHERE id = @id`)
      .run({ ...data, id })
    return db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(id)
  })

  ipcMain.handle('dm-notes:delete', (_e, id: number) => {
    db.prepare('DELETE FROM dm_notes_pages WHERE id = ?').run(id)
  })

  ipcMain.handle('dm-notes:reorder-pages', (_e, orders: { id: number; sort_order: number; group_id: number | null }[]) => {
    const stmt = db.prepare('UPDATE dm_notes_pages SET sort_order = @sort_order, group_id = @group_id WHERE id = @id')
    const transaction = db.transaction((list: any[]) => {
      for (const o of list) stmt.run({ id: o.id, sort_order: o.sort_order, group_id: o.group_id ?? null })
    })
    transaction(orders)
  })

  // ── DM Notes — Groups ─────────────────────────────────────────────────────────

  ipcMain.handle('dm-notes:get-groups', (_e, campaignId: number) => {
    return db.prepare('SELECT * FROM dm_notes_groups WHERE campaign_id = ? ORDER BY sort_order ASC').all(campaignId)
  })

  ipcMain.handle('dm-notes:create-group', (_e, campaignId: number, name: string, color: string) => {
    const { m } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_groups WHERE campaign_id = ?').get(campaignId) as { m: number }
    const result = db.prepare(`
      INSERT INTO dm_notes_groups (campaign_id, name, color, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(campaignId, name, color, m + 1)
    return db.prepare('SELECT * FROM dm_notes_groups WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('dm-notes:update-group', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE dm_notes_groups SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM dm_notes_groups WHERE id = ?').get(id)
  })

  ipcMain.handle('dm-notes:delete-group', (_e, id: number) => {
    db.prepare('UPDATE dm_notes_pages SET group_id = NULL WHERE group_id = ?').run(id)
    db.prepare('DELETE FROM dm_notes_groups WHERE id = ?').run(id)
  })

  ipcMain.handle('dm-notes:reorder-groups', (_e, orders: { id: number; sort_order: number }[]) => {
    const stmt = db.prepare('UPDATE dm_notes_groups SET sort_order = @sort_order WHERE id = @id')
    const transaction = db.transaction((list: any[]) => {
      for (const o of list) stmt.run(o)
    })
    transaction(orders)
  })

  // ── Master Loot Tables ────────────────────────────────────────────────────────

  ipcMain.handle('loot-tables:get-all', (_e, campaignId: number) => {
    let tables = db.prepare(
      'SELECT * FROM loot_tables WHERE campaign_id = ? ORDER BY category ASC, name ASC'
    ).all(campaignId) as any[]

    // Auto-seed defaults if campaign has no tables at all
    if (tables.length === 0) {
      tables = seedDefaultTables(campaignId)
    }

    return tables.map(t => ({ ...t, is_default: t.is_default === 1 }))
  })

  ipcMain.handle('loot-tables:get', (_e, id: number) => {
    const t = db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(id) as any
    if (!t) return null
    return { ...t, is_default: t.is_default === 1 }
  })

  ipcMain.handle('loot-tables:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO loot_tables (campaign_id, name, description, category, items, is_default)
      VALUES (@campaign_id, @name, @description, @category, @items, 0)
    `).run({
      description: '',
      category: 'custom',
      items: '[]',
      ...data,
    })
    const t = db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(result.lastInsertRowid) as any
    return { ...t, is_default: t.is_default === 1 }
  })

  ipcMain.handle('loot-tables:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE loot_tables SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })
    const t = db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(id) as any
    return { ...t, is_default: t.is_default === 1 }
  })

  ipcMain.handle('loot-tables:delete', (_e, id: number) => {
    // Null out references before deleting — articles and POIs keep their inline loot_table JSON
    db.prepare('UPDATE articles SET loot_table_id = NULL WHERE loot_table_id = ?').run(id)
    db.prepare('UPDATE pois SET loot_table_id = NULL WHERE loot_table_id = ?').run(id)
    const { affected } = db.prepare('SELECT COUNT(*) as affected FROM articles WHERE loot_table_id = ?').get(id) as { affected: number }
    db.prepare('DELETE FROM loot_tables WHERE id = ?').run(id)
    return { success: true, affected }
  })

  ipcMain.handle('loot-tables:roll', (_e, tableId: number | null, extraItemsJson: string) => {
    // Merge master table items + vendor-specific extras, then roll
    let masterItems: any[] = []
    if (tableId) {
      const table = db.prepare('SELECT items FROM loot_tables WHERE id = ?').get(tableId) as { items: string } | undefined
      if (table) {
        try { masterItems = JSON.parse(table.items) } catch {}
      }
    }

    let extraItems: any[] = []
    try { extraItems = JSON.parse(extraItemsJson || '[]') } catch {}

    const allItems = [...masterItems, ...extraItems]

    // Roll — 100% always drops, others roll against their chance
    const result = allItems.filter(item => {
      if (item.chance >= 100) return true
      return Math.random() * 100 <= item.chance
    })

    return result
  })

  ipcMain.handle('loot-tables:reset-defaults', (_e, campaignId: number) => {
    // Delete existing default-seeded tables and re-seed from JSON
    db.prepare('DELETE FROM loot_tables WHERE campaign_id = ? AND is_default = 1').run(campaignId)
    return seedDefaultTables(campaignId)
  })
}

app.whenReady().then(() => {
  createWindow()
  if (mainWindow) initUpdater(mainWindow)
  const { imagesPath } = initDatabase()
  registerIPC(imagesPath)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})