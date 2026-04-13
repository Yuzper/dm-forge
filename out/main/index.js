"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
let db;
function initDatabase() {
  const userDataPath = electron.app.getPath("userData");
  const dbPath = path.join(userDataPath, "dmforge.db");
  const imagesPath = path.join(userDataPath, "images");
  if (!fs.existsSync(imagesPath)) fs.mkdirSync(imagesPath, { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
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
  `);
  const articleCols = db.pragma("table_info(articles)");
  if (!articleCols.some((c) => c.name === "tracks")) {
    db.exec(`ALTER TABLE articles ADD COLUMN tracks TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!articleCols.some((c) => c.name === "statblock")) {
    db.exec(`ALTER TABLE articles ADD COLUMN statblock TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!articleCols.some((c) => c.name === "loot_table")) {
    db.exec(`ALTER TABLE articles ADD COLUMN loot_table TEXT NOT NULL DEFAULT '{"name":"Loot","items":[]}'`);
  }
  const poiCols = db.pragma("table_info(pois)");
  if (!poiCols.some((c) => c.name === "loot_table")) {
    db.exec(`ALTER TABLE pois ADD COLUMN loot_table TEXT NOT NULL DEFAULT '{"name":"Loot","items":[]}'`);
  }
  const creatureCols = db.pragma("table_info(combat_creatures)");
  if (!creatureCols.some((c) => c.name === "loot_result")) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN loot_result TEXT`);
  }
  if (!creatureCols.some((c) => c.name === "resources")) {
    db.exec(`ALTER TABLE combat_creatures ADD COLUMN resources TEXT NOT NULL DEFAULT '[]'`);
  }
  const sessionCols = db.pragma("table_info(sessions)");
  if (!sessionCols.some((c) => c.name === "session_sub")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN session_sub TEXT NOT NULL DEFAULT ''`);
  }
  if (!sessionCols.some((c) => c.name === "arc_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN arc_id INTEGER`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_unique
    ON sessions(campaign_id, session_number, session_sub)
  `);
  return { userDataPath, imagesPath };
}
function processAndSaveImage(srcPath, destDir, baseName, maxWidth, quality = 85) {
  const img = electron.nativeImage.createFromPath(srcPath);
  if (img.isEmpty()) {
    const ext = path.extname(srcPath);
    const fallbackName = baseName + ext;
    fs.copyFileSync(srcPath, path.join(destDir, fallbackName));
    return fallbackName;
  }
  const { width } = img.getSize();
  const processed = width > maxWidth ? img.resize({ width: maxWidth }) : img;
  const outName = baseName + ".jpg";
  fs.writeFileSync(path.join(destDir, outName), processed.toJPEG(quality));
  return outName;
}
function extractInlineImagePaths(contentJson, userDataPath) {
  try {
    let walk = function(node) {
      if (node?.type === "image" && node.attrs?.src) {
        const src = node.attrs.src;
        const filePath = src.startsWith("file://") ? src.slice(7) : src;
        if (filePath.startsWith(imagesDir)) found.push(filePath);
      }
      if (Array.isArray(node?.content)) node.content.forEach(walk);
    };
    const doc = JSON.parse(contentJson);
    const imagesDir = path.join(userDataPath, "images");
    const found = [];
    walk(doc);
    return found;
  } catch {
    return [];
  }
}
function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
  }
}
function safeUnlinkRelative(relativePath, userDataPath) {
  if (!relativePath) return;
  safeUnlink(path.join(userDataPath, relativePath));
}
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d0b09",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: true
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function registerIPC(imagesPath) {
  electron.ipcMain.handle("campaigns:get-all", () => {
    return db.prepare(`
      SELECT c.*, COUNT(s.id) as session_count
      FROM campaigns c
      LEFT JOIN sessions s ON s.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `).all();
  });
  electron.ipcMain.handle("campaigns:get", (_e, id) => {
    return db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) ?? null;
  });
  electron.ipcMain.handle("campaigns:create", (_e, data) => {
    const result = db.prepare(`
      INSERT INTO campaigns (name, description, system, cover_image)
      VALUES (@name, @description, @system, @cover_image)
    `).run({ cover_image: null, ...data });
    return db.prepare("SELECT * FROM campaigns WHERE id = ?").get(result.lastInsertRowid);
  });
  electron.ipcMain.handle("campaigns:update", (_e, id, data) => {
    const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE campaigns SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id });
    return db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id);
  });
  electron.ipcMain.handle("campaigns:delete", (_e, id) => {
    const userDataPath = electron.app.getPath("userData");
    const maps = db.prepare(`
      SELECT m.image_path FROM maps m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.campaign_id = ?
    `).all(id);
    const articles = db.prepare(
      "SELECT content, cover_image, portrait_image FROM articles WHERE campaign_id = ?"
    ).all(id);
    db.prepare("DELETE FROM campaigns WHERE id = ?").run(id);
    for (const map of maps) safeUnlinkRelative(map.image_path, userDataPath);
    for (const article of articles) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink);
      safeUnlinkRelative(article.cover_image, userDataPath);
      safeUnlinkRelative(article.portrait_image, userDataPath);
    }
  });
  electron.ipcMain.handle("sessions:get-all", (_e, campaignId) => {
    return db.prepare(`
      SELECT s.*, COUNT(m.id) as map_count
      FROM sessions s
      LEFT JOIN maps m ON m.session_id = s.id
      WHERE s.campaign_id = ?
      GROUP BY s.id
      ORDER BY s.session_number ASC, s.session_sub ASC
    `).all(campaignId);
  });
  electron.ipcMain.handle("sessions:create", (_e, data) => {
    const result = db.prepare(`
      INSERT INTO sessions (campaign_id, name, session_number, session_sub, arc_id, date, notes)
      VALUES (@campaign_id, @name, @session_number, @session_sub, @arc_id, @date, @notes)
    `).run({ date: null, notes: "", session_sub: "", arc_id: null, ...data });
    return db.prepare("SELECT * FROM sessions WHERE id = ?").get(result.lastInsertRowid);
  });
  electron.ipcMain.handle("sessions:update", (_e, id, data) => {
    const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE sessions SET ${fields} WHERE id = @id`).run({ ...data, id });
    return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  });
  electron.ipcMain.handle("sessions:delete", (_e, id) => {
    const userDataPath = electron.app.getPath("userData");
    const maps = db.prepare("SELECT image_path FROM maps WHERE session_id = ?").all(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    for (const map of maps) safeUnlinkRelative(map.image_path, userDataPath);
  });
  electron.ipcMain.handle("arcs:get-all", (_e, campaignId) => {
    let arcs = db.prepare(
      "SELECT * FROM arcs WHERE campaign_id = ? ORDER BY name ASC"
    ).all(campaignId);
    if (arcs.length === 0) {
      const result = db.prepare(`
        INSERT INTO arcs (campaign_id, name, color, is_default)
        VALUES (?, 'Main Story', '#c8a84b', 1)
      `).run(campaignId);
      arcs = [db.prepare("SELECT * FROM arcs WHERE id = ?").get(result.lastInsertRowid)];
    }
    return arcs.map((a) => ({ ...a, is_default: a.is_default === 1 }));
  });
  electron.ipcMain.handle("arcs:create", (_e, data) => {
    const result = db.prepare(`
      INSERT INTO arcs (campaign_id, name, color, is_default)
      VALUES (@campaign_id, @name, @color, 0)
    `).run({ color: "#c8a84b", ...data });
    const arc = db.prepare("SELECT * FROM arcs WHERE id = ?").get(result.lastInsertRowid);
    return { ...arc, is_default: false };
  });
  electron.ipcMain.handle("arcs:update", (_e, id, data) => {
    const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE arcs SET ${fields} WHERE id = @id`).run({ ...data, id });
    const arc = db.prepare("SELECT * FROM arcs WHERE id = ?").get(id);
    return { ...arc, is_default: arc.is_default === 1 };
  });
  electron.ipcMain.handle("arcs:delete", (_e, id) => {
    const arc = db.prepare("SELECT * FROM arcs WHERE id = ?").get(id);
    if (!arc) return { success: false, error: "Arc not found" };
    if (arc.is_default) return { success: false, error: "Cannot delete the default arc" };
    const defaultArc = db.prepare(
      "SELECT id FROM arcs WHERE campaign_id = ? AND is_default = 1"
    ).get(arc.campaign_id);
    if (defaultArc) {
      db.prepare("UPDATE sessions SET arc_id = ? WHERE arc_id = ?").run(defaultArc.id, id);
    }
    db.prepare("DELETE FROM arcs WHERE id = ?").run(id);
    return { success: true };
  });
  electron.ipcMain.handle("maps:get-all", (_e, sessionId) => {
    return db.prepare(`
      SELECT m.*, COUNT(p.id) as poi_count
      FROM maps m
      LEFT JOIN pois p ON p.map_id = m.id
      WHERE m.session_id = ?
      GROUP BY m.id
      ORDER BY m.created_at ASC
    `).all(sessionId);
  });
  electron.ipcMain.handle("maps:create", (_e, data) => {
    const result = db.prepare(
      "INSERT INTO maps (session_id, name, image_path) VALUES (@session_id, @name, @image_path)"
    ).run(data);
    return db.prepare("SELECT * FROM maps WHERE id = ?").get(result.lastInsertRowid);
  });
  electron.ipcMain.handle("maps:update", (_e, id, data) => {
    const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE maps SET ${fields} WHERE id = @id`).run({ ...data, id });
    return db.prepare("SELECT * FROM maps WHERE id = ?").get(id);
  });
  electron.ipcMain.handle("maps:delete", (_e, id) => {
    const userDataPath = electron.app.getPath("userData");
    const map = db.prepare("SELECT image_path FROM maps WHERE id = ?").get(id);
    db.prepare("DELETE FROM maps WHERE id = ?").run(id);
    if (map?.image_path) safeUnlinkRelative(map.image_path, userDataPath);
  });
  electron.ipcMain.handle("maps:import-image", async (_e, sessionId) => {
    if (!mainWindow) return null;
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      title: "Select Map Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const srcPath = result.filePaths[0];
    const baseName = `map_${sessionId}_${Date.now()}`;
    const filename = processAndSaveImage(srcPath, imagesPath, baseName, 4e3, 85);
    const name = path.basename(srcPath, path.extname(srcPath));
    return { path: `images/${filename}`, name };
  });
  electron.ipcMain.handle("pois:get-all", (_e, mapId) => {
    return db.prepare("SELECT * FROM pois WHERE map_id = ? ORDER BY created_at ASC").all(mapId);
  });
  electron.ipcMain.handle("pois:create", (_e, data) => {
    const result = db.prepare(`
      INSERT INTO pois (map_id, label, x, y, content, poi_type, color)
      VALUES (@map_id, @label, @x, @y, @content, @poi_type, @color)
    `).run({
      content: '{"type":"doc","content":[]}',
      poi_type: "location",
      color: "#c8a84b",
      ...data
    });
    return db.prepare("SELECT * FROM pois WHERE id = ?").get(result.lastInsertRowid);
  });
  electron.ipcMain.handle("pois:update", (_e, id, data) => {
    const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE pois SET ${fields} WHERE id = @id`).run({ ...data, id });
    return db.prepare("SELECT * FROM pois WHERE id = ?").get(id);
  });
  electron.ipcMain.handle("pois:delete", (_e, id) => {
    const userDataPath = electron.app.getPath("userData");
    const poi = db.prepare("SELECT content FROM pois WHERE id = ?").get(id);
    db.prepare("DELETE FROM pois WHERE id = ?").run(id);
    if (poi?.content) extractInlineImagePaths(poi.content, userDataPath).forEach(safeUnlink);
  });
  electron.ipcMain.handle("articles:get-all", (_e, filter) => {
    let query = "SELECT * FROM articles WHERE 1=1";
    const params = [];
    if (filter?.campaignId) {
      query += " AND campaign_id = ?";
      params.push(filter.campaignId);
    }
    if (filter?.type && filter.type !== "all") {
      query += " AND article_type = ?";
      params.push(filter.type);
    }
    if (filter?.search) {
      query += " AND (title LIKE ? OR content LIKE ?)";
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }
    query += " ORDER BY title ASC";
    return db.prepare(query).all(...params);
  });
  electron.ipcMain.handle("articles:get-list", (_e, filter) => {
    let query = `
      SELECT id, campaign_id, title, article_type, tags, cover_image, tracks, loot_table, created_at, updated_at
      FROM articles WHERE 1=1
    `;
    const params = [];
    if (filter?.campaignId) {
      query += " AND campaign_id = ?";
      params.push(filter.campaignId);
    }
    if (filter?.type && filter.type !== "all") {
      query += " AND article_type = ?";
      params.push(filter.type);
    }
    if (filter?.tag) {
      query += " AND tags LIKE ?";
      params.push(`%"${filter.tag}"%`);
    }
    if (filter?.search) {
      const byTitle = filter.searchTitle !== false;
      const byTags = filter.searchTags !== false;
      const clauses = [
        ...byTitle ? ["title LIKE ?"] : [],
        ...byTags ? ["tags LIKE ?"] : []
      ];
      if (clauses.length) {
        query += ` AND (${clauses.join(" OR ")})`;
        clauses.forEach(() => params.push(`%${filter.search}%`));
      }
    }
    query += " ORDER BY title ASC";
    return db.prepare(query).all(...params);
  });
  electron.ipcMain.handle("articles:get", (_e, id) => {
    return db.prepare("SELECT * FROM articles WHERE id = ?").get(id) ?? null;
  });
  electron.ipcMain.handle("articles:get-by-title", (_e, title, campaignId) => {
    return db.prepare(
      "SELECT * FROM articles WHERE title = ? COLLATE NOCASE AND campaign_id = ?"
    ).get(title, campaignId) ?? null;
  });
  electron.ipcMain.handle("articles:get-backlinks", (_e, title, campaignId) => {
    return db.prepare(`
      SELECT id, campaign_id, title, article_type, tags, tracks, updated_at
      FROM articles
      WHERE campaign_id = ? AND content LIKE ? AND title != ?
      ORDER BY title ASC
    `).all(campaignId, `%"title":"${title}"%`, title);
  });
  electron.ipcMain.handle("articles:create", (_e, data) => {
    const result = db.prepare(`
      INSERT INTO articles (campaign_id, title, content, article_type, tags, tracks, statblock, loot_table)
      VALUES (@campaign_id, @title, @content, @article_type, @tags, @tracks, @statblock, @loot_table)
    `).run({
      content: '{"type":"doc","content":[]}',
      article_type: "location",
      tags: "[]",
      tracks: "{}",
      statblock: "{}",
      loot_table: '{"name":"Loot","items":[]}',
      ...data
    });
    return db.prepare("SELECT * FROM articles WHERE id = ?").get(result.lastInsertRowid);
  });
  electron.ipcMain.handle("articles:update", (_e, id, data) => {
    const userDataPath = electron.app.getPath("userData");
    const old = db.prepare(
      "SELECT content, cover_image, portrait_image FROM articles WHERE id = ?"
    ).get(id);
    const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE articles SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id });
    if (old) {
      if (old.cover_image && data.cover_image !== void 0 && data.cover_image !== old.cover_image) {
        safeUnlinkRelative(old.cover_image, userDataPath);
      }
      if (old.portrait_image && data.portrait_image !== void 0 && data.portrait_image !== old.portrait_image) {
        safeUnlinkRelative(old.portrait_image, userDataPath);
      }
      if (data.content !== void 0 && data.content !== old.content) {
        const oldPaths = new Set(extractInlineImagePaths(old.content, userDataPath));
        const newPaths = new Set(extractInlineImagePaths(data.content, userDataPath));
        for (const p of oldPaths) {
          if (!newPaths.has(p)) safeUnlink(p);
        }
      }
    }
    return db.prepare("SELECT * FROM articles WHERE id = ?").get(id);
  });
  electron.ipcMain.handle("articles:delete", (_e, id) => {
    const userDataPath = electron.app.getPath("userData");
    const article = db.prepare(
      "SELECT content, cover_image, portrait_image FROM articles WHERE id = ?"
    ).get(id);
    db.prepare("DELETE FROM articles WHERE id = ?").run(id);
    if (article) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink);
      safeUnlinkRelative(article.cover_image, userDataPath);
      safeUnlinkRelative(article.portrait_image, userDataPath);
    }
  });
  electron.ipcMain.handle("combat:get-encounter", (_e, poiId) => {
    let enc = db.prepare("SELECT * FROM combat_encounters WHERE poi_id = ?").get(poiId);
    if (!enc) {
      const result = db.prepare("INSERT INTO combat_encounters (poi_id) VALUES (?)").run(poiId);
      enc = db.prepare("SELECT * FROM combat_encounters WHERE id = ?").get(result.lastInsertRowid);
    }
    return enc;
  });
  electron.ipcMain.handle("combat:get-creatures", (_e, encounterId) => {
    const rows = db.prepare(`
      SELECT cc.*, a.title, a.statblock, a.loot_table
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.encounter_id = ?
      ORDER BY
        CASE WHEN cc.initiative IS NULL THEN 1 ELSE 0 END,
        cc.initiative DESC,
        cc.instance_number ASC
    `).all(encounterId);
    return rows.map((r) => ({ ...r, is_dead: r.is_dead === 1 }));
  });
  electron.ipcMain.handle("combat:add-creature", (_e, encounterId, articleId, maxHp) => {
    const { cnt } = db.prepare(
      "SELECT COUNT(*) as cnt FROM combat_creatures WHERE encounter_id = ? AND article_id = ?"
    ).get(encounterId, articleId);
    const instanceNumber = cnt + 1;
    const result = db.prepare(`
      INSERT INTO combat_creatures (encounter_id, article_id, instance_number, max_hp, current_hp)
      VALUES (?, ?, ?, ?, ?)
    `).run(encounterId, articleId, instanceNumber, maxHp, maxHp);
    const row = db.prepare(`
      SELECT cc.*, a.title, a.statblock, a.loot_table
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.id = ?
    `).get(result.lastInsertRowid);
    return { ...row, is_dead: row.is_dead === 1 };
  });
  electron.ipcMain.handle("combat:save-creatures", (_e, creatures) => {
    const stmt = db.prepare(`
      UPDATE combat_creatures
      SET current_hp = @current_hp, ac_override = @ac_override,
          is_dead = @is_dead, initiative = @initiative,
          resources = @resources
      WHERE id = @id
    `);
    const transaction = db.transaction((list) => {
      for (const c of list) {
        stmt.run({ ...c, is_dead: c.is_dead ? 1 : 0 });
      }
    });
    transaction(creatures);
  });
  electron.ipcMain.handle("combat:save-loot-result", (_e, creatureId, lootResult) => {
    db.prepare("UPDATE combat_creatures SET loot_result = ? WHERE id = ?").run(JSON.stringify(lootResult), creatureId);
  });
  electron.ipcMain.handle("combat:get-loot-results", (_e, encounterId) => {
    return db.prepare(
      "SELECT id, loot_result FROM combat_creatures WHERE encounter_id = ?"
    ).all(encounterId);
  });
  electron.ipcMain.handle("statblock:open-window", async (_e, articleId) => {
    const existing = electron.BrowserWindow.getAllWindows().find((w) => {
      try {
        const url = w.webContents.getURL();
        return url.includes(`articleId=${articleId}`) && url.includes("mode=statblock");
      } catch {
        return false;
      }
    });
    if (existing) {
      existing.focus();
      return;
    }
    const win = new electron.BrowserWindow({
      width: 420,
      height: 650,
      minWidth: 360,
      minHeight: 400,
      title: "Stat Block",
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false
      }
    });
    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?mode=statblock&articleId=${articleId}`);
    } else {
      win.loadFile(path.join(__dirname, "../../index.html"), {
        query: { mode: "statblock", articleId: String(articleId) }
      });
    }
  });
  electron.ipcMain.handle("file:select-image", async () => {
    if (!mainWindow) return null;
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      title: "Select Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const srcPath = result.filePaths[0];
    const baseName = `img_${Date.now()}`;
    const filename = processAndSaveImage(srcPath, imagesPath, baseName, 1200, 85);
    return `images/${filename}`;
  });
  electron.ipcMain.handle("file:get-image-path", (_e, relativePath) => {
    const userDataPath = electron.app.getPath("userData");
    return `file://${path.join(userDataPath, relativePath)}`;
  });
  electron.ipcMain.handle("backup:export", async () => {
    if (!mainWindow) return { success: false, error: "No window" };
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      title: "Choose Backup Destination Folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    try {
      const userDataPath = electron.app.getPath("userData");
      db.pragma("wal_checkpoint(TRUNCATE)");
      const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const backupDir = path.join(result.filePaths[0], `dm-forge-backup-${date}`);
      fs.mkdirSync(backupDir, { recursive: true });
      const dbSrc = path.join(userDataPath, "dmforge.db");
      if (fs.existsSync(dbSrc)) fs.copyFileSync(dbSrc, path.join(backupDir, "dmforge.db"));
      const imgSrc = path.join(userDataPath, "images");
      const imgDst = path.join(backupDir, "images");
      if (fs.existsSync(imgSrc)) {
        fs.mkdirSync(imgDst, { recursive: true });
        for (const file of fs.readdirSync(imgSrc)) {
          fs.copyFileSync(path.join(imgSrc, file), path.join(imgDst, file));
        }
      }
      return { success: true, path: backupDir };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("backup:import", async () => {
    if (!mainWindow) return { success: false, error: "No window" };
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      title: "Select Backup Folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const backupDir = result.filePaths[0];
    const backupDb = path.join(backupDir, "dmforge.db");
    if (!fs.existsSync(backupDb)) {
      return { success: false, error: "No dmforge.db found in the selected folder" };
    }
    try {
      const userDataPath = electron.app.getPath("userData");
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
      fs.copyFileSync(backupDb, path.join(userDataPath, "dmforge.db"));
      const backupImages = path.join(backupDir, "images");
      const imagesDir = path.join(userDataPath, "images");
      if (fs.existsSync(backupImages)) {
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        for (const file of fs.readdirSync(backupImages)) {
          fs.copyFileSync(path.join(backupImages, file), path.join(imagesDir, file));
        }
      }
      electron.app.relaunch();
      electron.app.exit(0);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
electron.app.whenReady().then(() => {
  const { imagesPath } = initDatabase();
  registerIPC(imagesPath);
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
