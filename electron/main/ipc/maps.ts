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
