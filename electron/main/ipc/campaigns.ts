// path: electron/main/ipc/campaigns.ts
import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { db } from '../db'
import { extractInlineImagePaths, safeUnlink, safeUnlinkRelative, unlinkImageRef } from '../helpers'

export function registerCampaignIPC() {

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
      INSERT INTO campaigns (name, description, system, cover_image, uuid)
      VALUES (@name, @description, @system, @cover_image, @uuid)
    `).run({ cover_image: null, uuid: randomUUID(), ...data })
    return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('campaigns:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE campaigns SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id)
  })

  ipcMain.handle('campaigns:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')

    // Collect every file reference owned by this campaign BEFORE the cascade
    // wipes the rows: maps of all three ownerships (session / article /
    // campaign world maps), article images, inline images in article content,
    // session notes, DM note pages and POI descriptions, plus copied sounds.
    const campaign = db.prepare('SELECT cover_image FROM campaigns WHERE id = ?')
      .get(id) as { cover_image: string | null } | undefined
    const maps = db.prepare(`
      SELECT DISTINCT m.image_path FROM maps m
      LEFT JOIN sessions s ON s.id = m.session_id
      LEFT JOIN articles a ON a.id = m.article_id
      WHERE s.campaign_id = ? OR a.campaign_id = ? OR m.campaign_id = ?
    `).all(id, id, id) as { image_path: string }[]
    const pois = db.prepare(`
      SELECT p.content FROM pois p
      JOIN maps m ON m.id = p.map_id
      LEFT JOIN sessions s ON s.id = m.session_id
      LEFT JOIN articles a ON a.id = m.article_id
      WHERE s.campaign_id = ? OR a.campaign_id = ? OR m.campaign_id = ?
    `).all(id, id, id) as { content: string }[]
    const articles = db.prepare(
      'SELECT content, cover_image, portrait_image FROM articles WHERE campaign_id = ?'
    ).all(id) as { content: string; cover_image: string | null; portrait_image: string | null }[]
    const sessionNotes = db.prepare('SELECT notes FROM sessions WHERE campaign_id = ?')
      .all(id) as { notes: string }[]
    const notePages = db.prepare('SELECT content FROM dm_notes_pages WHERE campaign_id = ?')
      .all(id) as { content: string }[]
    const soundFiles = db.prepare(`
      SELECT DISTINCT s.file_path FROM sounds s
      JOIN sound_boards sb ON sb.id = s.board_id
      WHERE sb.campaign_id = ? AND s.file_path LIKE 'sounds/%'
    `).all(id) as { file_path: string }[]

    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)

    // Map images and copied sound files can be shared (the pickers reuse
    // already-imported files), so only unlink what nothing references any more.
    const mapRefs = db.prepare('SELECT COUNT(*) AS c FROM maps WHERE image_path = ?')
    for (const m of maps) {
      if ((mapRefs.get(m.image_path) as { c: number }).c === 0) safeUnlinkRelative(m.image_path, userDataPath)
    }
    const soundRefs = db.prepare('SELECT COUNT(*) AS c FROM sounds WHERE file_path = ?')
    for (const s of soundFiles) {
      if ((soundRefs.get(s.file_path) as { c: number }).c === 0) safeUnlinkRelative(s.file_path, userDataPath)
    }

    unlinkImageRef(campaign?.cover_image, userDataPath)
    for (const article of articles) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink)
      unlinkImageRef(article.cover_image, userDataPath)
      if (!article.portrait_image?.includes('creature_')) unlinkImageRef(article.portrait_image, userDataPath)
    }
    for (const s of sessionNotes) extractInlineImagePaths(s.notes || '', userDataPath).forEach(safeUnlink)
    for (const p of notePages) extractInlineImagePaths(p.content, userDataPath).forEach(safeUnlink)
    for (const p of pois) extractInlineImagePaths(p.content, userDataPath).forEach(safeUnlink)
  })
}
