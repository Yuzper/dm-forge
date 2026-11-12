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
    // Second pass only. A video's still can only be captured by the page, so the
    // first pass hands back needsFrame and the page calls again with the frame.
    resume?: { scenePath: string; animationSrc: string; stillDataUrl: string },
  ) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'No window' }

    let scenePath: string
    if (resume) {
      scenePath = resume.scenePath
    } else {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Import a VTT map (Dungeon Alchemist, Foundry, Universal VTT)',
        filters: [
          { name: 'VTT scenes', extensions: ['dd2vtt', 'uvtt', 'df2vtt', 'json'] },
          { name: 'All files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      })
      if (picked.canceled || !picked.filePaths.length) return { success: false, canceled: true }
      scenePath = picked.filePaths[0]
    }

    let parsed: ParsedVTT
    try {
      parsed = parseVTT(fs.readFileSync(scenePath, 'utf8'))
    } catch (e) {
      const msg = e instanceof VTTParseError ? e.message : `Could not read that file: ${String(e)}`
      log.warn('VTT import failed:', msg)
      return { success: false, error: msg }
    }

    // Where the picture comes from, best first:
    //   1. Embedded in the file (a Universal VTT export of a still map).
    //   2. A file beside the scene with the same name -- Dungeon Alchemist leaves
    //      the image out when it exports an animation, and writes Name.mp4 next
    //      to Name.dd2vtt instead. That also supplies the animation.
    //   3. Ask. Foundry scenes only name an image, so this was always the case there.
    // An animation found beside the scene is attached whichever way the still arrived.
    let storedPath: string
    let animationSrc: string | null = resume?.animationSrc ?? null
    const baseName = `map_vtt_${owner.kind}_${owner.id}_${Date.now()}`
    const sibling = (exts: string[]) => {
      const dir = path.dirname(scenePath)
      const stem = path.basename(scenePath, path.extname(scenePath)).toLowerCase()
      let names: string[] = []
      try { names = fs.readdirSync(dir) } catch { /* unreadable folder: fall through to asking */ }
      return names
        .filter(n => path.basename(n, path.extname(n)).toLowerCase() === stem
          && exts.includes(path.extname(n).slice(1).toLowerCase()))
        .sort((x, y) => exts.indexOf(path.extname(x).slice(1).toLowerCase()) - exts.indexOf(path.extname(y).slice(1).toLowerCase()))
        .map(n => path.join(dir, n))[0] ?? null
    }
    const isVideo = (f: string) => ['mp4', 'webm', 'm4v'].includes(path.extname(f).slice(1).toLowerCase())

    try {
      if (!animationSrc) animationSrc = sibling(['mp4', 'webm', 'm4v', 'gif'])

      if (resume) {
        const m = /^data:image\/jpeg;base64,(.+)$/.exec(resume.stillDataUrl)
        if (!m) return { success: false, error: 'The captured frame was not a usable image.' }
        const out = `${baseName}.jpg`
        fs.writeFileSync(path.join(imagesPath, out), Buffer.from(m[1], 'base64'))
        storedPath = `images/${out}`
      } else if (parsed.imageBase64) {
        // Write the embedded PNG to a scratch file so it goes through exactly
        // the same downscale/encode path as every other map image.
        const tmp = path.join(app.getPath('temp'), `${baseName}.png`)
        fs.writeFileSync(tmp, decodeEmbeddedImage(parsed.imageBase64))
        storedPath = `images/${processAndSaveImage(tmp, imagesPath, baseName, MAX_MAP_WIDTH, 85)}`
        try { fs.unlinkSync(tmp) } catch { /* scratch file; losing it is harmless */ }
      } else {
        let imageFile = sibling(['png', 'jpg', 'jpeg', 'webp'])
        if (!imageFile && animationSrc && !isVideo(animationSrc)) imageFile = animationSrc   // a GIF: first frame
        if (!imageFile && animationSrc) {
          // A video with no still anywhere. Only the page can decode one.
          return { success: false, needsFrame: { scenePath, animationSrc } }
        }
        if (!imageFile) {
          const img = await dialog.showOpenDialog(mainWindow, {
            title: 'Select the map image that goes with this scene',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
            properties: ['openFile'],
          })
          if (img.canceled || !img.filePaths.length) return { success: false, canceled: true }
          imageFile = img.filePaths[0]
        }
        storedPath = `images/${processAndSaveImage(imageFile, imagesPath, baseName, MAX_MAP_WIDTH, 85)}`
      }
    } catch (e) {
      log.error('VTT import: writing the image failed:', e)
      return { success: false, error: `Could not save the map image: ${String(e)}` }
    }

    // The animation is copied untouched (re-encoding would flatten it), after
    // the still is safely stored.
    let animationPath: string | null = null
    if (animationSrc) {
      try {
        const animName = `anim_${baseName}${path.extname(animationSrc).toLowerCase()}`
        fs.copyFileSync(animationSrc, path.join(imagesPath, animName))
        animationPath = `images/${animName}`
      } catch (e) {
        log.warn('VTT import: could not copy the animation, importing the still only:', e)
      }
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
        INSERT INTO maps (campaign_id, session_id, article_id, name, image_path, animation_path, sort_order, grid)
        VALUES (@campaign_id, @session_id, @article_id, @name, @image_path, @animation_path, @sort_order, @grid)
      `).run({
        campaign_id: owner.kind === 'campaign' ? owner.id : null,
        session_id: owner.kind === 'session' ? owner.id : null,
        article_id: owner.kind === 'article' ? owner.id : null,
        name,
        image_path: storedPath,
        animation_path: animationPath,
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
