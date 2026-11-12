// path: electron/main/ipc/vttImport.ts
// Importing a VTT scene file as a map: the electron shell around the pure
// parser in vttImportCore.ts. Dialog, image writing, DB inserts.
//
// What the import is actually worth: the walls, which are what make
// line-of-sight fog possible, and the grid size, which calibrates the map for
// the table automatically instead of the DM nudging a square-size slider until
// it looks right.
import { app, dialog, ipcMain, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { db } from '../db'
import { getMainWindow } from '../window'
import { processAndSaveImage } from '../helpers'
import { parseVTT, decodeEmbeddedImage, VTTParseError, type ParsedVTT } from './vttImportCore'

/** Matches the cap in pickMapImage, so imported maps behave like any other. */
const MAX_MAP_WIDTH = 4000

export function registerVTTImportIPC(imagesPath: string) {

  /**
   * Import into an existing owner — an article or a session — exactly as the
   * plain image import does, so a VTT map is an ordinary map afterwards and
   * everything downstream (casting, POIs, visits) just works.
   */
  ipcMain.handle('vtt:import-map', async (
    _e,
    owner: { kind: 'article' | 'session' | 'campaign'; id: number },
  ) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'No window' }

    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Import a VTT map (Dungeon Alchemist, Foundry, Universal VTT)',
      filters: [
        { name: 'VTT scenes', extensions: ['dd2vtt', 'uvtt', 'df2vtt', 'json'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths.length) return { success: false, canceled: true }
    const scenePath = picked.filePaths[0]

    let parsed: ParsedVTT
    try {
      parsed = parseVTT(fs.readFileSync(scenePath, 'utf8'))
    } catch (e) {
      const msg = e instanceof VTTParseError ? e.message : `Could not read that file: ${String(e)}`
      log.warn('VTT import failed:', msg)
      return { success: false, error: msg }
    }

    // Universal VTT carries its own picture. Foundry only names one, so ask.
    let storedPath: string
    const baseName = `map_vtt_${owner.kind}_${owner.id}_${Date.now()}`
    try {
      if (parsed.imageBase64) {
        // Write the embedded PNG to a scratch file so it goes through exactly
        // the same downscale/encode path as every other map image.
        const tmp = path.join(app.getPath('temp'), `${baseName}.png`)
        fs.writeFileSync(tmp, decodeEmbeddedImage(parsed.imageBase64))
        storedPath = `images/${processAndSaveImage(tmp, imagesPath, baseName, MAX_MAP_WIDTH, 85)}`
        try { fs.unlinkSync(tmp) } catch { /* scratch file; losing it is harmless */ }
      } else {
        const img = await dialog.showOpenDialog(mainWindow, {
          title: 'Select the map image that goes with this scene',
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
          properties: ['openFile'],
        })
        if (img.canceled || !img.filePaths.length) return { success: false, canceled: true }
        storedPath = `images/${processAndSaveImage(img.filePaths[0], imagesPath, baseName, MAX_MAP_WIDTH, 85)}`
      }
    } catch (e) {
      log.error('VTT import: writing the image failed:', e)
      return { success: false, error: `Could not save the map image: ${String(e)}` }
    }

    // The grid is stored in pixels of the image we actually kept, which is not
    // the image the file described if it was wider than the cap. Measure what
    // landed on disk rather than assuming.
    const abs = path.join(app.getPath('userData'), storedPath)
    const storedWidth = nativeImage.createFromPath(abs).getSize().width || parsed.imageSize.w
    const factor = parsed.imageSize.w > 0 ? storedWidth / parsed.imageSize.w : 1
    const gridSquare = parsed.pixelsPerGrid * factor

    const name = parsed.name?.trim() || path.basename(scenePath).replace(/\.[^.]+$/, '')

    const { m } = db.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM maps WHERE ${ownerColumn(owner.kind)} = ?`,
    ).get(owner.id) as { m: number }

    const insert = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO maps (campaign_id, session_id, article_id, name, image_path, sort_order, grid)
        VALUES (@campaign_id, @session_id, @article_id, @name, @image_path, @sort_order, @grid)
      `).run({
        campaign_id: owner.kind === 'campaign' ? owner.id : null,
        session_id: owner.kind === 'session' ? owner.id : null,
        article_id: owner.kind === 'article' ? owner.id : null,
        name,
        image_path: storedPath,
        sort_order: m + 1,
        grid: JSON.stringify({ square: gridSquare, offsetX: 0, offsetY: 0 }),
      })
      const mapId = Number(res.lastInsertRowid)

      const stmt = db.prepare(`
        INSERT INTO map_walls (map_id, x1, y1, x2, y2, kind, door_open, sort_order)
        VALUES (@map_id, @x1, @y1, @x2, @y2, @kind, @door_open, @sort_order)
      `)
      parsed.walls.forEach((w, i) => stmt.run({
        map_id: mapId,
        x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
        kind: w.kind, door_open: w.doorOpen ? 1 : 0, sort_order: i,
      }))
      return mapId
    })

    let mapId: number
    try {
      mapId = insert()
    } catch (e) {
      log.error('VTT import: writing the map failed:', e)
      return { success: false, error: `Could not save the map: ${String(e)}` }
    }

    const doors = parsed.walls.filter(w => w.kind === 'door').length
    log.info(`VTT import: ${parsed.source}, ${parsed.walls.length} walls (${doors} doors), grid ${gridSquare.toFixed(1)}px`)

    return {
      success: true,
      mapId,
      source: parsed.source,
      walls: parsed.walls.length,
      doors,
      gridSquare,
    }
  })

  // ── Walls ───────────────────────────────────────────────────────────────────

  ipcMain.handle('walls:get-all', (_e, mapId: number) =>
    db.prepare('SELECT * FROM map_walls WHERE map_id = ? ORDER BY sort_order ASC, id ASC').all(mapId))

  ipcMain.handle('walls:create', (_e, data: any) => {
    const { m } = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM map_walls WHERE map_id = ?',
    ).get(data.map_id) as { m: number }
    const res = db.prepare(`
      INSERT INTO map_walls (map_id, x1, y1, x2, y2, kind, door_open, sort_order)
      VALUES (@map_id, @x1, @y1, @x2, @y2, @kind, @door_open, @sort_order)
    `).run({
      map_id: data.map_id,
      x1: data.x1, y1: data.y1, x2: data.x2, y2: data.y2,
      kind: data.kind ?? 'wall',
      door_open: data.door_open ?? 0,
      sort_order: m + 1,
    })
    return db.prepare('SELECT * FROM map_walls WHERE id = ?').get(res.lastInsertRowid)
  })

  ipcMain.handle('walls:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    if (!fields) return db.prepare('SELECT * FROM map_walls WHERE id = ?').get(id)
    db.prepare(`UPDATE map_walls SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM map_walls WHERE id = ?').get(id)
  })

  ipcMain.handle('walls:delete', (_e, id: number) => {
    db.prepare('DELETE FROM map_walls WHERE id = ?').run(id)
    return true
  })

  /** Clearing every wall, for when an import lands badly and you start over. */
  ipcMain.handle('walls:clear', (_e, mapId: number) => {
    const res = db.prepare('DELETE FROM map_walls WHERE map_id = ?').run(mapId)
    return res.changes
  })
}

function ownerColumn(kind: 'article' | 'session' | 'campaign'): string {
  return kind === 'article' ? 'article_id' : kind === 'session' ? 'session_id' : 'campaign_id'
}
