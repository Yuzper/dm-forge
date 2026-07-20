// path: electron/main/ipc/maps.ts
import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import { db } from '../db'
import { getMainWindow } from '../window'
import { processAndSaveImage, extractInlineImagePaths, safeUnlink, safeUnlinkRelative } from '../helpers'

export function registerMapIPC(imagesPath: string) {

  // Opens the native file explorer (defaulting to the app's images folder) so the
  // user can either import a fresh image or simply re-pick one that was already
  // imported. If the chosen file already lives in our images dir we reference it
  // directly — that's the "reuse" path, no duplicate copy or re-encode.
  async function pickMapImage(
    title: string,
    baseNamePrefix: string,
  ): Promise<{ path: string; name: string } | null> {
    const mainWindow = getMainWindow()
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

  // A layer's linked sessions, used to label visits ("Sessions 13–15").
  function getLayersWithSessions(mapId: number) {
    const layers = db.prepare(`
      SELECT l.*, (SELECT COUNT(*) FROM pois p WHERE p.layer_id = l.id) AS poi_count
      FROM map_layers l WHERE l.map_id = ? ORDER BY l.created_at ASC
    `).all(mapId) as any[]
    const links = db.prepare(`
      SELECT sm.layer_id, s.id AS session_id, s.session_number, s.session_sub, s.name, s.is_draft
      FROM session_maps sm JOIN sessions s ON s.id = sm.session_id
      WHERE sm.map_id = ? ORDER BY s.session_number ASC, s.session_sub ASC
    `).all(mapId) as any[]
    for (const l of layers) l.sessions = links.filter(x => x.layer_id === l.id)
    return layers
  }

  // One attached-map row in the same shape maps:get-all returns.
  function getAttachedMap(sessionId: number, mapId: number) {
    return db.prepare(`
      SELECT m.*, sm.layer_id AS layer_id, 1 AS attached, a.title AS article_title,
        (SELECT COUNT(*) FROM pois p
          WHERE p.map_id = m.id AND (p.layer_id IS NULL OR p.layer_id = sm.layer_id)) AS poi_count
      FROM session_maps sm
      JOIN maps m ON m.id = sm.map_id
      LEFT JOIN articles a ON a.id = m.article_id
      WHERE sm.session_id = ? AND sm.map_id = ?
    `).get(sessionId, mapId)
  }

  // Highest tab sort_order across BOTH owned maps and attached links for a
  // session — new tabs append after everything, and reorder assigns a single
  // index space so owned and attached tabs can be freely interleaved.
  function maxSessionTabOrder(sessionId: number): number {
    const a = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM maps WHERE session_id = ?').get(sessionId) as { m: number }
    const b = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM session_maps WHERE session_id = ?').get(sessionId) as { m: number }
    return Math.max(a.m, b.m)
  }

  // Session tab bar: owned maps + attached article maps, in one shared order.
  // sort_order lives in maps (owned) or session_maps (attached); the two are
  // merged and sorted together. Ties break owned-before-attached so the
  // default (pre-reorder) order matches how tabs were historically shown.
  ipcMain.handle('maps:get-all', (_e, sessionId: number) => {
    const owned = db.prepare(`
      SELECT m.*, NULL AS layer_id, 0 AS attached, NULL AS article_title, COUNT(p.id) as poi_count
      FROM maps m
      LEFT JOIN pois p ON p.map_id = m.id
      WHERE m.session_id = ?
      GROUP BY m.id
    `).all(sessionId) as any[]
    const attached = db.prepare(`
      SELECT m.*, sm.sort_order AS sort_order, sm.layer_id AS layer_id, 1 AS attached, a.title AS article_title,
        (SELECT COUNT(*) FROM pois p
          WHERE p.map_id = m.id AND (p.layer_id IS NULL OR p.layer_id = sm.layer_id)) AS poi_count
      FROM session_maps sm
      JOIN maps m ON m.id = sm.map_id
      LEFT JOIN articles a ON a.id = m.article_id
      WHERE sm.session_id = ?
    `).all(sessionId) as any[]
    return [...owned, ...attached].sort((x, y) =>
      (x.sort_order - y.sort_order) || (x.attached - y.attached) ||
      (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : 0))
  })

  // Persist a full session tab order. Each item is written to the table that
  // owns its sort_order (maps for owned tabs, session_maps for attached).
  ipcMain.handle('maps:reorder-tabs', (_e, sessionId: number, items: { map_id: number; attached: boolean; sort_order: number }[]) => {
    const ownedStmt = db.prepare('UPDATE maps SET sort_order = @sort_order WHERE id = @map_id')
    const attStmt = db.prepare('UPDATE session_maps SET sort_order = @sort_order WHERE session_id = @session_id AND map_id = @map_id')
    db.transaction((list: typeof items) => {
      for (const it of list) {
        if (it.attached) attStmt.run({ session_id: sessionId, map_id: it.map_id, sort_order: it.sort_order })
        else ownedStmt.run({ map_id: it.map_id, sort_order: it.sort_order })
      }
    })(items)
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
    // Append after existing tabs. For a session-owned map that means after
    // attached tabs too (shared tab order); otherwise after same-parent maps.
    const base = full.session_id != null
      ? maxSessionTabOrder(full.session_id)
      : (db.prepare(
          `SELECT COALESCE(MAX(sort_order), -1) AS m FROM maps
           WHERE session_id IS @session_id AND article_id IS @article_id AND campaign_id IS @campaign_id`
        ).get(full) as { m: number }).m
    const result = db.prepare(
      'INSERT INTO maps (session_id, article_id, campaign_id, name, image_path, sort_order) VALUES (@session_id, @article_id, @campaign_id, @name, @image_path, @sort_order)'
    ).run({ ...full, sort_order: base + 1 })
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
    // Replacing the image orphans the old file unless another map shares it.
    const old = data.image_path !== undefined
      ? db.prepare('SELECT image_path FROM maps WHERE id = ?').get(id) as { image_path: string } | undefined
      : undefined
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE maps SET ${fields} WHERE id = @id`).run({ ...data, id })
    if (old && old.image_path !== data.image_path) {
      const { c } = db.prepare('SELECT COUNT(*) AS c FROM maps WHERE image_path = ?').get(old.image_path) as { c: number }
      if (c === 0) safeUnlinkRelative(old.image_path, app.getPath('userData'))
    }
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
    const map = db.prepare('SELECT image_path, content FROM maps WHERE id = ?').get(id) as { image_path: string; content?: string } | undefined
    const pois = db.prepare('SELECT content FROM pois WHERE map_id = ?').all(id) as { content: string }[]
    db.prepare('DELETE FROM maps WHERE id = ?').run(id)
    for (const p of pois) extractInlineImagePaths(p.content, userDataPath).forEach(safeUnlink)
    // Scene bodies can hold inline images too — clean those up.
    if (map?.content) extractInlineImagePaths(map.content, userDataPath).forEach(safeUnlink)
    if (map?.image_path) {
      // The image may be shared with another map (picker reuse) — ref-count first.
      const { c } = db.prepare('SELECT COUNT(*) AS c FROM maps WHERE image_path = ?').get(map.image_path) as { c: number }
      if (c === 0) safeUnlinkRelative(map.image_path, userDataPath)
    }
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

  // ── Visit layers & session attachments ───────────────────────────────────────

  // Article-owned image maps a session could attach, with their existing visit
  // layers (so the picker can offer "continue visit" vs "start new visit").
  ipcMain.handle('maps:get-attachable', (_e, campaignId: number) => {
    const maps = db.prepare(`
      SELECT m.*, a.title AS article_title
      FROM maps m JOIN articles a ON a.id = m.article_id
      WHERE a.campaign_id = ? AND m.image_path <> ''
      ORDER BY a.title COLLATE NOCASE ASC, m.sort_order ASC, m.created_at ASC
    `).all(campaignId) as any[]
    for (const m of maps) m.layers = getLayersWithSessions(m.id)
    return maps
  })

  ipcMain.handle('maps:get-layers', (_e, mapId: number) =>
    getLayersWithSessions(mapId))

  // layerId null → start a new visit (fresh layer); otherwise continue that one.
  ipcMain.handle('maps:attach-to-session', (_e, sessionId: number, mapId: number, layerId: number | null) => {
    let lid = layerId
    if (lid == null) {
      const r = db.prepare('INSERT INTO map_layers (map_id) VALUES (?)').run(mapId)
      lid = Number(r.lastInsertRowid)
    }
    // Append after every existing tab (owned + attached) in the shared order.
    const sortOrder = maxSessionTabOrder(sessionId) + 1
    db.prepare(`
      INSERT INTO session_maps (session_id, map_id, layer_id, sort_order)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, map_id) DO UPDATE SET layer_id = excluded.layer_id
    `).run(sessionId, mapId, lid, sortOrder)
    return getAttachedMap(sessionId, mapId)
  })

  // Removes only the link; the layer, its POIs and the map itself survive.
  ipcMain.handle('maps:detach-from-session', (_e, sessionId: number, mapId: number) => {
    db.prepare('DELETE FROM session_maps WHERE session_id = ? AND map_id = ?').run(sessionId, mapId)
  })

  ipcMain.handle('maps:update-layer', (_e, layerId: number, data: { name?: string }) => {
    if (data.name !== undefined) {
      db.prepare('UPDATE map_layers SET name = ? WHERE id = ?').run(data.name, layerId)
    }
    return db.prepare('SELECT * FROM map_layers WHERE id = ?').get(layerId)
  })

  ipcMain.handle('maps:delete-layer', (_e, layerId: number) => {
    // Layer POIs cascade; clean up their inline images like pois:delete does.
    const userDataPath = app.getPath('userData')
    const pois = db.prepare('SELECT content FROM pois WHERE layer_id = ?').all(layerId) as { content: string }[]
    db.prepare('DELETE FROM map_layers WHERE id = ?').run(layerId)
    for (const p of pois) extractInlineImagePaths(p.content, userDataPath).forEach(safeUnlink)
  })

  // ── POIs ──────────────────────────────────────────────────────────────────────

  ipcMain.handle('pois:get-all', (_e, mapId: number) => {
    return db.prepare('SELECT * FROM pois WHERE map_id = ? ORDER BY created_at ASC').all(mapId)
  })

  ipcMain.handle('pois:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO pois (map_id, label, x, y, content, poi_type, color, layer_id)
      VALUES (@map_id, @label, @x, @y, @content, @poi_type, @color, @layer_id)
    `).run({
      content: '{"type":"doc","content":[]}',
      poi_type: 'location',
      color: '#c8a84b',
      layer_id: null,
      ...data,
    })
    return db.prepare('SELECT * FROM pois WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('pois:update', (_e, id: number, data: any) => {
    const old = data.content !== undefined
      ? db.prepare('SELECT content FROM pois WHERE id = ?').get(id) as { content: string } | undefined
      : undefined
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE pois SET ${fields} WHERE id = @id`).run({ ...data, id })
    // Unlink inline images that were removed from the content in this update.
    if (old && data.content !== old.content) {
      const userDataPath = app.getPath('userData')
      const oldPaths = new Set(extractInlineImagePaths(old.content, userDataPath))
      const newPaths = new Set(extractInlineImagePaths(data.content || '', userDataPath))
      for (const p of oldPaths) { if (!newPaths.has(p)) safeUnlink(p) }
    }
    return db.prepare('SELECT * FROM pois WHERE id = ?').get(id)
  })

  ipcMain.handle('pois:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const poi = db.prepare('SELECT content FROM pois WHERE id = ?').get(id) as { content: string } | undefined
    db.prepare('DELETE FROM pois WHERE id = ?').run(id)
    if (poi?.content) extractInlineImagePaths(poi.content, userDataPath).forEach(safeUnlink)
  })
}
