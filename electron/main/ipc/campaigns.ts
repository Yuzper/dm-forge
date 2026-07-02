// path: electron/main/ipc/campaigns.ts
import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { db } from '../db'
import { extractInlineImagePaths, safeUnlink, safeUnlinkRelative } from '../helpers'

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
}
