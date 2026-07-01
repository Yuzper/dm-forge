// path: electron/main/index.ts
import { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu } from 'electron'
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

// ── Default Soundboard scan ─────────────────────────────────────────────────────
// Bundled audio under src/data/soundboard/{ambient,music,effects} becomes a
// read-only "Default Sounds" board. Read live (no DB seeding) so adding a file +
// shipping a release updates defaults on every device. Name derived from filename.

const DEFAULT_SOUND_EXTS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.webm'])
const DEFAULT_SOUND_FOLDERS: { folder: string; category: string }[] = [
  { folder: 'ambient', category: 'ambience' },
  { folder: 'music',   category: 'music' },
  { folder: 'effects', category: 'effect' },
]

function defaultSoundboardDir(): string | null {
  const candidates = [
    path.join(__dirname, '../../src/data/soundboard'),     // dev (__dirname = out/main)
    path.join(__dirname, '../renderer/soundboard'),        // packaged renderer copy, if present
    path.join(process.resourcesPath ?? '', 'soundboard'),  // prod (extraResources)
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

function defaultCreaturesDir(): string | null {
  const candidates = [
    path.join(__dirname, '../../src/data/creatures'),      // dev
    path.join(process.resourcesPath ?? '', 'creatures'),   // prod (extraResources)
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

/** Copy bundled creature images into userData/images/.
 *  Uses per-file mtime comparison so new or updated images are always picked up
 *  without needing a manual version bump. */
function syncCreatureImages(imagesPath: string) {
  const src = defaultCreaturesDir()
  if (!src) return
  for (const file of fs.readdirSync(src)) {
    if (file === 'version') continue
    const srcFile = path.join(src, file)
    const destFile = path.join(imagesPath, `creature_${file}`)
    try {
      const srcMtime = fs.statSync(srcFile).mtimeMs
      const destMtime = fs.existsSync(destFile) ? fs.statSync(destFile).mtimeMs : 0
      if (srcMtime > destMtime) fs.copyFileSync(srcFile, destFile)
    } catch {}
  }
}

/** Returns a map of lowercased-hyphenated name → relative image path for all bundled creature images. */
function buildCreatureImageMap(imagesPath: string): Record<string, string> {
  const map: Record<string, string> = {}
  try {
    for (const file of fs.readdirSync(imagesPath)) {
      if (!file.startsWith('creature_')) continue
      const name = path.basename(file, path.extname(file)).replace(/^creature_/, '').toLowerCase()
      map[name] = `images/${file}`
    }
  } catch {}
  return map
}

function deriveSoundName(filename: string): string {
  const ext  = path.extname(filename)
  return filename
    .slice(0, filename.length - ext.length)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

function scanDefaultSounds(): { category: string; name: string; url: string; ref: string }[] {
  const baseDir = defaultSoundboardDir()
  if (!baseDir) return []
  const out: { category: string; name: string; url: string; ref: string }[] = []
  for (const { folder, category } of DEFAULT_SOUND_FOLDERS) {
    const dir = path.join(baseDir, folder)
    if (!fs.existsSync(dir)) continue
    let entries: string[] = []
    try { entries = fs.readdirSync(dir) } catch { continue }
    for (const entry of entries.sort((a, b) => a.localeCompare(b))) {
      if (!DEFAULT_SOUND_EXTS.has(path.extname(entry).toLowerCase())) continue
      out.push({
        category,
        name: deriveSoundName(entry),
        url: `file://${path.join(dir, entry)}`,
        ref: `default:${folder}/${entry}`,   // stable reference for "Add to board"
      })
    }
  }
  return out
}

function loadDefaultLootTables(): any[] {
  try {
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
            price: item.price ?? '',
            weight: item.weight ?? '',
          }))
        ),
      })
      results.push(db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(result.lastInsertRowid))
    }
  })
  tx()
  return results.map(r => ({ ...r, is_default: r.is_default === 1 }))
}

// ── Family tree relation derivation ───────────────────────────────────────────

// Map a parent's union role (e.g. "husband of", "wife of") to the term the
// child uses for them ("father", "mother", or a neutral "parent").
function parentRoleFromUnionLabel(label: string | null | undefined): string {
  const l = (label || '').toLowerCase()
  if (l.includes('husband') || l.includes('father')) return 'father'
  if (l.includes('wife') || l.includes('mother')) return 'mother'
  return 'parent'
}

function deriveRelationsForNode(
  nodeId: number,
  nodes: any[],
  edges: any[],
  webName: string,
  webId: number,
) {
  const partners: any[] = []
  const children: any[]  = []
  const parents: any[]   = []
  const siblings: any[]  = []
  const siblingIds = new Set<number>()

  const myUnionEdges = edges.filter(e => e.edge_type === 'person_to_union' && e.from_node_id === nodeId)
  for (const ue of myUnionEdges) {
    const unionId = ue.to_node_id
    edges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === unionId && e.from_node_id !== nodeId)
      .forEach(e => {
        const p = nodes.find(n => n.id === e.from_node_id)
        // Use the partner's OWN role in the union (so it reads from the current
        // person's perspective: "Gandalf — husband"), not the current node's role.
        if (p) partners.push({ nodeId: p.id, articleId: p.article_id, name: p.article_title || p.label, role: (e.label_from || '').replace(/ of$/i, '').trim() || 'partner', vitality: p.vitality ?? null })
      })
    edges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === unionId)
      .forEach(e => {
        const c = nodes.find(n => n.id === e.to_node_id)
        if (c) children.push({ nodeId: c.id, articleId: c.article_id, name: c.article_title || c.label, vitality: c.vitality ?? null })
      })
  }

  const parentUnionEdges = edges.filter(e => e.edge_type === 'union_to_child' && e.to_node_id === nodeId)
  for (const pe of parentUnionEdges) {
    const unionId = pe.from_node_id
    const unionMembers = edges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === unionId)
    unionMembers.forEach(e => {
      const p = nodes.find(n => n.id === e.from_node_id)
      // From the child's perspective: show "mother"/"father" rather than the
      // parent's union role ("wife of"/"husband of").
      if (p) parents.push({ nodeId: p.id, articleId: p.article_id, name: p.article_title || p.label, role: parentRoleFromUnionLabel(e.label_from), vitality: p.vitality ?? null })
    })
    if (unionMembers.length < 2) {
      parents.push({ nodeId: null, articleId: null, name: 'Unknown parent', role: 'parent', vitality: null })
    }
    edges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === unionId && e.to_node_id !== nodeId)
      .forEach(e => {
        if (!siblingIds.has(e.to_node_id)) {
          siblingIds.add(e.to_node_id)
          const s = nodes.find(n => n.id === e.to_node_id)
          if (s) siblings.push({ nodeId: s.id, articleId: s.article_id, name: s.article_title || s.label, vitality: s.vitality ?? null })
        }
      })
  }

  return { webId, webName, partners, parents, children, siblings }
}

// ── Hierarchy relation derivation ─────────────────────────────────────────────
// For a node in a hierarchy web: its rank, who it reports to (superiors), and
// who reports to it (direct reports / oversees). reports_to edges are stored
// subordinate → superior (from = subordinate, to = superior).
function deriveHierarchyForNode(nodeId: number, nodes: any[], edges: any[], ranks: any[]) {
  const node = nodes.find(n => n.id === nodeId)
  const rank = node?.rank_id ? (ranks.find(r => r.id === node.rank_id) || null) : null

  const superiors: any[] = []
  const reports: any[] = []

  edges.filter(e => e.edge_type === 'reports_to' && e.from_node_id === nodeId).forEach(e => {
    const s = nodes.find(n => n.id === e.to_node_id)
    if (s) superiors.push({ nodeId: s.id, articleId: s.article_id, name: s.article_title || s.label, vitality: s.vitality ?? null })
  })
  edges.filter(e => e.edge_type === 'reports_to' && e.to_node_id === nodeId).forEach(e => {
    const r = nodes.find(n => n.id === e.from_node_id)
    if (r) reports.push({ nodeId: r.id, articleId: r.article_id, name: r.article_title || r.label, vitality: r.vitality ?? null })
  })

  return { rankName: rank?.name ?? null, superiors, reports }
}

// Leaders of a hierarchy web: occupants of the highest rank present, or — if no
// ranks are assigned — the roots of the reporting tree (have reports, report to none).
function computeHierarchyLeaders(nodes: any[], edges: any[], ranks: any[]): any[] {
  const persons = nodes.filter(n => n.node_type === 'person')
  const rankIdx = (id: string | null) => {
    const i = ranks.findIndex((r: any) => r.id === id)
    return i === -1 ? Infinity : i
  }
  const assigned = persons.filter(n => rankIdx(n.rank_id) !== Infinity)
  if (assigned.length) {
    const minIdx = Math.min(...assigned.map(n => rankIdx(n.rank_id)))
    return assigned.filter(n => rankIdx(n.rank_id) === minIdx)
  }
  const reportsToSomeone = new Set(edges.filter(e => e.edge_type === 'reports_to').map(e => e.from_node_id))
  const hasReports = new Set(edges.filter(e => e.edge_type === 'reports_to').map(e => e.to_node_id))
  return persons.filter(n => hasReports.has(n.id) && !reportsToSomeone.has(n.id))
}

// For a hierarchy web linked to an article: derive the leader(s) from the
// structure and write them into the linked article's "Leader" track.
function syncHierarchyForWeb(webId: number) {
  const web = db.prepare('SELECT * FROM relation_webs WHERE id = ?').get(webId) as any
  if (!web || web.template !== 'org_hierarchy' || !web.article_id) return

  const nodes = db.prepare(`
    SELECT n.id, n.node_type, n.rank_id, n.label, a.title AS article_title
    FROM relation_nodes n
    LEFT JOIN articles a ON a.id = n.article_id
    WHERE n.web_id = ?
  `).all(webId) as any[]
  const edges = db.prepare('SELECT * FROM relation_edges WHERE web_id = ?').all(webId) as any[]
  let ranks: any[] = []
  try { ranks = JSON.parse(web.ranks || '[]') } catch {}

  const leaders = computeHierarchyLeaders(nodes, edges, ranks)
  const leaderStr = leaders.map(n => n.article_title || n.label).filter(Boolean).join(', ')
  // Don't clobber a manually-set Leader when the structure has no leader yet.
  if (!leaderStr) return

  const art = db.prepare('SELECT tracks FROM articles WHERE id = ?').get(web.article_id) as any
  if (!art) return
  let tracks: Record<string, any> = {}
  try { tracks = JSON.parse(art.tracks || '{}') } catch {}
  if ((tracks.Leader || '') !== leaderStr) {
    tracks.Leader = leaderStr
    db.prepare('UPDATE articles SET tracks = ? WHERE id = ?').run(JSON.stringify(tracks), web.article_id)
  }
}

// Auto-generate & maintain the campaign's single "Territory" web from location
// "Within" links. Reconciles nodes/edges to the current containment graph,
// preserving positions of nodes that already exist so the layout grows gradually.
function syncTerritoryWeb(campaignId: number) {
  const locations = db.prepare(
    `SELECT id, title, tracks FROM articles WHERE campaign_id = ? AND article_type = 'location'`
  ).all(campaignId) as any[]

  // Map lowercased title → article id, to resolve the "Within" title reference.
  const titleToId = new Map<string, number>()
  for (const l of locations) titleToId.set(l.title.toLowerCase(), l.id)

  const withinOf = (tracks: string): string => {
    try { return (JSON.parse(tracks || '{}').Within || '').trim() } catch { return '' }
  }

  // Containment links: child article → parent article.
  const links: { childId: number; parentId: number }[] = []
  for (const l of locations) {
    const within = withinOf(l.tracks)
    if (!within) continue
    const parentId = titleToId.get(within.toLowerCase())
    if (parentId && parentId !== l.id) links.push({ childId: l.id, parentId })
  }

  let web = db.prepare(
    `SELECT * FROM relation_webs WHERE campaign_id = ? AND template = 'territory' LIMIT 1`
  ).get(campaignId) as any

  // No containment anywhere — remove the auto web entirely if it exists.
  if (links.length === 0) {
    if (web) db.prepare(`DELETE FROM relation_webs WHERE id = ?`).run(web.id)
    return
  }

  if (!web) {
    const res = db.prepare(`
      INSERT INTO relation_webs (campaign_id, name, description, template, ranks, article_id)
      VALUES (?, 'Territory', 'Auto-generated from location “Within” links — edits here are overwritten.', 'territory', '[]', NULL)
    `).run(campaignId)
    web = db.prepare(`SELECT * FROM relation_webs WHERE id = ?`).get(res.lastInsertRowid)
  }
  const webId = web.id as number

  // Every location that participates in at least one containment link.
  const participating = new Set<number>()
  for (const { childId, parentId } of links) { participating.add(childId); participating.add(parentId) }

  const existingNodes = db.prepare(
    `SELECT id, article_id, pos_x, pos_y FROM relation_nodes WHERE web_id = ?`
  ).all(webId) as any[]
  const nodeByArticle = new Map<number, any>(existingNodes.map(n => [n.article_id, n]))
  const locById = new Map<number, any>(locations.map(l => [l.id, l]))

  // Drop nodes whose location no longer participates (cascades their edges).
  for (const n of existingNodes) {
    if (!participating.has(n.article_id)) {
      db.prepare(`DELETE FROM relation_nodes WHERE id = ?`).run(n.id)
      nodeByArticle.delete(n.article_id)
    }
  }

  // Add nodes for newly participating locations, placed near their parent.
  const insertNode = db.prepare(`
    INSERT INTO relation_nodes (web_id, article_id, label, node_type, pos_x, pos_y)
    VALUES (?, ?, ?, 'person', ?, ?)
  `)
  for (const artId of participating) {
    if (nodeByArticle.has(artId)) continue
    const loc = locById.get(artId)
    const link = links.find(l => l.childId === artId)
    let px = 120 + Math.random() * 60, py = 120
    if (link) {
      const parent = nodeByArticle.get(link.parentId)
      if (parent) { px = parent.pos_x + (Math.random() * 80 - 40); py = parent.pos_y + 140 }
    }
    const res = insertNode.run(webId, artId, loc?.title ?? 'Location', px, py)
    nodeByArticle.set(artId, { id: res.lastInsertRowid as number, article_id: artId, pos_x: px, pos_y: py })
  }

  // Reconcile edges to exactly the parent→child set.
  // Edges are fully derived — wipe and rebuild so styling stays consistent.
  // 'reports_to' renders as clean stepped org-chart connectors with an arrowhead
  // and no label pills; bottom→top handles keep the lines flowing straight down.
  db.prepare(`DELETE FROM relation_edges WHERE web_id = ?`).run(webId)
  const insertEdge = db.prepare(`
    INSERT INTO relation_edges (web_id, from_node_id, to_node_id, label_from, label_to, edge_type, from_handle, to_handle)
    VALUES (?, ?, ?, '', '', 'reports_to', 'bottom', 'top')
  `)
  const made = new Set<string>()
  for (const { childId, parentId } of links) {
    const pn = nodeByArticle.get(parentId), cn = nodeByArticle.get(childId)
    if (!pn || !cn) continue
    const key = `${pn.id}-${cn.id}`
    if (made.has(key)) continue
    made.add(key)
    insertEdge.run(webId, pn.id, cn.id)
  }

  db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(webId)
}

function initDatabase() {
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
  if (!campaignCols.some(c => c.name === 'timeline_base_year')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN timeline_base_year INTEGER NOT NULL DEFAULT 1507`)
  }
  if (!campaignCols.some(c => c.name === 'timeline_eras')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN timeline_eras TEXT`)
  }
  if (!campaignCols.some(c => c.name === 'timeline_show_lifespans')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN timeline_show_lifespans INTEGER NOT NULL DEFAULT 0`)
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

// ── Resilient directory copy (for backup export/import) ─────────────────────────
// Copies every file from srcDir into dstDir. Each entry is wrapped in its own
// try/catch so a single unreadable/locked/odd entry can never abort the whole
// transfer — historically a mid-loop throw here left maps (which sort after
// profile images) un-copied while the DB had already been swapped in.
function copyDirContents(srcDir: string, dstDir: string): { copied: number; failed: string[] } {
  const failed: string[] = []
  let copied = 0
  if (!fs.existsSync(srcDir)) return { copied, failed }
  fs.mkdirSync(dstDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name)
    const dst = path.join(dstDir, entry.name)
    try {
      if (entry.isDirectory()) {
        const sub = copyDirContents(src, dst)
        copied += sub.copied
        failed.push(...sub.failed)
      } else {
        fs.copyFileSync(src, dst)
        copied++
      }
    } catch (err: any) {
      failed.push(entry.name)
      log.warn(`Backup: failed to copy "${src}": ${err?.message ?? err}`)
    }
  }
  return { copied, failed }
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

  const systemLocale = app.getLocale()
  const available = mainWindow.webContents.session.availableSpellCheckerLanguages
  const language = available.includes(systemLocale) ? systemLocale : 'en-US'
  mainWindow.webContents.session.setSpellCheckerLanguages([language])

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
//    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.on('context-menu', (_, params) => {
    if (!params.misspelledWord) return
    const menu = Menu.buildFromTemplate([
      ...(params.dictionarySuggestions ?? []).map(word => ({
        label: word,
        click: () => mainWindow!.webContents.replaceMisspelling(word),
      })),
      ...((params.dictionarySuggestions ?? []).length > 0 ? [{ type: 'separator' as const }] : []),
      {
        label: 'Add to dictionary',
        click: () => mainWindow!.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      },
    ])
    menu.popup()
  })

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
      if (!article.portrait_image?.includes('creature_')) safeUnlinkRelative(article.portrait_image, userDataPath)
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
      ORDER BY s.is_draft ASC, s.session_number ASC, s.session_sub ASC, s.sort_order ASC
    `).all(campaignId)
  })

  ipcMain.handle('sessions:create', (_e, data: any) => {
    const isDraft = data.is_draft ? 1 : 0
    let sessionNumber = data.session_number ?? 1
    let sortOrder = 0
    if (isDraft) {
      // Drafts aren't sequenced: park them at number 0 and append to the prep list.
      sessionNumber = 0
      const { m } = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS m FROM sessions WHERE campaign_id = @campaign_id AND is_draft = 1'
      ).get(data) as { m: number }
      sortOrder = m + 1
    }
    const result = db.prepare(`
      INSERT INTO sessions (campaign_id, name, session_number, session_sub, arc_id, date, notes, is_draft, sort_order)
      VALUES (@campaign_id, @name, @session_number, @session_sub, @arc_id, @date, @notes, @is_draft, @sort_order)
    `).run({ date: null, notes: '', session_sub: '', arc_id: null, ...data, session_number: sessionNumber, is_draft: isDraft, sort_order: sortOrder })
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid) as any

    if (!isDraft) {
      const sysGroup = db.prepare(
        'SELECT * FROM dm_notes_groups WHERE campaign_id = ? AND is_system = 1'
      ).get(data.campaign_id) as any
      if (sysGroup) {
        const title = data.session_sub
          ? `Session ${sessionNumber}${data.session_sub}`
          : `Session ${sessionNumber}`
        const { m } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE group_id = ?'
        ).get(sysGroup.id) as { m: number }
        db.prepare(`
          INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order, session_id)
          VALUES (?, ?, '{"type":"doc","content":[]}', ?, ?, ?)
        `).run(data.campaign_id, title, sysGroup.id, m + 1, session.id)
      }
    }

    return session
  })

  ipcMain.handle('sessions:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE sessions SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  })

  // Promote a draft into the sequenced list: append it as the next whole number.
  ipcMain.handle('sessions:promote', (_e, id: number) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
    if (!session) return null
    const { m } = db.prepare(
      'SELECT COALESCE(MAX(session_number), 0) AS m FROM sessions WHERE campaign_id = ? AND is_draft = 0'
    ).get(session.campaign_id) as { m: number }
    const newNumber = m + 1
    db.prepare(
      "UPDATE sessions SET is_draft = 0, session_number = ?, session_sub = '', sort_order = 0 WHERE id = ?"
    ).run(newNumber, id)
    const promoted = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any

    const sysGroup = db.prepare(
      'SELECT * FROM dm_notes_groups WHERE campaign_id = ? AND is_system = 1'
    ).get(session.campaign_id) as any
    if (sysGroup) {
      const already = db.prepare(
        'SELECT id FROM dm_notes_pages WHERE session_id = ?'
      ).get(id) as any
      if (!already) {
        const title = `Session ${newNumber}`
        const { m: maxOrder } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE group_id = ?'
        ).get(sysGroup.id) as { m: number }
        db.prepare(`
          INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order, session_id)
          VALUES (?, ?, '{"type":"doc","content":[]}', ?, ?, ?)
        `).run(session.campaign_id, title, sysGroup.id, maxOrder + 1, id)
      }
    }

    return promoted
  })

  ipcMain.handle('sessions:reorder-drafts', (_e, orders: { id: number; sort_order: number }[]) => {
    const stmt = db.prepare('UPDATE sessions SET sort_order = @sort_order WHERE id = @id')
    db.transaction((list: { id: number; sort_order: number }[]) => {
      for (const o of list) stmt.run(o)
    })(orders)
  })

  ipcMain.handle('sessions:get-poi-texts', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT p.label, p.content, m.session_id
      FROM pois p
      JOIN maps m ON m.id = p.map_id
      JOIN sessions s ON s.id = m.session_id
      WHERE s.campaign_id = ?
    `).all(campaignId)
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
      'SELECT * FROM arcs WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC'
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
    const { m } = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as m FROM arcs WHERE campaign_id = @campaign_id'
    ).get(data) as { m: number }
    const result = db.prepare(`
      INSERT INTO arcs (campaign_id, name, color, is_default, sort_order)
      VALUES (@campaign_id, @name, @color, 0, @sort_order)
    `).run({ color: '#c8a84b', sort_order: m + 1, ...data })
    const arc = db.prepare('SELECT * FROM arcs WHERE id = ?').get(result.lastInsertRowid) as any
    return { ...arc, is_default: false }
  })

  ipcMain.handle('arcs:reorder', (_e, orders: { id: number; sort_order: number }[]) => {
    const stmt = db.prepare('UPDATE arcs SET sort_order = @sort_order WHERE id = @id')
    db.transaction((list: { id: number; sort_order: number }[]) => {
      for (const o of list) stmt.run(o)
    })(orders)
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

  // Opens the native file explorer (defaulting to the app's images folder) so the
  // user can either import a fresh image or simply re-pick one that was already
  // imported. If the chosen file already lives in our images dir we reference it
  // directly — that's the "reuse" path, no duplicate copy or re-encode.
  async function pickMapImage(
    title: string,
    baseNamePrefix: string,
  ): Promise<{ path: string; name: string } | null> {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      defaultPath: imagesPath,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const srcPath = result.filePaths[0]
    const name = path.basename(srcPath, path.extname(srcPath))
    if (path.resolve(path.dirname(srcPath)) === path.resolve(imagesPath)) {
      // Already an imported image — reuse in place.
      return { path: `images/${path.basename(srcPath)}`, name }
    }
    const baseName = `${baseNamePrefix}_${Date.now()}`
    const filename = processAndSaveImage(srcPath, imagesPath, baseName, 4000, 85)
    return { path: `images/${filename}`, name }
  }

  ipcMain.handle('maps:get-all', (_e, sessionId: number) => {
    return db.prepare(`
      SELECT m.*, COUNT(p.id) as poi_count
      FROM maps m
      LEFT JOIN pois p ON p.map_id = m.id
      WHERE m.session_id = ?
      GROUP BY m.id
      ORDER BY m.sort_order ASC, m.created_at ASC
    `).all(sessionId)
  })

  ipcMain.handle('maps:get-by-article', (_e, articleId: number) => {
    return db.prepare(`
      SELECT m.*, COUNT(p.id) as poi_count
      FROM maps m
      LEFT JOIN pois p ON p.map_id = m.id
      WHERE m.article_id = ?
      GROUP BY m.id
      ORDER BY m.created_at ASC
    `).all(articleId)
  })

  ipcMain.handle('maps:create', (_e, data: any) => {
    const full = { session_id: null, article_id: null, campaign_id: null, ...data }
    // Append after existing maps owned by the same parent (NULL-safe match via IS).
    const { m } = db.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM maps
       WHERE session_id IS @session_id AND article_id IS @article_id AND campaign_id IS @campaign_id`
    ).get(full) as { m: number }
    const result = db.prepare(
      'INSERT INTO maps (session_id, article_id, campaign_id, name, image_path, sort_order) VALUES (@session_id, @article_id, @campaign_id, @name, @image_path, @sort_order)'
    ).run({ ...full, sort_order: m + 1 })
    return db.prepare('SELECT * FROM maps WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('maps:update', (_e, id: number, data: any) => {
    // When moving a map to another session, append it to the end of that
    // session's tab order so it doesn't collide with an existing sort_order.
    if (data.session_id != null && data.sort_order === undefined) {
      const { m } = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS m FROM maps WHERE session_id = ?'
      ).get(data.session_id) as { m: number }
      data = { ...data, sort_order: m + 1 }
    }
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE maps SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM maps WHERE id = ?').get(id)
  })

  ipcMain.handle('maps:reorder', (_e, orders: { id: number; sort_order: number }[]) => {
    const stmt = db.prepare('UPDATE maps SET sort_order = @sort_order WHERE id = @id')
    db.transaction((list: { id: number; sort_order: number }[]) => {
      for (const o of list) stmt.run(o)
    })(orders)
  })

  ipcMain.handle('maps:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const map = db.prepare('SELECT image_path FROM maps WHERE id = ?').get(id) as { image_path: string } | undefined
    db.prepare('DELETE FROM maps WHERE id = ?').run(id)
    if (map?.image_path) safeUnlinkRelative(map.image_path, userDataPath)
  })

  ipcMain.handle('maps:import-image', (_e, sessionId: number) =>
    pickMapImage('Select Map Image', `map_${sessionId}`))

  ipcMain.handle('maps:replace-image', async (_e, mapId: number) => {
    const result = await pickMapImage('Select Replacement Map Image', `map_${mapId}_replace`)
    return result ? { path: result.path } : null
  })

  ipcMain.handle('maps:import-for-article', (_e, articleId: number) =>
    pickMapImage('Select Map Image', `map_article_${articleId}`))

  ipcMain.handle('maps:get-by-campaign', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT m.*, COUNT(p.id) as poi_count
      FROM maps m
      LEFT JOIN pois p ON p.map_id = m.id
      WHERE m.campaign_id = ?
      GROUP BY m.id
      ORDER BY m.created_at ASC
    `).all(campaignId)
  })

  ipcMain.handle('maps:import-for-campaign', (_e, campaignId: number) =>
    pickMapImage('Select Map Image', `map_campaign_${campaignId}`))

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
    if (filter?.tag) {
      // Match stored tags OR articles that are nodes in a web with this name
      query += ` AND (
        tags LIKE ?
        OR id IN (
          SELECT n.article_id FROM relation_nodes n
          JOIN relation_webs w ON w.id = n.web_id
          WHERE n.article_id IS NOT NULL AND w.name = ? COLLATE NOCASE
          ${filter.campaignId ? 'AND w.campaign_id = ?' : ''}
        )
      )`
      params.push(`%"${filter.tag}"%`, filter.tag)
      if (filter.campaignId) params.push(filter.campaignId)
    }
    if (filter?.search) {
      const byTitle = filter.searchTitle !== false
      const byTags  = filter.searchTags  !== false
      const clauses: string[] = []
      const clauseParams: any[] = []
      if (byTitle) {
        clauses.push('title LIKE ?')
        clauseParams.push(`%${filter.search}%`)
      }
      if (byTags) {
        clauses.push('tags LIKE ?')
        clauseParams.push(`%${filter.search}%`)
        // Also match articles that are nodes in a web whose name matches the search
        clauses.push(`id IN (
          SELECT n.article_id FROM relation_nodes n
          JOIN relation_webs w ON w.id = n.web_id
          WHERE n.article_id IS NOT NULL AND w.name LIKE ?
          ${filter.campaignId ? 'AND w.campaign_id = ?' : ''}
        )`)
        clauseParams.push(`%${filter.search}%`)
        if (filter.campaignId) clauseParams.push(filter.campaignId)
      }
      if (clauses.length) {
        query += ` AND (${clauses.join(' OR ')})`
        params.push(...clauseParams)
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
      WHERE campaign_id = ?
        AND title != ?
        AND (content LIKE ? OR tracks LIKE ?)
      ORDER BY title ASC
    `).all(campaignId, title, `%"title":"${title}"%`, `%"${title}"%`)
  })

  // Wiki health: stub articles, orphans (no links in/out), and broken [[links]].
  ipcMain.handle('articles:health', (_e, campaignId: number) => {
    const rows = db.prepare(`
      SELECT id, title, article_type, content, tracks, statblock, item_block, substeps, rewards
      FROM articles WHERE campaign_id = ?
    `).all(campaignId) as any[]

    // The editor serializes a full default statblock on every save, so column
    // length says nothing — check each type's block for actual data instead.
    const hasStructuredContent = (r: any): boolean => {
      try {
        if (r.article_type === 'quest') {
          if (JSON.parse(r.substeps || '[]').length > 0) return true
          const rewards = JSON.parse(r.rewards || '[]')
          return Array.isArray(rewards) && rewards.length > 0
        }
        if (r.article_type === 'item' || r.article_type === 'artifact') {
          const ib = JSON.parse(r.item_block || '{}')
          return !!(ib.category || ib.rarity || (ib.description || '').trim() || ib.properties?.length || ib.requiresAttunement)
        }
        if (r.article_type === 'creature' || r.article_type === 'character' || r.article_type === 'playerCharacter') {
          const parsed = JSON.parse(r.statblock || '{}')
          // Creatures store an array of variants; others a single statblock.
          const blocks = Array.isArray(parsed) ? parsed.map((v: any) => v.statblock ?? v) : [parsed]
          return blocks.some((sb: any) =>
            sb && (sb.traits?.length || sb.actions?.length || sb.cr || sb.classLevels?.length))
        }
      } catch {}
      return false
    }

    // Walk a TipTap doc: total trimmed text length + wikiLink titles (original case).
    const extract = (raw: string) => {
      let textLen = 0
      const links = new Map<string, string>() // lowercase → original
      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return
        if (typeof node.text === 'string') {
          textLen += node.text.trim().length
          for (const m of node.marks ?? []) {
            if (m.type === 'wikiLink' && m.attrs?.title) {
              const t = String(m.attrs.title)
              links.set(t.toLowerCase(), t)
            }
          }
        }
        for (const child of node.content ?? []) walk(child)
      }
      try { walk(JSON.parse(raw)) } catch {}
      return { textLen, links }
    }

    const byTitle = new Map<string, any>()
    for (const r of rows) byTitle.set(r.title.toLowerCase(), r)

    // Articles placed in a relation web count as connected.
    const webArticleIds = new Set(db.prepare(`
      SELECT DISTINCT n.article_id FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE w.campaign_id = ? AND n.article_id IS NOT NULL
    `).all(campaignId).map((r: any) => r.article_id))

    const incoming = new Map<number, number>()
    const outgoing = new Map<number, number>()
    const broken = new Map<string, { title: string; sources: { id: number; title: string }[] }>()
    const stubs: { id: number; title: string; article_type: string; textLen: number }[] = []

    for (const r of rows) {
      const { textLen, links } = extract(r.content)

      // Track values naming another article (quest giver, ruler, …) count as links.
      try {
        const tracks = JSON.parse(r.tracks || '{}')
        for (const v of Object.values(tracks)) {
          if (typeof v === 'string' && byTitle.has(v.toLowerCase())) links.set(v.toLowerCase(), v)
        }
      } catch {}
      links.delete(r.title.toLowerCase()) // self-references don't count

      for (const [key, original] of links) {
        const target = byTitle.get(key)
        if (target) {
          outgoing.set(r.id, (outgoing.get(r.id) ?? 0) + 1)
          incoming.set(target.id, (incoming.get(target.id) ?? 0) + 1)
        } else {
          const entry = broken.get(key) ?? { title: original, sources: [] }
          entry.sources.push({ id: r.id, title: r.title })
          broken.set(key, entry)
        }
      }

      // Stub check: little prose and no real structured content for its type.
      if (textLen < 100 && !hasStructuredContent(r)) {
        stubs.push({ id: r.id, title: r.title, article_type: r.article_type, textLen })
      }
    }

    // Links from session notes and DM notes count as incoming for orphan purposes.
    const noteDocs = [
      ...db.prepare('SELECT notes AS doc FROM sessions WHERE campaign_id = ?').all(campaignId) as any[],
      ...db.prepare('SELECT content AS doc FROM dm_notes_pages WHERE campaign_id = ?').all(campaignId) as any[],
    ]
    for (const n of noteDocs) {
      for (const [key] of extract(n.doc || '').links) {
        const target = byTitle.get(key)
        if (target) incoming.set(target.id, (incoming.get(target.id) ?? 0) + 1)
      }
    }

    // Creatures are bestiary reference and notes are intentionally standalone —
    // neither is expected to be woven into the wiki, so skip the orphan check.
    const orphans = rows
      .filter(r => r.article_type !== 'creature' && r.article_type !== 'note')
      .filter(r => !outgoing.get(r.id) && !incoming.get(r.id) && !webArticleIds.has(r.id))
      .map(r => ({ id: r.id, title: r.title, article_type: r.article_type }))
      .sort((a, b) => a.title.localeCompare(b.title))

    stubs.sort((a, b) => a.textLen - b.textLen)
    const brokenList = [...broken.values()].sort((a, b) => b.sources.length - a.sources.length)

    return { stubs, orphans, broken: brokenList }
  })

  ipcMain.handle('articles:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO articles (campaign_id, title, content, article_type, tags, tracks, statblock, loot_table, loot_table_id, portrait_image)
      VALUES (@campaign_id, @title, @content, @article_type, @tags, @tracks, @statblock, @loot_table, @loot_table_id, @portrait_image)
    `).run({
      content: '{"type":"doc","content":[]}',
      article_type: 'location',
      tags: '[]',
      tracks: '{}',
      statblock: '{}',
      loot_table: '{"name":"Loot","items":[]}',
      loot_table_id: null,
      portrait_image: null,
      ...data,
    })
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('articles:update', (_e, id: number, data: any) => {
    const userDataPath = app.getPath('userData')
    const old = db.prepare(
      'SELECT content, cover_image, portrait_image, campaign_id, article_type FROM articles WHERE id = ?'
    ).get(id) as { content: string; cover_image: string | null; portrait_image: string | null; campaign_id: number; article_type: string } | undefined

    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE articles SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })

    // Keep the auto territory web in sync when a location's containment may change.
    if (old && old.article_type === 'location' && (data.tracks !== undefined || data.title !== undefined)) {
      try { syncTerritoryWeb(old.campaign_id) } catch (e) { console.error('syncTerritoryWeb failed:', e) }
    }

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
      'SELECT content, cover_image, portrait_image, campaign_id, article_type FROM articles WHERE id = ?'
    ).get(id) as { content: string; cover_image: string | null; portrait_image: string | null; campaign_id: number; article_type: string } | undefined

    // Hierarchy webs that reference this article — refresh their linked article's
    // Leader track after deletion (family relations are computed live, so they
    // need no resync). Captured before the delete cascades article_id to NULL.
    const affectedWebs = db.prepare(`
      SELECT DISTINCT n.web_id
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE n.article_id = ? AND w.template = 'org_hierarchy'
    `).all(id) as { web_id: number }[]

    db.prepare('DELETE FROM articles WHERE id = ?').run(id)

    for (const { web_id } of affectedWebs) syncHierarchyForWeb(web_id)

    // A deleted location leaves an orphaned territory node (article_id → NULL) —
    // resync to prune it and any containment edges that referenced it.
    if (article && article.article_type === 'location') {
      try { syncTerritoryWeb(article.campaign_id) } catch (e) { console.error('syncTerritoryWeb failed:', e) }
    }

    if (article) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink)
      safeUnlinkRelative(article.cover_image, userDataPath)
      if (!article.portrait_image?.includes('creature_')) safeUnlinkRelative(article.portrait_image, userDataPath)
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
      SELECT cc.*, a.title, a.statblock, a.loot_table, a.loot_table_id, a.article_type
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.encounter_id = ?
      ORDER BY
        CASE WHEN cc.initiative IS NULL THEN 1 ELSE 0 END,
        cc.initiative DESC,
        cc.instance_number ASC
    `).all(encounterId) as any[]
    return rows.map(r => ({
      ...r,
      is_dead: r.is_dead === 1,
      // Variant statblock takes priority over article statblock
      statblock:     r.variant_statblock     ?? r.statblock,
      // Variant loot takes priority over article loot
      loot_table_id: r.variant_loot_table_id ?? r.loot_table_id,
      loot_table:    r.variant_loot_table    ?? r.loot_table,
      // Display name: variant name if set, otherwise article title
      display_name:  r.variant_name          ?? r.title,
    }))
  })

  ipcMain.handle('combat:add-creature', (_e, encounterId: number, articleId: number, maxHp: number, variantData?: {
    variant_name: string | null
    variant_statblock: string | null
    variant_loot_table_id: number | null
    variant_loot_table: string | null
    cr: string | null
  }) => {
    // Instance number scoped to article + variant so two different variants
    // of the same creature don't share instance numbering
    const variantName = variantData?.variant_name ?? null
    const { cnt } = db.prepare(`
      SELECT COUNT(*) as cnt FROM combat_creatures
      WHERE encounter_id = ? AND article_id = ?
      AND (variant_name IS ? OR (variant_name IS NULL AND ? IS NULL))
    `).get(encounterId, articleId, variantName, variantName) as { cnt: number }
    const instanceNumber = cnt + 1

    const result = db.prepare(`
      INSERT INTO combat_creatures
        (encounter_id, article_id, instance_number, max_hp, current_hp,
         variant_name, variant_statblock, variant_loot_table_id, variant_loot_table, cr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      encounterId, articleId, instanceNumber, maxHp, maxHp,
      variantName,
      variantData?.variant_statblock     ?? null,
      variantData?.variant_loot_table_id ?? null,
      variantData?.variant_loot_table    ?? null,
      variantData?.cr                    ?? null,
    )

    const row = db.prepare(`
      SELECT cc.*, a.title, a.statblock, a.loot_table, a.loot_table_id, a.article_type
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.id = ?
    `).get(result.lastInsertRowid) as any

    return {
      ...row,
      is_dead:       row.is_dead === 1,
      statblock:     row.variant_statblock     ?? row.statblock,
      loot_table_id: row.variant_loot_table_id ?? row.loot_table_id,
      loot_table:    row.variant_loot_table     ?? row.loot_table,
      display_name:  row.variant_name           ?? row.title,
    }
  })

  ipcMain.handle('combat:delete-creature', (_e, creatureId: number) => {
    db.prepare('DELETE FROM combat_creatures WHERE id = ?').run(creatureId)
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

  ipcMain.handle('statblock:open-window', async (_e, articleId: number, overrides?: { statblock?: string; name?: string }) => {
    const existing = BrowserWindow.getAllWindows().find(w => {
      try {
        const url = w.webContents.getURL()
        const matchesArticle = url.includes(`articleId=${articleId}`) && url.includes('mode=statblock')
        if (!matchesArticle) return false
        // If a variant name override is present, require it to match too
        if (overrides?.name) {
          return url.includes(`nameOverride=${encodeURIComponent(overrides.name)}`)
        }
        // No variant name — match any window for this article that also has no nameOverride
        return !url.includes('nameOverride=')
      } catch { return false }
    })
    if (existing) { existing.focus(); return }

    const win = new BrowserWindow({
      width: 420, height: 650, minWidth: 360, minHeight: 400,
      title: overrides?.name ?? 'Stat Block', alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true, nodeIntegration: false, webSecurity: false,
      },
    })

    // Build query string — encode overrides as URL params
    const query: Record<string, string> = { mode: 'statblock', articleId: String(articleId) }
    if (overrides?.statblock) query.statblockOverride = encodeURIComponent(overrides.statblock)
    if (overrides?.name)      query.nameOverride      = encodeURIComponent(overrides.name)
    const qs = Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&')

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${qs}`)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { mode: 'statblock', articleId: String(articleId), ...query },
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
    // Bundled default sounds are referenced as `default:<folder>/<file>` so they
    // resolve against the app's read-only soundboard dir, not userData. This lets
    // a default sound be added to a campaign board and still export/import cleanly.
    if (relativePath.startsWith('default:')) {
      const baseDir = defaultSoundboardDir()
      const rel     = relativePath.slice('default:'.length)
      return baseDir ? `file://${path.join(baseDir, rel)}` : ''
    }
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
      const { failed: imgFailed } = copyDirContents(imgSrc, imgDst)
      if (imgFailed.length) {
        log.warn(`Backup export: ${imgFailed.length} image(s) could not be copied: ${imgFailed.join(', ')}`)
      }
      const sndSrc = path.join(userDataPath, 'sounds')
      const sndDst = path.join(backupDir, 'sounds')
      const { failed: sndFailed } = copyDirContents(sndSrc, sndDst)
      if (sndFailed.length) {
        log.warn(`Backup export: ${sndFailed.length} sound(s) could not be copied: ${sndFailed.join(', ')}`)
      }
      return { success: true, path: backupDir, failedImages: imgFailed.length }
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
      const dbDst = path.join(userDataPath, 'dmforge.db')
      fs.copyFileSync(backupDb, dbDst)
      // Drop any stale journal files belonging to the previous database — left in
      // place they can be replayed over the freshly-imported db and corrupt it.
      for (const journal of ['dmforge.db-wal', 'dmforge.db-shm']) {
        try { fs.rmSync(path.join(userDataPath, journal), { force: true }) } catch { /* ignore */ }
      }
      // Copy a matching journal from the backup only if one was captured alongside it.
      for (const journal of ['dmforge.db-wal', 'dmforge.db-shm']) {
        const src = path.join(backupDir, journal)
        if (fs.existsSync(src)) {
          try { fs.copyFileSync(src, path.join(userDataPath, journal)) } catch { /* ignore */ }
        }
      }
      const backupImages = path.join(backupDir, 'images')
      const imagesDir = path.join(userDataPath, 'images')
      const { failed: imgFailed2 } = copyDirContents(backupImages, imagesDir)
      if (imgFailed2.length) {
        log.warn(`Backup import: ${imgFailed2.length} image(s) could not be copied: ${imgFailed2.join(', ')}`)
      }
      const backupSounds = path.join(backupDir, 'sounds')
      const soundsDir = path.join(userDataPath, 'sounds')
      fs.mkdirSync(soundsDir, { recursive: true })
      const { failed: sndFailed2 } = copyDirContents(backupSounds, soundsDir)
      if (sndFailed2.length) {
        log.warn(`Backup import: ${sndFailed2.length} sound(s) could not be copied: ${sndFailed2.join(', ')}`)
      }
      app.relaunch()
      app.exit(0)
      return { success: true }
    } catch (err: any) {
      log.error(`Backup import failed: ${err?.message ?? err}`)
      return { success: false, error: err.message }
    }
  })

  // ── DM Notes — Pages ──────────────────────────────────────────────────────────

  ipcMain.handle('dm-notes:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT id, campaign_id, title, group_id, sort_order, session_id, created_at, updated_at
      FROM dm_notes_pages
      WHERE campaign_id = ?
      ORDER BY sort_order ASC
    `).all(campaignId)
  })

  ipcMain.handle('dm-notes:get', (_e, id: number) => {
    const page = db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(id) as any
    if (!page) return null
    if (page.session_id) {
      const session = db.prepare('SELECT notes FROM sessions WHERE id = ?').get(page.session_id) as any
      if (session) page.content = session.notes && session.notes !== '' ? session.notes : '{"type":"doc","content":[]}'
    }
    return page
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
    const page = db.prepare('SELECT session_id FROM dm_notes_pages WHERE id = ?').get(id) as any
    if (page?.session_id && 'content' in data) {
      // Route content changes to the linked session instead of the page's own content column
      db.prepare('UPDATE sessions SET notes = ? WHERE id = ?').run(data.content, page.session_id)
      const rest = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'content'))
      if (Object.keys(rest).length > 0) {
        const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
        db.prepare(`UPDATE dm_notes_pages SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...rest, id })
      } else {
        db.prepare(`UPDATE dm_notes_pages SET updated_at = datetime('now') WHERE id = @id`).run({ id })
      }
    } else {
      const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE dm_notes_pages SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })
    }
    // Return the page with session content substituted if applicable
    const updated = db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(id) as any
    if (updated?.session_id) {
      const session = db.prepare('SELECT notes FROM sessions WHERE id = ?').get(updated.session_id) as any
      if (session) updated.content = session.notes && session.notes !== '' ? session.notes : '{"type":"doc","content":[]}'
    }
    return updated
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
    const grp = db.prepare('SELECT is_system FROM dm_notes_groups WHERE id = ?').get(id) as any
    if (grp?.is_system) return
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

  // Ensures the "Session Notes" system group exists and every non-draft session has a page in it.
  ipcMain.handle('dm-notes:sync-session-notes', (_e, campaignId: number) => {
    return db.transaction(() => {
      let group = db.prepare(
        'SELECT * FROM dm_notes_groups WHERE campaign_id = ? AND is_system = 1'
      ).get(campaignId) as any
      if (!group) {
        const { m } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_groups WHERE campaign_id = ?'
        ).get(campaignId) as { m: number }
        const r = db.prepare(`
          INSERT INTO dm_notes_groups (campaign_id, name, color, sort_order, is_system)
          VALUES (?, 'Session Notes', '#5b9fe8', ?, 1)
        `).run(campaignId, m + 1)
        group = db.prepare('SELECT * FROM dm_notes_groups WHERE id = ?').get(r.lastInsertRowid)
      }

      const sessions = db.prepare(
        'SELECT * FROM sessions WHERE campaign_id = ? AND is_draft = 0 ORDER BY session_number ASC, session_sub ASC'
      ).all(campaignId) as any[]

      const existingSessionIds = new Set(
        (db.prepare('SELECT session_id FROM dm_notes_pages WHERE group_id = ? AND session_id IS NOT NULL').all(group.id) as any[])
          .map((p: any) => p.session_id)
      )

      const newPages: any[] = []
      for (const session of sessions) {
        if (existingSessionIds.has(session.id)) continue
        const title = session.session_sub
          ? `Session ${session.session_number}${session.session_sub}`
          : `Session ${session.session_number}`
        const { m } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE group_id = ?'
        ).get(group.id) as { m: number }
        const r = db.prepare(`
          INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order, session_id)
          VALUES (?, ?, '{"type":"doc","content":[]}', ?, ?, ?)
        `).run(campaignId, title, group.id, m + 1, session.id)
        newPages.push(db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(r.lastInsertRowid))
      }

      return { group, newPages }
    })()
  })

  // ── Creature Images ───────────────────────────────────────────────────────────

  // Returns { "goblin": "C:\\Users\\...\\images\\creature_goblin.jpg", … }
  // Values are full absolute paths (no file:// prefix) — matching the format WikiPage stores for all images.
  ipcMain.handle('creatures:list-images', () => {
    const userDataPath = app.getPath('userData')
    const imagesPath = path.join(userDataPath, 'images')
    const relMap = buildCreatureImageMap(imagesPath)
    const fullMap: Record<string, string> = {}
    for (const [key, relativePath] of Object.entries(relMap)) {
      fullMap[key] = path.join(userDataPath, relativePath)
    }
    return fullMap
  })

  // ── Master Loot Tables ────────────────────────────────────────────────────────

  ipcMain.handle('loot-tables:get-all', (_e, campaignId: number) => {
    let tables = db.prepare(
      'SELECT * FROM loot_tables WHERE campaign_id = ? ORDER BY category ASC, name ASC'
    ).all(campaignId) as any[]

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
    db.prepare('UPDATE articles SET loot_table_id = NULL WHERE loot_table_id = ?').run(id)
    db.prepare('UPDATE pois SET loot_table_id = NULL WHERE loot_table_id = ?').run(id)
    const { affected } = db.prepare('SELECT COUNT(*) as affected FROM articles WHERE loot_table_id = ?').get(id) as { affected: number }
    db.prepare('DELETE FROM loot_tables WHERE id = ?').run(id)
    return { success: true, affected }
  })

  ipcMain.handle('loot-tables:roll', (_e, tableId: number | null, extraItemsJson: string) => {
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

    const result = allItems.filter(item => {
      if (item.chance >= 100) return true
      return Math.random() * 100 <= item.chance
    })

    return result
  })

  ipcMain.handle('loot-tables:reset-defaults', (_e, campaignId: number) => {
    db.prepare('DELETE FROM loot_tables WHERE campaign_id = ? AND is_default = 1').run(campaignId)
    return seedDefaultTables(campaignId)
  })

  // ── Relation Webs ─────────────────────────────────────────────────────────────

  ipcMain.handle('relation-webs:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT w.*,
        (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w
      WHERE w.campaign_id = ?
      ORDER BY w.updated_at DESC
    `).all(campaignId)
  })

  ipcMain.handle('relation-webs:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO relation_webs (campaign_id, name, description, template, ranks, article_id)
      VALUES (@campaign_id, @name, @description, @template, @ranks, @article_id)
    `).run({ description: '', template: 'custom', ranks: '[]', article_id: null, ...data })
    const webId = result.lastInsertRowid as number
    // Mirror the primary link into the join table so it appears in the rail.
    if (data.article_id) {
      db.prepare(`INSERT OR IGNORE INTO relation_web_articles (web_id, article_id) VALUES (?, ?)`)
        .run(webId, data.article_id)
    }
    return db.prepare(`
      SELECT w.*, 0 AS node_count FROM relation_webs w WHERE w.id = ?
    `).get(webId)
  })

  ipcMain.handle('relation-webs:update', (_e, id: number, data: any) => {
    const allowed = ['name', 'description', 'template', 'ranks']
    const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)))
    if (Object.keys(clean).length === 0) {
      return db.prepare(`
        SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
        FROM relation_webs w WHERE w.id = ?
      `).get(id)
    }
    const fields = Object.keys(clean).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE relation_webs SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...clean, id })
    return db.prepare(`
      SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w WHERE w.id = ?
    `).get(id)
  })

  ipcMain.handle('relation-webs:delete', (_e, id: number) => {
    db.prepare('DELETE FROM relation_webs WHERE id = ?').run(id)
  })

  ipcMain.handle('relation-webs:get-data', (_e, webId: number) => {
    const nodes = db.prepare(`
      SELECT n.id, n.web_id, n.article_id, n.label, n.node_type, n.rank_id, n.pos_x, n.pos_y,
             a.title AS article_title, a.article_type, a.tracks
      FROM relation_nodes n
      LEFT JOIN articles a ON a.id = n.article_id
      WHERE n.web_id = ?
      ORDER BY n.id
    `).all(webId) as any[]

    const nodesWithVitality = nodes.map(n => {
      let vitality: string | null = null
      if (n.tracks) {
        try {
          const tracks = JSON.parse(n.tracks)
          vitality = tracks.Vitality || null
        } catch {}
      }
      return { ...n, vitality }
    })

    const edges = db.prepare(`
      SELECT * FROM relation_edges WHERE web_id = ? ORDER BY id
    `).all(webId)

    return { nodes: nodesWithVitality, edges }
  })

  // ── Relation Nodes ────────────────────────────────────────────────────────────

  ipcMain.handle('relation-nodes:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO relation_nodes (web_id, article_id, label, node_type, rank_id, pos_x, pos_y)
      VALUES (@web_id, @article_id, @label, @node_type, @rank_id, @pos_x, @pos_y)
    `).run({ article_id: null, node_type: 'person', rank_id: '', pos_x: 100, pos_y: 100, ...data })

    db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(data.web_id)

    const node = db.prepare(`
      SELECT n.id, n.web_id, n.article_id, n.label, n.node_type, n.rank_id, n.pos_x, n.pos_y,
             a.title AS article_title, a.article_type, a.tracks
      FROM relation_nodes n
      LEFT JOIN articles a ON a.id = n.article_id
      WHERE n.id = ?
    `).get(result.lastInsertRowid) as any

    let vitality: string | null = null
    if (node?.tracks) {
      try { vitality = JSON.parse(node.tracks).Vitality || null } catch {}
    }
    const { tracks: _t, ...rest } = node ?? {}
    return { ...rest, vitality }
  })

  ipcMain.handle('relation-nodes:update', (_e, id: number, data: any) => {
    const allowed = ['article_id', 'label', 'node_type', 'rank_id', 'pos_x', 'pos_y']
    const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)))
    if (Object.keys(clean).length === 0) return null
    const fields = Object.keys(clean).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE relation_nodes SET ${fields} WHERE id = @id`).run({ ...clean, id })

    const node = db.prepare(`
      SELECT n.id, n.web_id, n.article_id, n.label, n.node_type, n.rank_id, n.pos_x, n.pos_y,
             a.title AS article_title, a.article_type, a.tracks
      FROM relation_nodes n
      LEFT JOIN articles a ON a.id = n.article_id
      WHERE n.id = ?
    `).get(id) as any

    if (node?.web_id) {
      db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(node.web_id)
    }

    let vitality: string | null = null
    if (node?.tracks) {
      try { vitality = JSON.parse(node.tracks).Vitality || null } catch {}
    }
    const { tracks: _t, ...rest } = node ?? {}
    return { ...rest, vitality }
  })

  ipcMain.handle('relation-nodes:delete', (_e, id: number) => {
    const node = db.prepare('SELECT web_id FROM relation_nodes WHERE id = ?').get(id) as any
    db.prepare('DELETE FROM relation_edges WHERE from_node_id = ? OR to_node_id = ?').run(id, id)
    db.prepare('DELETE FROM relation_nodes WHERE id = ?').run(id)
    // Refresh the linked article's Leader track in case the deleted node was a
    // leader (no-op for non-hierarchy webs). Family relations are computed live.
    if (node?.web_id) syncHierarchyForWeb(node.web_id)
  })

  // ── Relation Edges ────────────────────────────────────────────────────────────

  ipcMain.handle('relation-edges:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO relation_edges (web_id, from_node_id, to_node_id, label_from, label_to, edge_type, from_handle, to_handle)
      VALUES (@web_id, @from_node_id, @to_node_id, @label_from, @label_to, @edge_type, @from_handle, @to_handle)
    `).run({ label_from: '', label_to: '', edge_type: 'standard', from_handle: '', to_handle: '', ...data })
    db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(data.web_id)
    return db.prepare('SELECT * FROM relation_edges WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('relation-edges:update', (_e, id: number, data: any) => {
    const allowed = ['label_from', 'label_to', 'edge_type', 'from_node_id', 'to_node_id']
    const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)))
    if (Object.keys(clean).length === 0) return db.prepare('SELECT * FROM relation_edges WHERE id = ?').get(id)
    const fields = Object.keys(clean).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE relation_edges SET ${fields} WHERE id = @id`).run({ ...clean, id })
    return db.prepare('SELECT * FROM relation_edges WHERE id = ?').get(id)
  })

  ipcMain.handle('relation-edges:delete', (_e, id: number) => {
    db.prepare('DELETE FROM relation_edges WHERE id = ?').run(id)
  })

  ipcMain.handle('relation-edges:get-for-article', (_e, articleId: number, campaignId: number) => {
    let edgeRowId = 0

    // 1) Standard edges (non-family-tree webs)
    const standardRows = (db.prepare(`
      SELECT
        e.id AS edge_id,
        e.label_from, e.label_to,
        e.from_node_id, e.to_node_id,
        w.id AS web_id, w.name AS web_name, w.template AS web_template,
        fn.label AS from_node_label, fn.article_id AS from_article_id,
        tn.label AS to_node_label, tn.article_id AS to_article_id,
        fa.title AS from_article_title, fa.tracks AS from_tracks,
        ta.title AS to_article_title, ta.tracks AS to_tracks
      FROM relation_edges e
      JOIN relation_nodes fn ON fn.id = e.from_node_id
      JOIN relation_nodes tn ON tn.id = e.to_node_id
      JOIN relation_webs w ON w.id = e.web_id
      LEFT JOIN articles fa ON fa.id = fn.article_id
      LEFT JOIN articles ta ON ta.id = tn.article_id
      WHERE w.campaign_id = ?
        AND (fn.article_id = ? OR tn.article_id = ?)
        AND (e.edge_type = 'standard' OR e.edge_type IS NULL)
      ORDER BY w.name, e.id
    `).all(campaignId, articleId, articleId) as any[]).map(row => {
      let fromVitality: string | null = null
      let toVitality: string | null = null
      try { fromVitality = JSON.parse(row.from_tracks || '{}').Vitality || null } catch {}
      try { toVitality = JSON.parse(row.to_tracks || '{}').Vitality || null } catch {}
      const { from_tracks, to_tracks, web_template, ...rest } = row
      return { ...rest, from_vitality: fromVitality, to_vitality: toVitality }
    })

    // 2) Derived family-tree relations — computed live from the web graph so
    //    labels, names, and vitality always reflect the current data (no stale
    //    cache, and partner roles read from the current person's perspective).
    const familyNodes = db.prepare(`
      SELECT n.id, n.web_id, w.name AS web_name
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE n.article_id = ? AND w.campaign_id = ? AND w.template = 'family_tree'
    `).all(articleId, campaignId) as { id: number; web_id: number; web_name: string }[]

    const webGraphCache: Record<number, { nodes: any[]; edges: any[]; ranks: any[] }> = {}
    const loadWebGraph = (webId: number) => {
      if (!webGraphCache[webId]) {
        const wn = db.prepare(`
          SELECT n.id, n.article_id, n.node_type, n.rank_id, n.label, a.title AS article_title, a.tracks
          FROM relation_nodes n
          LEFT JOIN articles a ON a.id = n.article_id
          WHERE n.web_id = ?
        `).all(webId) as any[]
        const nodes = wn.map(n => {
          let vitality: string | null = null
          try { vitality = JSON.parse(n.tracks || '{}').Vitality || null } catch {}
          return { ...n, vitality }
        })
        const edges = db.prepare('SELECT * FROM relation_edges WHERE web_id = ?').all(webId) as any[]
        const webRow = db.prepare('SELECT ranks FROM relation_webs WHERE id = ?').get(webId) as any
        let ranks: any[] = []
        try { ranks = JSON.parse(webRow?.ranks || '[]') } catch {}
        webGraphCache[webId] = { nodes, edges, ranks }
      }
      return webGraphCache[webId]
    }

    const derivedRows: any[] = []
    for (const fn of familyNodes) {
      const { nodes, edges } = loadWebGraph(fn.web_id)
      const derived = deriveRelationsForNode(fn.id, nodes, edges, fn.web_name, fn.web_id)
      const push = (entries: any[], roleFallback: string) => {
        for (const e of entries) {
          const role = (e.role || roleFallback || '').trim()
          derivedRows.push({
            // Synthesise an edge_id that won't collide with real edge ids — negative
            edge_id: --edgeRowId,
            web_id: fn.web_id,
            web_name: fn.web_name,
            // We render from the perspective of the current article, so put it on `from`
            from_node_id: 0,
            to_node_id: e.nodeId ?? 0,
            from_article_id: articleId,
            to_article_id: e.articleId ?? null,
            from_article_title: null,
            to_article_title: e.articleId ? e.name : null,
            from_node_label: '',
            to_node_label: e.name || '',
            from_vitality: null,
            to_vitality: e.vitality ?? null,
            label_from: '',
            label_to: role,
          })
        }
      }

      push(derived.parents,  'parent')
      push(derived.partners, 'partner')
      push(derived.children, 'child')
      push(derived.siblings, 'sibling')
    }

    // 3) Derived hierarchy relations — rank, reports-to (superiors), oversees
    //    (direct reports), computed live from the web graph.
    const hierarchyNodes = db.prepare(`
      SELECT n.id, n.web_id, w.name AS web_name
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE n.article_id = ? AND w.campaign_id = ? AND w.template = 'org_hierarchy'
    `).all(articleId, campaignId) as { id: number; web_id: number; web_name: string }[]

    for (const hn of hierarchyNodes) {
      const { nodes, edges, ranks } = loadWebGraph(hn.web_id)
      const d = deriveHierarchyForNode(hn.id, nodes, edges, ranks)
      const pushH = (entries: any[], role: string) => {
        for (const e of entries) {
          derivedRows.push({
            edge_id: --edgeRowId,
            web_id: hn.web_id,
            web_name: hn.web_name,
            from_node_id: 0,
            to_node_id: e.nodeId ?? 0,
            from_article_id: articleId,
            to_article_id: e.articleId ?? null,
            from_article_title: null,
            to_article_title: e.articleId ? e.name : null,
            from_node_label: '',
            to_node_label: e.name || '',
            from_vitality: null,
            to_vitality: e.vitality ?? null,
            label_from: '',
            label_to: role,
          })
        }
      }
      // Pushed in reverse of desired display order — rows sort by ascending
      // (most-negative) edge_id, so the last pushed shows first: Rank, Reports to, Oversees.
      pushH(d.reports, 'oversees')
      pushH(d.superiors, 'reports to')
      if (d.rankName) {
        derivedRows.push({
          edge_id: --edgeRowId,
          web_id: hn.web_id,
          web_name: hn.web_name,
          from_node_id: 0, to_node_id: 0,
          from_article_id: articleId, to_article_id: null,
          from_article_title: null, to_article_title: null,
          from_node_label: '', to_node_label: d.rankName,
          from_vitality: null, to_vitality: null,
          label_from: '', label_to: 'rank',
          is_rank: true,
        })
      }
    }

    return [...standardRows, ...derivedRows].sort((a, b) =>
      a.web_name.localeCompare(b.web_name) || a.edge_id - b.edge_id
    )
  })

  // ── Derived relations sync ─────────────────────────────────────────────────────

  ipcMain.handle('relation-webs:sync-derived-relations', (_e, webId: number) => {
    syncHierarchyForWeb(webId)
  })

  // The hierarchy web (if any) linked to a given article.
  ipcMain.handle('relation-webs:get-for-article', (_e, articleId: number) => {
    return db.prepare(`
      SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w
      WHERE w.article_id = ? AND w.template = 'org_hierarchy'
      ORDER BY w.id LIMIT 1
    `).get(articleId) || null
  })

  // All webs whose article_id points at this article (one-to-one).
  ipcMain.handle('relation-webs:list-for-article', (_e, articleId: number) => {
    return db.prepare(`
      SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w
      WHERE w.article_id = ?
      ORDER BY w.updated_at DESC
    `).all(articleId)
  })

  // Every web an article appears in as a node (membership tags).
  ipcMain.handle('relation-webs:list-for-member', (_e, articleId: number) => {
    return db.prepare(`
      SELECT DISTINCT w.id, w.name, w.template
      FROM relation_webs w
      WHERE w.id IN (SELECT web_id FROM relation_nodes WHERE article_id = ?)
      ORDER BY w.name COLLATE NOCASE
    `).all(articleId)
  })

  // Single article linked to this web (one-to-one). Returns null when unset.
  ipcMain.handle('relation-webs:get-linked-articles', (_e, webId: number) => {
    return db.prepare(`
      SELECT a.id, a.title, a.article_type
      FROM relation_webs w
      JOIN articles a ON a.id = w.article_id
      WHERE w.id = ? AND w.article_id IS NOT NULL
    `).get(webId) ?? null
  })

  // Set the one linked article, replacing any previous link.
  ipcMain.handle('relation-webs:link-article', (_e, webId: number, articleId: number) => {
    db.prepare(`UPDATE relation_webs SET article_id = ? WHERE id = ?`).run(articleId, webId)
  })

  // Remove the linked article.
  ipcMain.handle('relation-webs:unlink-article', (_e, webId: number) => {
    db.prepare(`UPDATE relation_webs SET article_id = NULL WHERE id = ?`).run(webId)
  })

  // Count article-backed members of an org/faction/religion: distinct character
  // or PC articles that appear as a node in any web linked to this article.
  ipcMain.handle('articles:member-count', (_e, articleId: number) => {
    const row = db.prepare(`
      SELECT COUNT(DISTINCT a.id) AS c
      FROM relation_webs w
      JOIN relation_nodes n ON n.web_id = w.id
      JOIN articles a       ON a.id = n.article_id
      WHERE w.article_id = ?
        AND a.article_type IN ('character', 'playerCharacter')
    `).get(articleId) as any
    return row?.c || 0
  })

  // Derived affiliations for a character/PC: the faction/org/religion articles
  // that own a web this character is a node in. Read-only — webs are the source
  // of truth, so the Faction/Religion fields are computed, never stored.
  ipcMain.handle('articles:get-affiliations', (_e, articleId: number) => {
    return db.prepare(`
      SELECT DISTINCT a.id, a.title, a.article_type
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      JOIN articles a      ON a.id = w.article_id
      WHERE n.article_id = ?
        AND a.article_type IN ('faction', 'organization', 'religion')
      ORDER BY a.article_type, a.title COLLATE NOCASE
    `).all(articleId)
  })

  // Geographic containment for a location: its ancestry chain (root-first) walked
  // up the "Within" parent-location track, plus its direct child locations.
  ipcMain.handle('articles:get-geography', (_e, articleId: number) => {
    const art = db.prepare(
      `SELECT id, title, campaign_id, tracks FROM articles WHERE id = ?`
    ).get(articleId) as any
    if (!art) return { ancestors: [], children: [] }

    const findParent = db.prepare(`
      SELECT id, title, tracks FROM articles
      WHERE campaign_id = ? AND article_type = 'location' AND title = ? COLLATE NOCASE
      LIMIT 1
    `)
    const withinOf = (tracks: string): string => {
      try { return (JSON.parse(tracks || '{}').Within || '').trim() } catch { return '' }
    }

    // Walk up the parent chain (cycle-guarded, depth-capped), root-first.
    const ancestors: { id: number; title: string }[] = []
    const seen = new Set<number>([art.id])
    let tracks: string = art.tracks
    for (let i = 0; i < 20; i++) {
      const within = withinOf(tracks)
      if (!within) break
      const parent = findParent.get(art.campaign_id, within) as any
      if (!parent || seen.has(parent.id)) break
      seen.add(parent.id)
      ancestors.unshift({ id: parent.id, title: parent.title })
      tracks = parent.tracks
    }

    const children = db.prepare(`
      SELECT id, title FROM articles
      WHERE campaign_id = ? AND article_type = 'location'
        AND json_extract(tracks, '$.Within') = ? COLLATE NOCASE
      ORDER BY title COLLATE NOCASE
    `).all(art.campaign_id, art.title)

    return { ancestors, children }
  })

  // ── Sound Boards ──────────────────────────────────────────────────────────────

  ipcMain.handle('soundboards:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT sb.*, COUNT(s.id) AS sound_count
      FROM sound_boards sb
      LEFT JOIN sounds s ON s.board_id = sb.id
      WHERE sb.campaign_id = ?
      GROUP BY sb.id
      ORDER BY sb.sort_order ASC, sb.created_at ASC
    `).all(campaignId)
  })

  ipcMain.handle('soundboards:create', (_e, data: { campaign_id: number; name: string }) => {
    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sound_boards WHERE campaign_id = ?').get(data.campaign_id) as { m: number }
    const result = db.prepare(`
      INSERT INTO sound_boards (campaign_id, name, sort_order)
      VALUES (@campaign_id, @name, @sort_order)
    `).run({ ...data, sort_order: maxRow.m + 1 })
    return db.prepare('SELECT * FROM sound_boards WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('soundboards:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE sound_boards SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM sound_boards WHERE id = ?').get(id)
  })

  ipcMain.handle('soundboards:delete', (_e, id: number) => {
    db.prepare('DELETE FROM sound_boards WHERE id = ?').run(id)
  })

  // ── Sounds ────────────────────────────────────────────────────────────────────

  ipcMain.handle('sounds:get-all', (_e, boardId: number) => {
    return db.prepare(`
      SELECT * FROM sounds WHERE board_id = ? ORDER BY sort_order ASC, created_at ASC
    `).all(boardId)
  })

  ipcMain.handle('sounds:create', (_e, data: { board_id: number; name: string; category: string; file_path: string; hotkey: string; volume: number; loop?: number }) => {
    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sounds WHERE board_id = ?').get(data.board_id) as { m: number }
    // Default loop by category when not explicitly provided: effects are one-shot.
    const loop = data.loop != null ? data.loop : (data.category === 'effect' ? 0 : 1)
    const result = db.prepare(`
      INSERT INTO sounds (board_id, name, category, file_path, hotkey, volume, loop, sort_order)
      VALUES (@board_id, @name, @category, @file_path, @hotkey, @volume, @loop, @sort_order)
    `).run({ ...data, loop, sort_order: maxRow.m + 1 })
    return db.prepare('SELECT * FROM sounds WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('sounds:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE sounds SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM sounds WHERE id = ?').get(id)
  })

  ipcMain.handle('sounds:delete', (_e, id: number) => {
    db.prepare('DELETE FROM sounds WHERE id = ?').run(id)
  })

  ipcMain.handle('soundboards:get-defaults', () => {
    return scanDefaultSounds()
  })

  ipcMain.handle('sounds:select-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select audio file',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'webm'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null

    const srcPath = result.filePaths[0]
    const sndDir  = path.join(app.getPath('userData'), 'sounds')
    fs.mkdirSync(sndDir, { recursive: true })

    // Already inside sounds dir — reuse without copying
    if (path.normalize(srcPath).startsWith(path.normalize(sndDir) + path.sep)) {
      return 'sounds/' + path.basename(srcPath)
    }

    // Copy to sounds dir, avoiding name collisions
    const ext  = path.extname(srcPath)
    const base = path.basename(srcPath, ext)
    let destName = base + ext
    if (fs.existsSync(path.join(sndDir, destName))) {
      destName = `${base}_${Date.now()}${ext}`
    }
    fs.copyFileSync(srcPath, path.join(sndDir, destName))
    return `sounds/${destName}`
  })
}

app.whenReady().then(() => {
  createWindow()
  if (mainWindow) initUpdater(mainWindow)
  const { imagesPath } = initDatabase()
  registerIPC(imagesPath)
  // Reconcile each campaign's auto territory web on launch (picks up edge-style
  // changes and any out-of-band edits made while the app was closed).
  try {
    for (const c of db.prepare('SELECT id FROM campaigns').all() as { id: number }[]) {
      syncTerritoryWeb(c.id)
    }
  } catch (e) { console.error('territory reconcile on launch failed:', e) }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})